import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';
loadDatabaseEnvironment();
type Row = Record<string, any>;
const options = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;
async function next(connection: oracledb.Connection, sequence: string) {
  const allowed = [
    'SEQ_JSA_MASTER',
    'SEQ_JSA_VERSION',
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
  if (!allowed.includes(sequence)) throw new Error('Sequence not allowlisted');
  const r = await connection.execute<Row>(
    `SELECT TO_CHAR(${sequence}.NEXTVAL) ID FROM DUAL`,
    {},
    options,
  );
  return r.rows?.[0]?.ID as string;
}
async function main() {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const base = await connection.execute<Row>(
      `SELECT TO_CHAR(S.SITE_ID) SITE_ID,TO_CHAR(R.RIG_ID) RIG_ID,TO_CHAR(D.DEPARTMENT_ID) DEPARTMENT_ID,TO_CHAR(U.USER_ID) USER_ID,TO_CHAR(J.JOB_TYPE_ID) JOB_TYPE_ID,TO_CHAR(V.MATRIX_VERSION_ID) MATRIX_VERSION_ID,U.USERNAME FROM SYS_SITE S JOIN SYS_RIG R ON R.SITE_ID=S.SITE_ID AND R.IS_ACTIVE='Y' JOIN SYS_DEPARTMENT D ON D.SITE_ID=S.SITE_ID AND D.RIG_ID=R.RIG_ID AND D.IS_ACTIVE='Y' JOIN SYS_USER U ON U.IS_ACTIVE='Y' JOIN SYS_JOB_TYPE J ON J.IS_ACTIVE='Y' JOIN JSA_RISK_MATRIX_VERSION V ON V.IS_ACTIVE='Y' WHERE S.IS_ACTIVE='Y' FETCH FIRST 1 ROW ONLY`,
      {},
      options,
    );
    const raw = base.rows?.[0];
    if (!raw) throw new Error('Phase 4 verifier requires existing Phase 1/2 reference data');
    const b = {
      siteId: raw.SITE_ID as string,
      rigId: raw.RIG_ID as string,
      departmentId: raw.DEPARTMENT_ID as string,
      userId: raw.USER_ID as string,
      jobTypeId: raw.JOB_TYPE_ID as string,
      matrixVersionId: raw.MATRIX_VERSION_ID as string,
      username: raw.USERNAME as string,
    };
    const actor = 'phase4-verifier';
    const jsaId = await next(connection, 'SEQ_JSA_MASTER'),
      versionId = await next(connection, 'SEQ_JSA_VERSION');
    await connection.execute(
      `INSERT INTO JSA_MASTER(JSA_ID,JSA_NUMBER,NUMBER_SCOPE_KEY,OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,ORIGIN_SITE_ID,CREATED_SITE_ID,UPDATED_SITE_ID,CREATOR_USER_ID,CREATED_BY,UPDATED_BY) VALUES(:jsaId,:jsaNumber,'PHASE4_VERIFY',:siteId,:rigId,:departmentId,:siteId,:siteId,:siteId,:userId,:actor,:actor)`,
      {
        jsaId,
        jsaNumber: `VERIFY-${jsaId}`,
        siteId: b.siteId,
        rigId: b.rigId,
        departmentId: b.departmentId,
        userId: b.userId,
        actor,
      },
    );
    await connection.execute(
      `INSERT INTO JSA_VERSION(JSA_VERSION_ID,JSA_ID,VERSION_NUMBER,OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,JOB_TYPE_ID,MATRIX_VERSION_ID,JOB_TITLE,CREATED_BY,UPDATED_BY) VALUES(:versionId,:jsaId,1,:siteId,:rigId,:departmentId,:jobTypeId,:matrixVersionId,'Phase 4 verification',:actor,:actor)`,
      {
        versionId,
        jsaId,
        siteId: b.siteId,
        rigId: b.rigId,
        departmentId: b.departmentId,
        jobTypeId: b.jobTypeId,
        matrixVersionId: b.matrixVersionId,
        actor,
      },
    );
    await connection.execute(
      `UPDATE JSA_MASTER SET WORKING_VERSION_ID=:versionId WHERE JSA_ID=:jsaId`,
      { versionId, jsaId },
    );
    const definitionId = await next(connection, 'SEQ_JSA_WORKFLOW_DEF'),
      bindingId = await next(connection, 'SEQ_JSA_WORKFLOW_BIND');
    await connection.execute(
      `INSERT INTO JSA_WORKFLOW_DEFINITION(DEFINITION_ID,DEFINITION_CODE,VERSION_NUMBER,DEFINITION_NAME,STATUS_CODE,EFFECTIVE_FROM,CREATED_BY,UPDATED_BY) VALUES(:definitionId,'VERIFY',1,'Verifier workflow','ACTIVE',SYSTIMESTAMP-INTERVAL '1' DAY,:actor,:actor)`,
      { definitionId, actor },
    );
    const statuses = ['DEPARTMENT_HEAD_REVIEW', 'STC_REVIEW', 'OIM_REVIEW'];
    const steps: string[] = [];
    for (let i = 0; i < statuses.length; i++) {
      const stepId = await next(connection, 'SEQ_JSA_WORKFLOW_STEP');
      steps.push(stepId);
      await connection.execute(
        `INSERT INTO JSA_WORKFLOW_STEP(STEP_ID,DEFINITION_ID,STEP_ORDER,STEP_CODE,STEP_NAME,VERSION_STATUS,WORKFLOW_ROLE_CODE,CREATED_BY,UPDATED_BY) VALUES(:stepId,:definitionId,:stepOrder,:code,:name,:status,:role,:actor,:actor)`,
        {
          stepId,
          definitionId,
          stepOrder: i + 1,
          code: `S${i + 1}`,
          name: `Step ${i + 1}`,
          status: statuses[i],
          role: `VERIFY_ROLE_${i + 1}`,
          actor,
        },
      );
      const assignmentId = await next(connection, 'SEQ_JSA_WF_ROLE_ASSIGN');
      await connection.execute(
        `INSERT INTO JSA_WF_ROLE_ASSIGNMENT(ROLE_ASSIGNMENT_ID,WORKFLOW_ROLE_CODE,USER_ID,SITE_ID,RIG_ID,DEPARTMENT_ID,CREATED_BY,UPDATED_BY) VALUES(:assignmentId,:role,:userId,:siteId,:rigId,:departmentId,:actor,:actor)`,
        {
          assignmentId,
          role: `VERIFY_ROLE_${i + 1}`,
          userId: b.userId,
          siteId: b.siteId,
          rigId: b.rigId,
          departmentId: b.departmentId,
          actor,
        },
      );
    }
    await connection.execute(
      `INSERT INTO JSA_WORKFLOW_BINDING(BINDING_ID,DEFINITION_ID,SITE_ID,RIG_ID,DEPARTMENT_ID,JOB_TYPE_ID,PRIORITY_NUMBER,EFFECTIVE_FROM,CREATED_BY,UPDATED_BY) VALUES(:bindingId,:definitionId,:siteId,:rigId,:departmentId,:jobTypeId,1,SYSTIMESTAMP-INTERVAL '1' DAY,:actor,:actor)`,
      {
        bindingId,
        definitionId,
        siteId: b.siteId,
        rigId: b.rigId,
        departmentId: b.departmentId,
        jobTypeId: b.jobTypeId,
        actor,
      },
    );
    const resolved = await connection.execute<Row>(
      `SELECT COUNT(DISTINCT USER_ID) C FROM JSA_WF_ROLE_ASSIGNMENT WHERE WORKFLOW_ROLE_CODE='VERIFY_ROLE_1' AND SITE_ID=:siteId AND RIG_ID=:rigId AND DEPARTMENT_ID=:departmentId AND IS_ACTIVE='Y'`,
      { siteId: b.siteId, rigId: b.rigId, departmentId: b.departmentId },
      options,
    );
    if (resolved.rows?.[0]?.C !== 1) throw new Error('Deterministic assignee resolution failed');
    const instanceId = await next(connection, 'SEQ_JSA_WORKFLOW_INST');
    await connection.execute(
      `INSERT INTO JSA_WORKFLOW_INSTANCE(INSTANCE_ID,JSA_ID,JSA_VERSION_ID,DEFINITION_ID,BINDING_ID,CURRENT_STEP_ORDER,CREATED_BY,UPDATED_BY) VALUES(:instanceId,:jsaId,:versionId,:definitionId,:bindingId,1,:actor,:actor)`,
      { instanceId, jsaId, versionId, definitionId, bindingId, actor },
    );
    let taskId = await next(connection, 'SEQ_JSA_WORKFLOW_TASK');
    await connection.execute(
      `INSERT INTO JSA_WORKFLOW_TASK(WORKFLOW_TASK_ID,INSTANCE_ID,STEP_ID,CYCLE_NUMBER,ASSIGNEE_USER_ID,CREATED_BY,UPDATED_BY) VALUES(:taskId,:instanceId,:stepId,1,:userId,:actor,:actor)`,
      { taskId, instanceId, stepId: steps[0], userId: b.userId, actor },
    );
    await connection.execute(
      `UPDATE JSA_VERSION SET VERSION_STATUS='DEPARTMENT_HEAD_REVIEW' WHERE JSA_VERSION_ID=:versionId`,
      { versionId },
    );
    await connection.execute(
      `UPDATE JSA_WORKFLOW_TASK SET TASK_STATUS='RETURNED',COMPLETED_AT=SYSTIMESTAMP WHERE WORKFLOW_TASK_ID=:taskId`,
      { taskId },
    );
    await connection.execute(
      `UPDATE JSA_WORKFLOW_INSTANCE SET INSTANCE_STATUS='RETURNED',CURRENT_STEP_ORDER=NULL WHERE INSTANCE_ID=:instanceId`,
      { instanceId },
    );
    await connection.execute(
      `UPDATE JSA_VERSION SET VERSION_STATUS='RETURNED' WHERE JSA_VERSION_ID=:versionId`,
      { versionId },
    );
    taskId = await next(connection, 'SEQ_JSA_WORKFLOW_TASK');
    await connection.execute(
      `UPDATE JSA_WORKFLOW_INSTANCE SET INSTANCE_STATUS='ACTIVE',CURRENT_STEP_ORDER=1,CYCLE_NUMBER=2 WHERE INSTANCE_ID=:instanceId`,
      { instanceId },
    );
    await connection.execute(
      `INSERT INTO JSA_WORKFLOW_TASK(WORKFLOW_TASK_ID,INSTANCE_ID,STEP_ID,CYCLE_NUMBER,ASSIGNEE_USER_ID,CREATED_BY,UPDATED_BY) VALUES(:taskId,:instanceId,:stepId,2,:userId,:actor,:actor)`,
      { taskId, instanceId, stepId: steps[0], userId: b.userId, actor },
    );
    for (let i = 0; i < steps.length; i++) {
      await connection.execute(
        `UPDATE JSA_WORKFLOW_TASK SET TASK_STATUS='APPROVED',COMPLETED_AT=SYSTIMESTAMP WHERE WORKFLOW_TASK_ID=:taskId`,
        { taskId },
      );
      if (i < steps.length - 1) {
        taskId = await next(connection, 'SEQ_JSA_WORKFLOW_TASK');
        await connection.execute(
          `INSERT INTO JSA_WORKFLOW_TASK(WORKFLOW_TASK_ID,INSTANCE_ID,STEP_ID,CYCLE_NUMBER,ASSIGNEE_USER_ID,CREATED_BY,UPDATED_BY) VALUES(:taskId,:instanceId,:stepId,2,:userId,:actor,:actor)`,
          { taskId, instanceId, stepId: steps[i + 1], userId: b.userId, actor },
        );
        await connection.execute(
          `UPDATE JSA_VERSION SET VERSION_STATUS=:status WHERE JSA_VERSION_ID=:versionId`,
          { status: statuses[i + 1], versionId },
        );
      }
    }
    await connection.execute(
      `UPDATE JSA_VERSION SET VERSION_STATUS='PUBLISHED',PUBLISHED_AT=SYSTIMESTAMP,PUBLISHED_BY_USER_ID=:userId,PUBLISHED_BY_USERNAME=:username WHERE JSA_VERSION_ID=:versionId`,
      { userId: b.userId, username: b.username, versionId },
    );
    const master = await connection.execute(
      `UPDATE JSA_MASTER SET CURRENT_VERSION_ID=:versionId,WORKING_VERSION_ID=NULL,LIFECYCLE_STATUS='PUBLISHED' WHERE JSA_ID=:jsaId AND CURRENT_VERSION_ID IS NULL`,
      { versionId, jsaId },
    );
    if (master.rowsAffected !== 1)
      throw new Error('Atomic initial publication pointer update failed');
    await connection.execute(
      `UPDATE JSA_WORKFLOW_INSTANCE SET INSTANCE_STATUS='COMPLETED',CURRENT_STEP_ORDER=NULL,COMPLETED_AT=SYSTIMESTAMP WHERE INSTANCE_ID=:instanceId`,
      { instanceId },
    );
    let immutableBlocked = false;
    try {
      await connection.execute(
        `UPDATE JSA_VERSION SET JOB_TITLE='MUTATION' WHERE JSA_VERSION_ID=:versionId`,
        { versionId },
      );
    } catch (error) {
      immutableBlocked = (error as { errorNum?: number }).errorNum === 20041;
    }
    if (!immutableBlocked) throw new Error('Published mutation trigger failed');
    const result = await connection.execute<Row>(
      `SELECT M.LIFECYCLE_STATUS,V.VERSION_STATUS,TO_CHAR(M.CURRENT_VERSION_ID) CURRENT_VERSION_ID,M.WORKING_VERSION_ID,I.INSTANCE_STATUS,I.CYCLE_NUMBER FROM JSA_MASTER M JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.CURRENT_VERSION_ID JOIN JSA_WORKFLOW_INSTANCE I ON I.JSA_VERSION_ID=V.JSA_VERSION_ID WHERE M.JSA_ID=:jsaId`,
      { jsaId },
      options,
    );
    const r = result.rows?.[0];
    if (
      r?.LIFECYCLE_STATUS !== 'PUBLISHED' ||
      r.VERSION_STATUS !== 'PUBLISHED' ||
      r.CURRENT_VERSION_ID !== versionId ||
      r.WORKING_VERSION_ID !== null ||
      r.INSTANCE_STATUS !== 'COMPLETED' ||
      r.CYCLE_NUMBER !== 2
    )
      throw new Error('Final publication invariants failed');
    console.log(
      JSON.stringify({
        status: 'PASS',
        assigneeResolution: 'UNIQUE',
        returnResubmitSameInstance: true,
        cycleNumber: 2,
        initialPublicationAtomic: true,
        publishedMutationRejected: true,
        fixture: 'ROLLED_BACK',
      }),
    );
  } finally {
    await connection.rollback();
    await connection.close();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
      oracleErrorCode: (error as any)?.code,
    }),
  );
  process.exitCode = 1;
});
