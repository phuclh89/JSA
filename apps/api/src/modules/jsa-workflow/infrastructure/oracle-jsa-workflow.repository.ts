import { Injectable } from '@nestjs/common';
import oracledb from 'oracledb';
import {
  OptimisticLockError,
  StateConflictError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { JsaWorkflowRepository } from '../domain/jsa-workflow.repository';
import type {
  AssigneeRecord,
  SaveWorkflowDefinitionInput,
  WorkflowBindingRecord,
  WorkflowRuntimeRecord,
  WorkflowStepRecord,
  WorkflowTarget,
} from '../domain/jsa-workflow.types';
type Row = Record<string, any>;
const options = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;
@Injectable()
export class OracleJsaWorkflowRepository implements JsaWorkflowRepository {
  async target(
    context: OracleTransactionContext,
    jsaId: string,
    lock = false,
  ): Promise<WorkflowTarget | undefined> {
    assertOracleId(jsaId);
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID,TO_CHAR(V.JSA_VERSION_ID) VERSION_ID,M.JSA_NUMBER,V.JOB_TITLE,TO_CHAR(M.OWNER_SITE_ID) SITE_ID,TO_CHAR(M.RIG_ID) RIG_ID,TO_CHAR(M.DEPARTMENT_ID) DEPARTMENT_ID,TO_CHAR(V.JOB_TYPE_ID) JOB_TYPE_ID,TO_CHAR(M.CREATOR_USER_ID) CREATOR_USER_ID,M.LIFECYCLE_STATUS MASTER_STATUS,V.VERSION_STATUS,TO_CHAR(M.ROW_VERSION) MASTER_ROW_VERSION,TO_CHAR(V.ROW_VERSION) VERSION_ROW_VERSION FROM JSA_MASTER M JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.WORKING_VERSION_ID WHERE M.JSA_ID=:jsaId${lock ? ' FOR UPDATE' : ''}`,
      { jsaId },
      options,
    );
    const r = result.rows?.[0];
    return r
      ? {
          jsaId: r.JSA_ID,
          versionId: r.VERSION_ID,
          jsaNumber: r.JSA_NUMBER,
          ...(r.JOB_TITLE ? { jobTitle: r.JOB_TITLE } : {}),
          siteId: r.SITE_ID,
          rigId: r.RIG_ID,
          departmentId: r.DEPARTMENT_ID,
          jobTypeId: r.JOB_TYPE_ID,
          creatorUserId: r.CREATOR_USER_ID,
          masterStatus: r.MASTER_STATUS,
          versionStatus: r.VERSION_STATUS,
          masterRowVersion: r.MASTER_ROW_VERSION,
          versionRowVersion: r.VERSION_ROW_VERSION,
        }
      : undefined;
  }
  async bindings(
    context: OracleTransactionContext,
    t: WorkflowTarget,
  ): Promise<WorkflowBindingRecord[]> {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(B.BINDING_ID) BINDING_ID,TO_CHAR(B.DEFINITION_ID) DEFINITION_ID,D.DEFINITION_CODE,D.VERSION_NUMBER,B.PRIORITY_NUMBER,(CASE WHEN B.SITE_ID IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN B.RIG_ID IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN B.DEPARTMENT_ID IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN B.JOB_TYPE_ID IS NOT NULL THEN 1 ELSE 0 END) SPECIFICITY FROM JSA_WORKFLOW_BINDING B JOIN JSA_WORKFLOW_DEFINITION D ON D.DEFINITION_ID=B.DEFINITION_ID WHERE B.IS_ACTIVE='Y' AND D.STATUS_CODE='ACTIVE' AND B.EFFECTIVE_FROM<=SYSTIMESTAMP AND (B.EFFECTIVE_TO IS NULL OR B.EFFECTIVE_TO>=SYSTIMESTAMP) AND (D.EFFECTIVE_FROM IS NULL OR D.EFFECTIVE_FROM<=SYSTIMESTAMP) AND (D.EFFECTIVE_TO IS NULL OR D.EFFECTIVE_TO>=SYSTIMESTAMP) AND (B.SITE_ID IS NULL OR B.SITE_ID=:siteId) AND (B.RIG_ID IS NULL OR B.RIG_ID=:rigId) AND (B.DEPARTMENT_ID IS NULL OR B.DEPARTMENT_ID=:departmentId) AND (B.JOB_TYPE_ID IS NULL OR B.JOB_TYPE_ID=:jobTypeId) ORDER BY SPECIFICITY DESC,B.PRIORITY_NUMBER,B.BINDING_ID`,
      { siteId: t.siteId, rigId: t.rigId, departmentId: t.departmentId, jobTypeId: t.jobTypeId },
      options,
    );
    return (result.rows ?? []).map((r) => ({
      bindingId: r.BINDING_ID,
      definitionId: r.DEFINITION_ID,
      definitionCode: r.DEFINITION_CODE,
      definitionVersion: r.VERSION_NUMBER,
      priority: r.PRIORITY_NUMBER,
      specificity: r.SPECIFICITY,
    }));
  }
  async steps(
    context: OracleTransactionContext,
    definitionId: string,
  ): Promise<WorkflowStepRecord[]> {
    assertOracleId(definitionId);
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(STEP_ID) STEP_ID,STEP_ORDER,STEP_CODE,STEP_NAME,VERSION_STATUS,WORKFLOW_ROLE_CODE,OPTIONAL_FLAG,CONDITION_TYPE,CONDITION_VALUE FROM JSA_WORKFLOW_STEP WHERE DEFINITION_ID=:definitionId AND IS_ACTIVE='Y' ORDER BY STEP_ORDER`,
      { definitionId },
      options,
    );
    return (result.rows ?? []).map((r) => ({
      stepId: r.STEP_ID,
      order: r.STEP_ORDER,
      code: r.STEP_CODE,
      name: r.STEP_NAME,
      versionStatus: r.VERSION_STATUS,
      roleCode: r.WORKFLOW_ROLE_CODE,
      optional: r.OPTIONAL_FLAG === 'Y',
      conditionType: r.CONDITION_TYPE,
      ...(r.CONDITION_VALUE ? { conditionValue: r.CONDITION_VALUE } : {}),
    }));
  }
  async assignees(
    context: OracleTransactionContext,
    t: WorkflowTarget,
    roleCode: string,
    approvePermission: string,
  ): Promise<AssigneeRecord[]> {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(U.USER_ID) USER_ID,U.DISPLAY_NAME,MAX(CASE WHEN A.RIG_ID IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN A.DEPARTMENT_ID IS NOT NULL THEN 1 ELSE 0 END) SPECIFICITY FROM JSA_WF_ROLE_ASSIGNMENT A JOIN SYS_USER U ON U.USER_ID=A.USER_ID AND U.IS_ACTIVE='Y' WHERE A.WORKFLOW_ROLE_CODE=:roleCode AND A.SITE_ID=:siteId AND (A.RIG_ID IS NULL OR A.RIG_ID=:rigId) AND (A.DEPARTMENT_ID IS NULL OR A.DEPARTMENT_ID=:departmentId) AND A.IS_ACTIVE='Y' AND A.EFFECTIVE_FROM<=SYSTIMESTAMP AND (A.EFFECTIVE_TO IS NULL OR A.EFFECTIVE_TO>=SYSTIMESTAMP) AND NOT EXISTS(SELECT 1 FROM SYS_USER_PERMISSION_OVERRIDE O JOIN SYS_PERMISSION P ON P.PERMISSION_ID=O.PERMISSION_ID AND P.IS_ACTIVE='Y' WHERE O.USER_ID=U.USER_ID AND O.IS_ACTIVE='Y' AND O.EFFECTIVE_FROM<=SYSTIMESTAMP AND (O.EFFECTIVE_TO IS NULL OR O.EFFECTIVE_TO>=SYSTIMESTAMP) AND O.EFFECT_CODE='DENY' AND P.PERMISSION_CODE=:approvePermission) AND (EXISTS(SELECT 1 FROM SYS_USER_PERMISSION_OVERRIDE O JOIN SYS_PERMISSION P ON P.PERMISSION_ID=O.PERMISSION_ID AND P.IS_ACTIVE='Y' WHERE O.USER_ID=U.USER_ID AND O.IS_ACTIVE='Y' AND O.EFFECTIVE_FROM<=SYSTIMESTAMP AND (O.EFFECTIVE_TO IS NULL OR O.EFFECTIVE_TO>=SYSTIMESTAMP) AND O.EFFECT_CODE='ALLOW' AND P.PERMISSION_CODE=:approvePermission) OR EXISTS(SELECT 1 FROM SYS_USER_ROLE UR JOIN SYS_ROLE_PERMISSION RP ON RP.ROLE_ID=UR.ROLE_ID AND RP.IS_ACTIVE='Y' JOIN SYS_PERMISSION P ON P.PERMISSION_ID=RP.PERMISSION_ID AND P.IS_ACTIVE='Y' WHERE UR.USER_ID=U.USER_ID AND UR.IS_ACTIVE='Y' AND P.PERMISSION_CODE=:approvePermission)) AND EXISTS(SELECT 1 FROM SYS_USER_DATA_SCOPE S WHERE S.USER_ID=U.USER_ID AND S.IS_ACTIVE='Y' AND S.EFFECTIVE_FROM<=SYSTIMESTAMP AND (S.EFFECTIVE_TO IS NULL OR S.EFFECTIVE_TO>=SYSTIMESTAMP) AND S.CAN_ACT='Y' AND S.SITE_ID=:siteId AND (S.SCOPE_TYPE='SITE' OR (S.SCOPE_TYPE='RIG' AND S.RIG_ID=:rigId) OR (S.SCOPE_TYPE='DEPARTMENT' AND S.DEPARTMENT_ID=:departmentId AND (S.RIG_ID IS NULL OR S.RIG_ID=:rigId)))) GROUP BY U.USER_ID,U.DISPLAY_NAME ORDER BY SPECIFICITY DESC,U.USER_ID`,
      {
        roleCode,
        approvePermission,
        siteId: t.siteId,
        rigId: t.rigId,
        departmentId: t.departmentId,
      },
      options,
    );
    const rows = result.rows ?? [];
    const max = rows[0]?.SPECIFICITY;
    return rows
      .filter((r) => r.SPECIFICITY === max)
      .map((r) => ({ userId: r.USER_ID, displayName: r.DISPLAY_NAME, specificity: r.SPECIFICITY }));
  }
  async submissionIssues(context: OracleTransactionContext, versionId: string): Promise<string[]> {
    const result = await context.connection.execute<Row>(
      `SELECT ISSUE FROM (SELECT 'Job title is required' ISSUE FROM JSA_VERSION WHERE JSA_VERSION_ID=:versionId AND TRIM(JOB_TITLE) IS NULL UNION ALL SELECT 'At least one Task is required' FROM DUAL WHERE NOT EXISTS(SELECT 1 FROM JSA_VERSION_TASK WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y') UNION ALL SELECT 'Every Task requires a Hazard' FROM DUAL WHERE EXISTS(SELECT 1 FROM JSA_VERSION_TASK T WHERE T.JSA_VERSION_ID=:versionId AND T.IS_ACTIVE='Y' AND NOT EXISTS(SELECT 1 FROM JSA_VERSION_HAZARD H WHERE H.VERSION_TASK_ID=T.VERSION_TASK_ID AND H.IS_ACTIVE='Y')) UNION ALL SELECT 'Every Hazard requires a Control and both Risk ratings' FROM DUAL WHERE EXISTS(SELECT 1 FROM JSA_VERSION_HAZARD H WHERE H.JSA_VERSION_ID=:versionId AND H.IS_ACTIVE='Y' AND (H.INITIAL_CELL_ID IS NULL OR H.RESIDUAL_CELL_ID IS NULL OR H.RESIDUAL_PROHIBITED_FLAG='Y' OR NOT EXISTS(SELECT 1 FROM JSA_VERSION_CONTROL C WHERE C.VERSION_HAZARD_ID=H.VERSION_HAZARD_ID AND C.IS_ACTIVE='Y'))) UNION ALL SELECT 'At least one complete Basic Job Step is required' FROM DUAL WHERE NOT EXISTS(SELECT 1 FROM JSA_VERSION_BASIC_STEP S WHERE S.JSA_VERSION_ID=:versionId AND S.IS_ACTIVE='Y') OR EXISTS(SELECT 1 FROM JSA_VERSION_BASIC_STEP S WHERE S.JSA_VERSION_ID=:versionId AND S.IS_ACTIVE='Y' AND (NOT EXISTS(SELECT 1 FROM JSA_VER_BASIC_STEP_PERFORMER P WHERE P.BASIC_STEP_ID=S.BASIC_STEP_ID AND P.IS_ACTIVE='Y') OR NOT EXISTS(SELECT 1 FROM JSA_VER_BASIC_STEP_SUPERVISOR P WHERE P.BASIC_STEP_ID=S.BASIC_STEP_ID AND P.IS_ACTIVE='Y') OR (S.NO_TOOL_REQUIRED_FLAG='N' AND NOT EXISTS(SELECT 1 FROM JSA_VER_BASIC_STEP_TOOL T WHERE T.BASIC_STEP_ID=S.BASIC_STEP_ID AND T.IS_ACTIVE='Y')))))`,
      { versionId },
      options,
    );
    return (result.rows ?? []).map((r) => r.ISSUE);
  }
  async runtime(
    context: OracleTransactionContext,
    jsaId: string,
    lock = false,
  ): Promise<WorkflowRuntimeRecord | undefined> {
    const t = await this.target(context, jsaId, lock);
    if (!t) return undefined;
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(I.INSTANCE_ID) INSTANCE_ID,I.CYCLE_NUMBER,TO_CHAR(I.DEFINITION_ID) DEFINITION_ID,TO_CHAR(I.BINDING_ID) BINDING_ID,I.INSTANCE_STATUS,I.CURRENT_STEP_ORDER,TO_CHAR(T.WORKFLOW_TASK_ID) CURRENT_TASK_ID,TO_CHAR(T.ASSIGNEE_USER_ID) ASSIGNEE_USER_ID,TO_CHAR(T.STEP_ID) STEP_ID FROM JSA_WORKFLOW_INSTANCE I LEFT JOIN JSA_WORKFLOW_TASK T ON T.INSTANCE_ID=I.INSTANCE_ID AND T.CYCLE_NUMBER=I.CYCLE_NUMBER AND T.TASK_STATUS='PENDING' WHERE I.JSA_VERSION_ID=:versionId${lock ? ' FOR UPDATE OF I.INSTANCE_STATUS' : ''}`,
      { versionId: t.versionId },
      options,
    );
    const r = result.rows?.[0];
    return r
      ? {
          instanceId: r.INSTANCE_ID,
          cycleNumber: r.CYCLE_NUMBER,
          definitionId: r.DEFINITION_ID,
          bindingId: r.BINDING_ID,
          status: r.INSTANCE_STATUS,
          ...(r.CURRENT_STEP_ORDER ? { currentStepOrder: r.CURRENT_STEP_ORDER } : {}),
          ...(r.CURRENT_TASK_ID ? { currentTaskId: r.CURRENT_TASK_ID } : {}),
          ...(r.ASSIGNEE_USER_ID ? { assigneeUserId: r.ASSIGNEE_USER_ID } : {}),
          ...(r.STEP_ID ? { stepId: r.STEP_ID } : {}),
          versionStatus: t.versionStatus,
          target: t,
        }
      : undefined;
  }
  async begin(
    c: OracleTransactionContext,
    t: WorkflowTarget,
    b: WorkflowBindingRecord,
    s: WorkflowStepRecord,
    assigneeId: string,
    userId: string,
    username: string,
    correlationId: string,
  ): Promise<string> {
    const instanceId = await this.next(c, 'SEQ_JSA_WORKFLOW_INST'),
      taskId = await this.next(c, 'SEQ_JSA_WORKFLOW_TASK');
    await c.connection.execute(
      `INSERT INTO JSA_WORKFLOW_INSTANCE(INSTANCE_ID,JSA_ID,JSA_VERSION_ID,DEFINITION_ID,BINDING_ID,CURRENT_STEP_ORDER,CREATED_BY,UPDATED_BY) VALUES(:instanceId,:jsaId,:versionId,:definitionId,:bindingId,:stepOrder,:username,:username)`,
      {
        instanceId,
        jsaId: t.jsaId,
        versionId: t.versionId,
        definitionId: b.definitionId,
        bindingId: b.bindingId,
        stepOrder: s.order,
        username,
      },
    );
    await c.connection.execute(
      `INSERT INTO JSA_WORKFLOW_TASK(WORKFLOW_TASK_ID,INSTANCE_ID,STEP_ID,CYCLE_NUMBER,ASSIGNEE_USER_ID,CREATED_BY,UPDATED_BY) VALUES(:taskId,:instanceId,:stepId,1,:assigneeId,:username,:username)`,
      { taskId, instanceId, stepId: s.stepId, assigneeId, username },
    );
    const v = await c.connection.execute(
      `UPDATE JSA_VERSION SET VERSION_STATUS=:status,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE JSA_VERSION_ID=:versionId AND VERSION_STATUS='DRAFT'`,
      { status: s.versionStatus, username, versionId: t.versionId },
    );
    if (v.rowsAffected !== 1) throw new StateConflictError('Only a Draft JSA may be submitted');
    await this.history(
      c,
      instanceId,
      taskId,
      1,
      'SUBMIT',
      userId,
      username,
      'DRAFT',
      s.versionStatus,
      undefined,
      correlationId,
    );
    await this.notify(
      c,
      assigneeId,
      'APPROVAL_ASSIGNED',
      `Approval required: ${t.jsaNumber}`,
      s.name,
      'JSA_MASTER',
      t.jsaId,
      username,
    );
    return instanceId;
  }
  async resubmit(
    c: OracleTransactionContext,
    r: WorkflowRuntimeRecord,
    s: WorkflowStepRecord,
    assigneeId: string,
    userId: string,
    username: string,
    correlationId: string,
  ): Promise<void> {
    const cycle = r.cycleNumber + 1,
      taskId = await this.next(c, 'SEQ_JSA_WORKFLOW_TASK');
    await c.connection.execute(
      `UPDATE JSA_WORKFLOW_INSTANCE SET INSTANCE_STATUS='ACTIVE',CURRENT_STEP_ORDER=:stepOrder,CYCLE_NUMBER=:cycle,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE INSTANCE_ID=:instanceId AND INSTANCE_STATUS='RETURNED'`,
      { stepOrder: s.order, cycle, username, instanceId: r.instanceId },
    );
    await c.connection.execute(
      `INSERT INTO JSA_WORKFLOW_TASK(WORKFLOW_TASK_ID,INSTANCE_ID,STEP_ID,CYCLE_NUMBER,ASSIGNEE_USER_ID,CREATED_BY,UPDATED_BY) VALUES(:taskId,:instanceId,:stepId,:cycle,:assigneeId,:username,:username)`,
      { taskId, instanceId: r.instanceId, stepId: s.stepId, cycle, assigneeId, username },
    );
    await c.connection.execute(
      `UPDATE JSA_VERSION SET VERSION_STATUS=:status,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE JSA_VERSION_ID=:versionId AND VERSION_STATUS='RETURNED'`,
      { status: s.versionStatus, username, versionId: r.target.versionId },
    );
    await this.history(
      c,
      r.instanceId,
      taskId,
      cycle,
      'RESUBMIT',
      userId,
      username,
      'RETURNED',
      s.versionStatus,
      undefined,
      correlationId,
    );
    await this.notify(
      c,
      assigneeId,
      'APPROVAL_ASSIGNED',
      `Approval required: ${r.target.jsaNumber}`,
      s.name,
      'JSA_MASTER',
      r.target.jsaId,
      username,
    );
  }
  async action(
    c: OracleTransactionContext,
    r: WorkflowRuntimeRecord,
    action: 'APPROVE' | 'RETURN' | 'REJECT' | 'COMMENT',
    comment: string | undefined,
    next: WorkflowStepRecord | undefined,
    nextAssigneeId: string | undefined,
    userId: string,
    username: string,
    correlationId: string,
  ): Promise<void> {
    if (action === 'COMMENT') {
      await this.history(
        c,
        r.instanceId,
        r.currentTaskId,
        r.cycleNumber,
        'COMMENT',
        userId,
        username,
        r.versionStatus,
        r.versionStatus,
        comment,
        correlationId,
      );
      return;
    }
    if (!r.currentTaskId || r.assigneeUserId !== userId)
      throw new StateConflictError('The current approval task is not assigned to this user');
    const taskStatus =
      action === 'APPROVE' ? 'APPROVED' : action === 'RETURN' ? 'RETURNED' : 'REJECTED';
    const task = await c.connection.execute(
      `UPDATE JSA_WORKFLOW_TASK SET TASK_STATUS=:taskStatus,COMPLETED_AT=SYSTIMESTAMP,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE WORKFLOW_TASK_ID=:taskId AND TASK_STATUS='PENDING' AND ASSIGNEE_USER_ID=:userId`,
      { taskStatus, username, taskId: r.currentTaskId, userId },
    );
    if (task.rowsAffected !== 1)
      throw new StateConflictError('Approval task has already been completed');
    if (action === 'RETURN') {
      await c.connection.execute(
        `UPDATE JSA_VERSION SET VERSION_STATUS='RETURNED',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE JSA_VERSION_ID=:versionId`,
        { username, versionId: r.target.versionId },
      );
      await c.connection.execute(
        `UPDATE JSA_WORKFLOW_INSTANCE SET INSTANCE_STATUS='RETURNED',CURRENT_STEP_ORDER=NULL,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE INSTANCE_ID=:instanceId`,
        { username, instanceId: r.instanceId },
      );
      await this.history(
        c,
        r.instanceId,
        r.currentTaskId,
        r.cycleNumber,
        'RETURN',
        userId,
        username,
        r.versionStatus,
        'RETURNED',
        comment,
        correlationId,
      );
      await this.notify(
        c,
        r.target.creatorUserId,
        'JSA_RETURNED',
        `JSA returned: ${r.target.jsaNumber}`,
        comment!,
        'JSA_MASTER',
        r.target.jsaId,
        username,
      );
      return;
    }
    if (action === 'REJECT') {
      await c.connection.execute(
        `UPDATE JSA_VERSION SET VERSION_STATUS='REJECTED',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE JSA_VERSION_ID=:versionId`,
        { username, versionId: r.target.versionId },
      );
      await c.connection.execute(
        `UPDATE JSA_WORKFLOW_INSTANCE SET INSTANCE_STATUS='REJECTED',COMPLETED_AT=SYSTIMESTAMP,CURRENT_STEP_ORDER=NULL,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE INSTANCE_ID=:instanceId`,
        { username, instanceId: r.instanceId },
      );
      await this.history(
        c,
        r.instanceId,
        r.currentTaskId,
        r.cycleNumber,
        'REJECT',
        userId,
        username,
        r.versionStatus,
        'REJECTED',
        comment,
        correlationId,
      );
      await this.notify(
        c,
        r.target.creatorUserId,
        'JSA_REJECTED',
        `JSA rejected: ${r.target.jsaNumber}`,
        comment ?? 'Rejected',
        'JSA_MASTER',
        r.target.jsaId,
        username,
      );
      return;
    }
    await this.history(
      c,
      r.instanceId,
      r.currentTaskId,
      r.cycleNumber,
      'APPROVE',
      userId,
      username,
      r.versionStatus,
      next?.versionStatus ?? 'PUBLISHED',
      comment,
      correlationId,
    );
    if (next && nextAssigneeId) {
      const taskId = await this.next(c, 'SEQ_JSA_WORKFLOW_TASK');
      await c.connection.execute(
        `INSERT INTO JSA_WORKFLOW_TASK(WORKFLOW_TASK_ID,INSTANCE_ID,STEP_ID,CYCLE_NUMBER,ASSIGNEE_USER_ID,CREATED_BY,UPDATED_BY) VALUES(:taskId,:instanceId,:stepId,:cycle,:assigneeId,:username,:username)`,
        {
          taskId,
          instanceId: r.instanceId,
          stepId: next.stepId,
          cycle: r.cycleNumber,
          assigneeId: nextAssigneeId,
          username,
        },
      );
      await c.connection.execute(
        `UPDATE JSA_WORKFLOW_INSTANCE SET CURRENT_STEP_ORDER=:stepOrder,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE INSTANCE_ID=:instanceId`,
        { stepOrder: next.order, username, instanceId: r.instanceId },
      );
      await c.connection.execute(
        `UPDATE JSA_VERSION SET VERSION_STATUS=:status,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE JSA_VERSION_ID=:versionId`,
        { status: next.versionStatus, username, versionId: r.target.versionId },
      );
      await this.notify(
        c,
        nextAssigneeId,
        'APPROVAL_ASSIGNED',
        `Approval required: ${r.target.jsaNumber}`,
        next.name,
        'JSA_MASTER',
        r.target.jsaId,
        username,
      );
      return;
    }
    const version = await c.connection.execute(
      `UPDATE JSA_VERSION SET VERSION_STATUS='PUBLISHED',PUBLISHED_AT=SYSTIMESTAMP,PUBLISHED_BY_USER_ID=:userId,PUBLISHED_BY_USERNAME=:username,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE JSA_VERSION_ID=:versionId AND VERSION_STATUS=:status AND PUBLISHED_AT IS NULL`,
      { userId, username, versionId: r.target.versionId, status: r.versionStatus },
    );
    if (version.rowsAffected !== 1)
      throw new StateConflictError('JSA Version could not be published');
    const master = await c.connection.execute(
      `UPDATE JSA_MASTER SET CURRENT_VERSION_ID=:versionId,WORKING_VERSION_ID=NULL,LIFECYCLE_STATUS='PUBLISHED',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE JSA_ID=:jsaId AND CURRENT_VERSION_ID IS NULL AND WORKING_VERSION_ID=:versionId`,
      { versionId: r.target.versionId, username, jsaId: r.target.jsaId },
    );
    if (master.rowsAffected !== 1)
      throw new StateConflictError('Initial publication requires an empty Current Version pointer');
    await c.connection.execute(
      `UPDATE JSA_WORKFLOW_INSTANCE SET INSTANCE_STATUS='COMPLETED',CURRENT_STEP_ORDER=NULL,COMPLETED_AT=SYSTIMESTAMP,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1 WHERE INSTANCE_ID=:instanceId`,
      { username, instanceId: r.instanceId },
    );
    await this.history(
      c,
      r.instanceId,
      r.currentTaskId,
      r.cycleNumber,
      'PUBLISH',
      userId,
      username,
      r.versionStatus,
      'PUBLISHED',
      undefined,
      correlationId,
    );
    await this.notify(
      c,
      r.target.creatorUserId,
      'JSA_PUBLISHED',
      `JSA published: ${r.target.jsaNumber}`,
      'Initial JSA publication completed',
      'JSA_MASTER',
      r.target.jsaId,
      username,
    );
  }
  async listQueue(
    c: OracleTransactionContext,
    kind: 'approvals' | 'pending' | 'rejected' | 'published',
    userId: string,
  ): Promise<any[]> {
    const clauses = {
      approvals: `T.ASSIGNEE_USER_ID=:userId AND T.TASK_STATUS='PENDING'`,
      pending: `M.CREATOR_USER_ID=:userId AND I.INSTANCE_STATUS IN ('ACTIVE','RETURNED')`,
      rejected: `M.CREATOR_USER_ID=:userId AND I.INSTANCE_STATUS='REJECTED'`,
      published: `M.LIFECYCLE_STATUS='PUBLISHED'`,
    };
    const result = await c.connection.execute<Row>(
      `SELECT TO_CHAR(I.INSTANCE_ID) INSTANCE_ID,TO_CHAR(M.JSA_ID) JSA_ID,M.JSA_NUMBER,V.JOB_TITLE,V.VERSION_STATUS,S.STEP_NAME CURRENT_STEP_NAME,T.ASSIGNED_AT,I.UPDATED_AT FROM JSA_WORKFLOW_INSTANCE I JOIN JSA_MASTER M ON M.JSA_ID=I.JSA_ID JOIN JSA_VERSION V ON V.JSA_VERSION_ID=I.JSA_VERSION_ID LEFT JOIN JSA_WORKFLOW_TASK T ON T.INSTANCE_ID=I.INSTANCE_ID AND T.CYCLE_NUMBER=I.CYCLE_NUMBER AND T.TASK_STATUS='PENDING' LEFT JOIN JSA_WORKFLOW_STEP S ON S.STEP_ID=T.STEP_ID WHERE ${clauses[kind]} AND EXISTS(SELECT 1 FROM SYS_USER_DATA_SCOPE DS WHERE DS.USER_ID=:userId AND DS.IS_ACTIVE='Y' AND DS.EFFECTIVE_FROM<=SYSTIMESTAMP AND (DS.EFFECTIVE_TO IS NULL OR DS.EFFECTIVE_TO>=SYSTIMESTAMP) AND DS.CAN_VIEW='Y' AND DS.SITE_ID=M.OWNER_SITE_ID AND (DS.SCOPE_TYPE='SITE' OR (DS.SCOPE_TYPE='RIG' AND DS.RIG_ID=M.RIG_ID) OR (DS.SCOPE_TYPE='DEPARTMENT' AND DS.DEPARTMENT_ID=M.DEPARTMENT_ID AND (DS.RIG_ID IS NULL OR DS.RIG_ID=M.RIG_ID)))) ORDER BY I.UPDATED_AT DESC`,
      { userId },
      options,
    );
    return (result.rows ?? []).map((r) => ({
      instanceId: r.INSTANCE_ID,
      jsaId: r.JSA_ID,
      jsaNumber: r.JSA_NUMBER,
      ...(r.JOB_TITLE ? { jobTitle: r.JOB_TITLE } : {}),
      versionStatus: r.VERSION_STATUS,
      ...(r.CURRENT_STEP_NAME ? { currentStepName: r.CURRENT_STEP_NAME } : {}),
      ...(r.ASSIGNED_AT ? { assignedAt: r.ASSIGNED_AT } : {}),
      updatedAt: r.UPDATED_AT,
    }));
  }
  async detail(c: OracleTransactionContext, jsaId: string): Promise<any | undefined> {
    assertOracleId(jsaId);
    const result = await c.connection.execute<Row>(
      `SELECT TO_CHAR(I.INSTANCE_ID) INSTANCE_ID,TO_CHAR(I.JSA_ID) JSA_ID,TO_CHAR(I.JSA_VERSION_ID) VERSION_ID,M.JSA_NUMBER,V.JOB_TITLE,TO_CHAR(M.OWNER_SITE_ID) OWNER_SITE_ID,TO_CHAR(M.RIG_ID) RIG_ID,TO_CHAR(M.DEPARTMENT_ID) DEPARTMENT_ID,TO_CHAR(M.CREATOR_USER_ID) CREATOR_USER_ID,I.INSTANCE_STATUS,V.VERSION_STATUS,I.CURRENT_STEP_ORDER,I.CYCLE_NUMBER,TO_CHAR(T.WORKFLOW_TASK_ID) CURRENT_TASK_ID,TO_CHAR(T.ASSIGNEE_USER_ID) CURRENT_ASSIGNEE_USER_ID,S.STEP_NAME CURRENT_STEP_NAME FROM JSA_WORKFLOW_INSTANCE I JOIN JSA_MASTER M ON M.JSA_ID=I.JSA_ID JOIN JSA_VERSION V ON V.JSA_VERSION_ID=I.JSA_VERSION_ID LEFT JOIN JSA_WORKFLOW_TASK T ON T.INSTANCE_ID=I.INSTANCE_ID AND T.CYCLE_NUMBER=I.CYCLE_NUMBER AND T.TASK_STATUS='PENDING' LEFT JOIN JSA_WORKFLOW_STEP S ON S.STEP_ID=T.STEP_ID WHERE I.JSA_ID=:jsaId`,
      { jsaId },
      options,
    );
    const r = result.rows?.[0];
    if (!r) return undefined;
    const actions = await c.connection.execute<Row>(
      `SELECT TO_CHAR(ACTION_ID) ID,ACTION_CODE,TO_CHAR(ACTOR_USER_ID) ACTOR_USER_ID,ACTOR_USERNAME,FROM_STATUS,TO_STATUS,COMMENT_TEXT,ACTION_AT,CYCLE_NUMBER FROM JSA_WORKFLOW_ACTION WHERE INSTANCE_ID=:instanceId ORDER BY ACTION_AT,ACTION_ID`,
      { instanceId: r.INSTANCE_ID },
      options,
    );
    return {
      instanceId: r.INSTANCE_ID,
      jsaId: r.JSA_ID,
      versionId: r.VERSION_ID,
      jsaNumber: r.JSA_NUMBER,
      ...(r.JOB_TITLE ? { jobTitle: r.JOB_TITLE } : {}),
      ownerSiteId: r.OWNER_SITE_ID,
      rigId: r.RIG_ID,
      departmentId: r.DEPARTMENT_ID,
      creatorUserId: r.CREATOR_USER_ID,
      status: r.INSTANCE_STATUS,
      versionStatus: r.VERSION_STATUS,
      ...(r.CURRENT_STEP_ORDER ? { currentStepOrder: r.CURRENT_STEP_ORDER } : {}),
      cycleNumber: r.CYCLE_NUMBER,
      ...(r.CURRENT_TASK_ID ? { currentTaskId: r.CURRENT_TASK_ID } : {}),
      ...(r.CURRENT_ASSIGNEE_USER_ID ? { currentAssigneeUserId: r.CURRENT_ASSIGNEE_USER_ID } : {}),
      ...(r.CURRENT_STEP_NAME ? { currentStepName: r.CURRENT_STEP_NAME } : {}),
      actions: (actions.rows ?? []).map((a) => ({
        id: a.ID,
        action: a.ACTION_CODE,
        actorUserId: a.ACTOR_USER_ID,
        actorUsername: a.ACTOR_USERNAME,
        ...(a.FROM_STATUS ? { fromStatus: a.FROM_STATUS } : {}),
        ...(a.TO_STATUS ? { toStatus: a.TO_STATUS } : {}),
        ...(a.COMMENT_TEXT ? { comment: a.COMMENT_TEXT } : {}),
        actionAt: a.ACTION_AT,
        cycleNumber: a.CYCLE_NUMBER,
      })),
    };
  }
  async definitions(c: OracleTransactionContext): Promise<any[]> {
    const result = await c.connection.execute<Row>(
      `SELECT TO_CHAR(D.DEFINITION_ID) ID,D.DEFINITION_CODE,D.VERSION_NUMBER,D.DEFINITION_NAME,D.STATUS_CODE,D.EFFECTIVE_FROM,D.EFFECTIVE_TO,TO_CHAR(D.ROW_VERSION) ROW_VERSION,(SELECT COUNT(*) FROM JSA_WORKFLOW_STEP S WHERE S.DEFINITION_ID=D.DEFINITION_ID AND S.IS_ACTIVE='Y') STEP_COUNT,(SELECT COUNT(*) FROM JSA_WORKFLOW_BINDING B WHERE B.DEFINITION_ID=D.DEFINITION_ID AND B.IS_ACTIVE='Y') BINDING_COUNT FROM JSA_WORKFLOW_DEFINITION D ORDER BY D.DEFINITION_CODE,D.VERSION_NUMBER DESC`,
      {},
      options,
    );
    return (result.rows ?? []).map((r) => ({
      id: r.ID,
      code: r.DEFINITION_CODE,
      versionNumber: r.VERSION_NUMBER,
      name: r.DEFINITION_NAME,
      status: r.STATUS_CODE,
      ...(r.EFFECTIVE_FROM ? { effectiveFrom: r.EFFECTIVE_FROM } : {}),
      ...(r.EFFECTIVE_TO ? { effectiveTo: r.EFFECTIVE_TO } : {}),
      rowVersion: r.ROW_VERSION,
      stepCount: r.STEP_COUNT,
      bindingCount: r.BINDING_COUNT,
    }));
  }
  async saveDefinition(
    c: OracleTransactionContext,
    input: SaveWorkflowDefinitionInput,
    actor: string,
  ): Promise<string> {
    let id = input.id;
    if (id) {
      assertOracleId(id);
      const update = await c.connection.execute(
        `UPDATE JSA_WORKFLOW_DEFINITION SET DEFINITION_CODE=:code,VERSION_NUMBER=:versionNumber,DEFINITION_NAME=:name,STATUS_CODE=:status,EFFECTIVE_FROM=:effectiveFrom,EFFECTIVE_TO=:effectiveTo,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE DEFINITION_ID=:id AND ROW_VERSION=:rowVersion AND STATUS_CODE='DRAFT'`,
        {
          id,
          rowVersion: input.rowVersion,
          code: input.code,
          versionNumber: input.versionNumber,
          name: input.name,
          status: input.status,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          actor,
        },
      );
      if (update.rowsAffected !== 1) throw new OptimisticLockError();
      await c.connection.execute(`DELETE FROM JSA_WORKFLOW_BINDING WHERE DEFINITION_ID=:id`, {
        id,
      });
      await c.connection.execute(`DELETE FROM JSA_WORKFLOW_STEP WHERE DEFINITION_ID=:id`, { id });
    } else {
      id = await this.next(c, 'SEQ_JSA_WORKFLOW_DEF');
      await c.connection.execute(
        `INSERT INTO JSA_WORKFLOW_DEFINITION(DEFINITION_ID,DEFINITION_CODE,VERSION_NUMBER,DEFINITION_NAME,STATUS_CODE,EFFECTIVE_FROM,EFFECTIVE_TO,CREATED_BY,UPDATED_BY) VALUES(:id,:code,:versionNumber,:name,:status,:effectiveFrom,:effectiveTo,:actor,:actor)`,
        {
          id,
          code: input.code,
          versionNumber: input.versionNumber,
          name: input.name,
          status: input.status,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          actor,
        },
      );
    }
    for (const s of input.steps) {
      const stepId = await this.next(c, 'SEQ_JSA_WORKFLOW_STEP');
      await c.connection.execute(
        `INSERT INTO JSA_WORKFLOW_STEP(STEP_ID,DEFINITION_ID,STEP_ORDER,STEP_CODE,STEP_NAME,VERSION_STATUS,WORKFLOW_ROLE_CODE,OPTIONAL_FLAG,CONDITION_TYPE,CONDITION_VALUE,CREATED_BY,UPDATED_BY) VALUES(:stepId,:id,:stepOrder,:code,:name,:versionStatus,:roleCode,:optionalFlag,:conditionType,:conditionValue,:actor,:actor)`,
        {
          stepId,
          id,
          stepOrder: s.order,
          code: s.code,
          name: s.name,
          versionStatus: s.versionStatus,
          roleCode: s.roleCode,
          optionalFlag: s.optional ? 'Y' : 'N',
          conditionType: s.conditionType ?? 'ALWAYS',
          conditionValue: s.conditionValue ?? null,
          actor,
        },
      );
    }
    for (const b of input.bindings) {
      const bindingId = await this.next(c, 'SEQ_JSA_WORKFLOW_BIND');
      await c.connection.execute(
        `INSERT INTO JSA_WORKFLOW_BINDING(BINDING_ID,DEFINITION_ID,SITE_ID,RIG_ID,DEPARTMENT_ID,JOB_TYPE_ID,PRIORITY_NUMBER,EFFECTIVE_FROM,EFFECTIVE_TO,IS_ACTIVE,CREATED_BY,UPDATED_BY) VALUES(:bindingId,:id,:siteId,:rigId,:departmentId,:jobTypeId,:priority,:effectiveFrom,:effectiveTo,:active,:actor,:actor)`,
        {
          bindingId,
          id,
          siteId: b.siteId ?? null,
          rigId: b.rigId ?? null,
          departmentId: b.departmentId ?? null,
          jobTypeId: b.jobTypeId ?? null,
          priority: b.priority,
          effectiveFrom: new Date(b.effectiveFrom),
          effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : null,
          active: b.active ? 'Y' : 'N',
          actor,
        },
      );
    }
    return id!;
  }
  async roleAssignments(c: OracleTransactionContext): Promise<any[]> {
    const result = await c.connection.execute<Row>(
      `SELECT TO_CHAR(A.ROLE_ASSIGNMENT_ID) ID,A.WORKFLOW_ROLE_CODE,TO_CHAR(A.USER_ID) USER_ID,U.DISPLAY_NAME USER_NAME,TO_CHAR(A.SITE_ID) SITE_ID,TO_CHAR(A.RIG_ID) RIG_ID,TO_CHAR(A.DEPARTMENT_ID) DEPARTMENT_ID,A.EFFECTIVE_FROM,A.EFFECTIVE_TO,A.IS_ACTIVE,TO_CHAR(A.ROW_VERSION) ROW_VERSION FROM JSA_WF_ROLE_ASSIGNMENT A JOIN SYS_USER U ON U.USER_ID=A.USER_ID ORDER BY A.WORKFLOW_ROLE_CODE,U.DISPLAY_NAME`,
      {},
      options,
    );
    return (result.rows ?? []).map((r) => ({
      id: r.ID,
      workflowRoleCode: r.WORKFLOW_ROLE_CODE,
      userId: r.USER_ID,
      userName: r.USER_NAME,
      siteId: r.SITE_ID,
      ...(r.RIG_ID ? { rigId: r.RIG_ID } : {}),
      ...(r.DEPARTMENT_ID ? { departmentId: r.DEPARTMENT_ID } : {}),
      effectiveFrom: r.EFFECTIVE_FROM,
      ...(r.EFFECTIVE_TO ? { effectiveTo: r.EFFECTIVE_TO } : {}),
      active: r.IS_ACTIVE === 'Y',
      rowVersion: r.ROW_VERSION,
    }));
  }
  async saveRoleAssignment(
    c: OracleTransactionContext,
    input: {
      id?: string;
      rowVersion?: string;
      workflowRoleCode: string;
      userId: string;
      siteId: string;
      rigId?: string;
      departmentId?: string;
      effectiveFrom: string;
      effectiveTo?: string;
      active: boolean;
    },
    actor: string,
  ): Promise<string> {
    const binds = {
      roleCode: input.workflowRoleCode,
      userId: input.userId,
      siteId: input.siteId,
      rigId: input.rigId ?? null,
      departmentId: input.departmentId ?? null,
      effectiveFrom: new Date(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      active: input.active ? 'Y' : 'N',
      actor,
    };
    if (input.id) {
      assertOracleId(input.id);
      const result = await c.connection.execute(
        `UPDATE JSA_WF_ROLE_ASSIGNMENT SET WORKFLOW_ROLE_CODE=:roleCode,USER_ID=:userId,SITE_ID=:siteId,RIG_ID=:rigId,DEPARTMENT_ID=:departmentId,EFFECTIVE_FROM=:effectiveFrom,EFFECTIVE_TO=:effectiveTo,IS_ACTIVE=:active,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE ROLE_ASSIGNMENT_ID=:id AND ROW_VERSION=:rowVersion`,
        { ...binds, id: input.id, rowVersion: input.rowVersion },
      );
      if (result.rowsAffected !== 1) throw new OptimisticLockError();
      return input.id;
    }
    const id = await this.next(c, 'SEQ_JSA_WF_ROLE_ASSIGN');
    await c.connection.execute(
      `INSERT INTO JSA_WF_ROLE_ASSIGNMENT(ROLE_ASSIGNMENT_ID,WORKFLOW_ROLE_CODE,USER_ID,SITE_ID,RIG_ID,DEPARTMENT_ID,EFFECTIVE_FROM,EFFECTIVE_TO,IS_ACTIVE,CREATED_BY,UPDATED_BY) VALUES(:id,:roleCode,:userId,:siteId,:rigId,:departmentId,:effectiveFrom,:effectiveTo,:active,:actor,:actor)`,
      { ...binds, id },
    );
    return id;
  }
  async notifications(c: OracleTransactionContext, userId: string): Promise<any[]> {
    const result = await c.connection.execute<Row>(
      `SELECT TO_CHAR(NOTIFICATION_ID) ID,NOTIFICATION_TYPE,SUBJECT_TEXT,BODY_TEXT,TARGET_TYPE,TO_CHAR(TARGET_ID) TARGET_ID,READ_FLAG,CREATED_AT FROM SYS_NOTIFICATION WHERE RECIPIENT_USER_ID=:userId ORDER BY CREATED_AT DESC FETCH FIRST 100 ROWS ONLY`,
      { userId },
      options,
    );
    return (result.rows ?? []).map((r) => ({
      id: r.ID,
      type: r.NOTIFICATION_TYPE,
      subject: r.SUBJECT_TEXT,
      body: r.BODY_TEXT,
      targetType: r.TARGET_TYPE,
      targetId: r.TARGET_ID,
      read: r.READ_FLAG === 'Y',
      createdAt: r.CREATED_AT,
    }));
  }
  private async history(
    c: OracleTransactionContext,
    instanceId: string,
    taskId: string | undefined,
    cycle: number,
    action: string,
    userId: string,
    username: string,
    fromStatus: string,
    toStatus: string,
    comment: string | undefined,
    correlationId: string,
  ) {
    const id = await this.next(c, 'SEQ_JSA_WORKFLOW_ACTION');
    await c.connection.execute(
      `INSERT INTO JSA_WORKFLOW_ACTION(ACTION_ID,INSTANCE_ID,WORKFLOW_TASK_ID,CYCLE_NUMBER,ACTION_CODE,ACTOR_USER_ID,ACTOR_USERNAME,FROM_STATUS,TO_STATUS,COMMENT_TEXT,CORRELATION_ID) VALUES(:id,:instanceId,:taskId,:cycle,:action,:userId,:username,:fromStatus,:toStatus,:commentText,:correlationId)`,
      {
        id,
        instanceId,
        taskId: taskId ?? null,
        cycle,
        action,
        userId,
        username,
        fromStatus,
        toStatus,
        commentText: comment ?? null,
        correlationId,
      },
    );
  }
  private async notify(
    c: OracleTransactionContext,
    userId: string,
    type: string,
    subject: string,
    body: string,
    targetType: string,
    targetId: string,
    actor: string,
  ) {
    const id = await this.next(c, 'SEQ_SYS_NOTIFICATION'),
      outboxId = await this.next(c, 'SEQ_SYS_NOTIF_OUTBOX');
    await c.connection.execute(
      `INSERT INTO SYS_NOTIFICATION(NOTIFICATION_ID,RECIPIENT_USER_ID,NOTIFICATION_TYPE,SUBJECT_TEXT,BODY_TEXT,TARGET_TYPE,TARGET_ID,CREATED_BY) VALUES(:id,:userId,:type,:subject,:body,:targetType,:targetId,:actor)`,
      { id, userId, type, subject, body, targetType, targetId, actor },
    );
    await c.connection.execute(
      `INSERT INTO SYS_NOTIFICATION_OUTBOX(OUTBOX_ID,NOTIFICATION_ID,CHANNEL_CODE,DELIVERY_STATUS,CREATED_BY) VALUES(:outboxId,:id,'IN_APP','PENDING',:actor)`,
      { outboxId, id, actor },
    );
  }
  private async next(c: OracleTransactionContext, sequence: string): Promise<string> {
    const allowed = [
      'SEQ_JSA_WORKFLOW_DEF',
      'SEQ_JSA_WORKFLOW_STEP',
      'SEQ_JSA_WORKFLOW_BIND',
      'SEQ_JSA_WF_ROLE_ASSIGN',
      'SEQ_JSA_WORKFLOW_INST',
      'SEQ_JSA_WORKFLOW_TASK',
      'SEQ_JSA_WORKFLOW_ACTION',
      'SEQ_SYS_NOTIFICATION',
      'SEQ_SYS_NOTIF_OUTBOX',
    ];
    if (!allowed.includes(sequence)) throw new ValidationError('Sequence is not allowlisted');
    const r = await c.connection.execute<Row>(
      `SELECT TO_CHAR(${sequence}.NEXTVAL) ID FROM DUAL`,
      {},
      options,
    );
    return r.rows?.[0]?.ID;
  }
}
