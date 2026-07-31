import { randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

loadDatabaseEnvironment();

const username = (process.env.SEED_UAT_APPROVER_USERNAME ?? 'phuclh').trim();
const actor = `uat-full-approval-seed:${username}`;
const definitionCode = 'UAT_FULL_APPROVAL';
const permissionDefinitions = [
  ['DEV_JSA_SUBMIT', 'Submit JSA'],
  ['DEV_JSA_APPROVE', 'Approve JSA'],
  ['DEV_JSA_RETURN', 'Return JSA'],
  ['DEV_JSA_REJECT', 'Reject JSA'],
  ['DEV_JSA_COMMENT', 'Comment on JSA workflow'],
  ['DEV_JSA_WORKFLOW_VIEW', 'View JSA workflow'],
  ['DEV_JSA_WORKFLOW_ADMIN', 'Administer JSA workflow'],
  ['DEV_JSA_FAVORITE', 'Favorite or unfavorite a JSA'],
  ['DEV_JSA_UPDATE', 'Check out a Published JSA for update'],
  ['DEV_JSA_COMPARE', 'Compare JSA versions and view version history'],
  ['DEV_JSA_UNDO_CHECKOUT', 'Undo a JSA checkout'],
] as const;
const workflowSteps = [
  {
    order: 1,
    code: 'DEPARTMENT_HEAD',
    name: 'Department Head Review',
    status: 'DEPARTMENT_HEAD_REVIEW',
    role: 'DEPARTMENT_HEAD',
    optional: 'N',
    condition: 'ALWAYS',
    conditionValue: null,
  },
  {
    order: 2,
    code: 'STC',
    name: 'STC Review',
    status: 'STC_REVIEW',
    role: 'STC',
    optional: 'N',
    condition: 'ALWAYS',
    conditionValue: null,
  },
  {
    order: 3,
    code: 'OIM',
    name: 'OIM Review',
    status: 'OIM_REVIEW',
    role: 'OIM',
    optional: 'N',
    condition: 'ALWAYS',
    conditionValue: null,
  },
  {
    order: 4,
    code: 'RIG_MANAGER',
    name: 'Rig Manager Review',
    status: 'RIG_MANAGER_REVIEW',
    role: 'RIG_MANAGER',
    optional: 'Y',
    condition: 'TEST_FLAG',
    conditionValue: 'TRUE',
  },
] as const;
const sequenceAllowlist = {
  permission: 'SEQ_SYS_PERMISSION',
  rolePermission: 'SEQ_SYS_ROLE_PERMISSION',
  definition: 'SEQ_JSA_WORKFLOW_DEF',
  step: 'SEQ_JSA_WORKFLOW_STEP',
  binding: 'SEQ_JSA_WORKFLOW_BIND',
  workflowRole: 'SEQ_JSA_WF_ROLE_ASSIGN',
  audit: 'SEQ_SYS_ACCESS_ADMIN_AUDIT',
} as const;
const options = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;

interface IdRow {
  ID_VALUE: string;
}

async function nextId(
  connection: oracledb.Connection,
  sequence: (typeof sequenceAllowlist)[keyof typeof sequenceAllowlist],
): Promise<string> {
  const result = await connection.execute<IdRow>(
    `SELECT TO_CHAR(${sequence}.NEXTVAL) ID_VALUE FROM DUAL`,
    {},
    options,
  );
  const value = result.rows?.[0]?.ID_VALUE;
  if (!value) throw new Error(`Could not allocate an ID from ${sequence}`);
  return value;
}

async function exactlyOneActiveUser(connection: oracledb.Connection) {
  const result = await connection.execute<{
    USER_ID: string;
    USERNAME: string;
    DISPLAY_NAME: string;
  }>(
    `SELECT TO_CHAR(USER_ID) USER_ID,USERNAME,DISPLAY_NAME
     FROM SYS_USER
     WHERE UPPER(USERNAME)=UPPER(:username) AND IS_ACTIVE='Y'`,
    { username },
    options,
  );
  if (result.rows?.length !== 1)
    throw new Error('UAT approval seed requires exactly one active target SYS_USER');
  return result.rows[0]!;
}

async function exactlyOneSite(connection: oracledb.Connection): Promise<string> {
  const configured = process.env.LOCAL_SITE_ID?.trim();
  const result = await connection.execute<{ SITE_ID: string }>(
    `SELECT TO_CHAR(SITE_ID) SITE_ID
     FROM SYS_SITE
     WHERE IS_ACTIVE='Y' AND (:siteId IS NULL OR SITE_ID=:siteId)`,
    { siteId: configured || null },
    options,
  );
  if (result.rows?.length !== 1)
    throw new Error('LOCAL_SITE_ID must identify exactly one active Site');
  return result.rows[0]!.SITE_ID;
}

async function seed(): Promise<void> {
  if ((process.env.NODE_ENV ?? 'development') === 'production')
    throw new Error('The full-approval UAT seed is forbidden in production');
  if (!username) throw new Error('SEED_UAT_APPROVER_USERNAME must not be empty');

  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const migration = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM JSA_SCHEMA_VERSION
       WHERE MIGRATION_ID='007' AND STATUS_CODE='APPLIED'`,
      {},
      options,
    );
    if (migration.rows?.[0]?.ITEM_COUNT !== 1)
      throw new Error('The full-approval UAT seed requires applied migration 007');

    const user = await exactlyOneActiveUser(connection);
    const siteId = await exactlyOneSite(connection);
    const systemAdmin = await connection.execute<{ ROLE_ID: string }>(
      `SELECT TO_CHAR(ROLE_ID) ROLE_ID FROM SYS_ROLE
       WHERE ROLE_CODE='SYSTEM_ADMIN' AND IS_ACTIVE='Y'`,
      {},
      options,
    );
    if (systemAdmin.rows?.length !== 1)
      throw new Error('Exactly one active SYSTEM_ADMIN Role is required');
    const roleId = systemAdmin.rows[0]!.ROLE_ID;

    const scope = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM SYS_USER_DATA_SCOPE
       WHERE USER_ID=:userId AND SITE_ID=:siteId AND SCOPE_TYPE='SITE'
         AND IS_ACTIVE='Y' AND CAN_VIEW='Y' AND CAN_ACT='Y'
         AND EFFECTIVE_FROM<=SYSTIMESTAMP
         AND (EFFECTIVE_TO IS NULL OR EFFECTIVE_TO>=SYSTIMESTAMP)`,
      { userId: user.USER_ID, siteId },
      options,
    );
    if (scope.rows?.[0]?.ITEM_COUNT !== 1)
      throw new Error('Target user requires exactly one effective Site VIEW/ACT scope');

    const changes: string[] = [];
    for (const [code, name] of permissionDefinitions) {
      const existing = await connection.execute<{ PERMISSION_ID: string; IS_ACTIVE: 'Y' | 'N' }>(
        `SELECT TO_CHAR(PERMISSION_ID) PERMISSION_ID,IS_ACTIVE
         FROM SYS_PERMISSION WHERE PERMISSION_CODE=:code FOR UPDATE`,
        { code },
        options,
      );
      if ((existing.rows?.length ?? 0) > 1) throw new Error(`Duplicate permission code ${code}`);
      let permissionId = existing.rows?.[0]?.PERMISSION_ID;
      if (!permissionId) {
        permissionId = await nextId(connection, sequenceAllowlist.permission);
        await connection.execute(
          `INSERT INTO SYS_PERMISSION
           (PERMISSION_ID,PERMISSION_CODE,PERMISSION_NAME,DESCRIPTION,PERMISSION_GROUP,
            CREATED_BY,UPDATED_BY)
           VALUES(:id,:code,:name,:description,'JSA_WORKFLOW',:actor,:actor)`,
          {
            id: permissionId,
            code,
            name,
            description: 'Development/UAT workflow permission',
            actor,
          },
        );
        changes.push(`permission:${code}`);
      } else if (existing.rows?.[0]?.IS_ACTIVE !== 'Y') {
        await connection.execute(
          `UPDATE SYS_PERMISSION
           SET IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,
               ROW_VERSION=ROW_VERSION+1
           WHERE PERMISSION_ID=:id`,
          { id: permissionId, actor },
        );
        changes.push(`permission-reactivated:${code}`);
      }
    }

    const activePermissions = await connection.execute<{ PERMISSION_ID: string; CODE: string }>(
      `SELECT TO_CHAR(PERMISSION_ID) PERMISSION_ID,PERMISSION_CODE CODE
       FROM SYS_PERMISSION WHERE IS_ACTIVE='Y' ORDER BY PERMISSION_CODE`,
      {},
      options,
    );
    for (const permission of activePermissions.rows ?? []) {
      const grant = await connection.execute<{ ITEM_COUNT: number }>(
        `SELECT COUNT(*) ITEM_COUNT FROM SYS_ROLE_PERMISSION
         WHERE ROLE_ID=:roleId AND PERMISSION_ID=:permissionId AND IS_ACTIVE='Y'`,
        { roleId, permissionId: permission.PERMISSION_ID },
        options,
      );
      if ((grant.rows?.[0]?.ITEM_COUNT ?? 0) === 0) {
        await connection.execute(
          `INSERT INTO SYS_ROLE_PERMISSION
           (ROLE_PERMISSION_ID,ROLE_ID,PERMISSION_ID,CREATED_BY,UPDATED_BY)
           VALUES(:id,:roleId,:permissionId,:actor,:actor)`,
          {
            id: await nextId(connection, sequenceAllowlist.rolePermission),
            roleId,
            permissionId: permission.PERMISSION_ID,
            actor,
          },
        );
        changes.push(`role-permission:${permission.CODE}`);
      }
    }

    const definitions = await connection.execute<{ DEFINITION_ID: string; STATUS_CODE: string }>(
      `SELECT TO_CHAR(DEFINITION_ID) DEFINITION_ID,STATUS_CODE
       FROM JSA_WORKFLOW_DEFINITION
       WHERE DEFINITION_CODE=:code AND VERSION_NUMBER=1
       FOR UPDATE`,
      { code: definitionCode },
      options,
    );
    if ((definitions.rows?.length ?? 0) > 1) throw new Error('Duplicate UAT workflow definition');
    let definitionId = definitions.rows?.[0]?.DEFINITION_ID;
    if (!definitionId) {
      definitionId = await nextId(connection, sequenceAllowlist.definition);
      await connection.execute(
        `INSERT INTO JSA_WORKFLOW_DEFINITION
         (DEFINITION_ID,DEFINITION_CODE,VERSION_NUMBER,DEFINITION_NAME,STATUS_CODE,
          EFFECTIVE_FROM,CREATED_BY,UPDATED_BY)
         VALUES(:id,:code,1,'UAT Full JSA Approval','ACTIVE',SYSTIMESTAMP,:actor,:actor)`,
        { id: definitionId, code: definitionCode, actor },
      );
      for (const step of workflowSteps)
        await connection.execute(
          `INSERT INTO JSA_WORKFLOW_STEP
           (STEP_ID,DEFINITION_ID,STEP_ORDER,STEP_CODE,STEP_NAME,VERSION_STATUS,
            WORKFLOW_ROLE_CODE,OPTIONAL_FLAG,CONDITION_TYPE,CONDITION_VALUE,
            CREATED_BY,UPDATED_BY)
           VALUES(:id,:definitionId,:stepOrder,:stepCode,:stepName,:versionStatus,
            :roleCode,:optionalFlag,:conditionType,:conditionValue,:actor,:actor)`,
          {
            id: await nextId(connection, sequenceAllowlist.step),
            definitionId,
            stepOrder: step.order,
            stepCode: step.code,
            stepName: step.name,
            versionStatus: step.status,
            roleCode: step.role,
            optionalFlag: step.optional,
            conditionType: step.condition,
            conditionValue: step.conditionValue,
            actor,
          },
        );
      changes.push(`workflow-definition:${definitionCode}`);
    } else {
      if (definitions.rows?.[0]?.STATUS_CODE !== 'ACTIVE')
        throw new Error('Existing UAT workflow definition is not active');
      const steps = await connection.execute<{ ITEM_COUNT: number }>(
        `SELECT COUNT(*) ITEM_COUNT FROM JSA_WORKFLOW_STEP
         WHERE DEFINITION_ID=:definitionId AND IS_ACTIVE='Y'`,
        { definitionId },
        options,
      );
      if (steps.rows?.[0]?.ITEM_COUNT !== workflowSteps.length)
        throw new Error('Existing UAT workflow definition does not contain the expected steps');
    }

    const bindings = await connection.execute<{ BINDING_ID: string }>(
      `SELECT TO_CHAR(BINDING_ID) BINDING_ID FROM JSA_WORKFLOW_BINDING
       WHERE DEFINITION_ID=:definitionId AND SITE_ID=:siteId
         AND RIG_ID IS NULL AND DEPARTMENT_ID IS NULL AND JOB_TYPE_ID IS NULL
         AND IS_ACTIVE='Y' AND EFFECTIVE_FROM<=SYSTIMESTAMP
         AND (EFFECTIVE_TO IS NULL OR EFFECTIVE_TO>=SYSTIMESTAMP)`,
      { definitionId, siteId },
      options,
    );
    if ((bindings.rows?.length ?? 0) > 1)
      throw new Error('Multiple active UAT workflow bindings exist');
    if (!bindings.rows?.length) {
      await connection.execute(
        `INSERT INTO JSA_WORKFLOW_BINDING
         (BINDING_ID,DEFINITION_ID,SITE_ID,PRIORITY_NUMBER,EFFECTIVE_FROM,
          CREATED_BY,UPDATED_BY)
         VALUES(:id,:definitionId,:siteId,1,SYSTIMESTAMP,:actor,:actor)`,
        {
          id: await nextId(connection, sequenceAllowlist.binding),
          definitionId,
          siteId,
          actor,
        },
      );
      changes.push('workflow-binding:SITE');
    }

    for (const workflowRole of workflowSteps.map((step) => step.role)) {
      const assignments = await connection.execute<{ ITEM_COUNT: number }>(
        `SELECT COUNT(*) ITEM_COUNT FROM JSA_WF_ROLE_ASSIGNMENT
         WHERE WORKFLOW_ROLE_CODE=:roleCode AND USER_ID=:userId AND SITE_ID=:siteId
           AND RIG_ID IS NULL AND DEPARTMENT_ID IS NULL AND IS_ACTIVE='Y'
           AND EFFECTIVE_FROM<=SYSTIMESTAMP
           AND (EFFECTIVE_TO IS NULL OR EFFECTIVE_TO>=SYSTIMESTAMP)`,
        { roleCode: workflowRole, userId: user.USER_ID, siteId },
        options,
      );
      if ((assignments.rows?.[0]?.ITEM_COUNT ?? 0) > 1)
        throw new Error(`Multiple active ${workflowRole} assignments exist`);
      if ((assignments.rows?.[0]?.ITEM_COUNT ?? 0) === 0) {
        await connection.execute(
          `INSERT INTO JSA_WF_ROLE_ASSIGNMENT
           (ROLE_ASSIGNMENT_ID,WORKFLOW_ROLE_CODE,USER_ID,SITE_ID,EFFECTIVE_FROM,
            CREATED_BY,UPDATED_BY)
           VALUES(:id,:roleCode,:userId,:siteId,SYSTIMESTAMP,:actor,:actor)`,
          {
            id: await nextId(connection, sequenceAllowlist.workflowRole),
            roleCode: workflowRole,
            userId: user.USER_ID,
            siteId,
            actor,
          },
        );
        changes.push(`workflow-role:${workflowRole}`);
      }
    }

    if (changes.length) {
      await connection.execute(
        `INSERT INTO SYS_ACCESS_ADMIN_AUDIT
         (AUDIT_EVENT_ID,ACTION_CODE,TARGET_ENTITY_TYPE,TARGET_ENTITY_ID,
          TARGET_USERNAME_SNAPSHOT,ACTOR_USER_ID,ACTOR_USERNAME_SNAPSHOT,
          ACTOR_DISPLAY_SNAPSHOT,SITE_ID,AFTER_STATE,REASON_TEXT,CORRELATION_ID,
          CREATED_SITE_ID)
         VALUES(:id,'UAT_FULL_APPROVAL_SEEDED','SYS_USER',:userId,:username,
          :userId,:username,:displayName,:siteId,:afterState,:reason,:correlationId,:siteId)`,
        {
          id: await nextId(connection, sequenceAllowlist.audit),
          userId: user.USER_ID,
          username: user.USERNAME,
          displayName: user.DISPLAY_NAME,
          siteId,
          afterState: JSON.stringify({ definitionCode, changes }),
          reason: 'Development/UAT full approval seed requested for workflow testing',
          correlationId: randomUUID(),
        },
      );
    }

    await connection.commit();
    console.log(
      JSON.stringify({
        status: changes.length ? 'PASS' : 'SKIPPED',
        username: user.USERNAME,
        userId: user.USER_ID,
        siteId,
        definitionCode,
        stepCount: workflowSteps.length,
        effectivePermissionCount: activePermissions.rows?.length ?? 0,
        workflowRoles: workflowSteps.map((step) => step.role),
        changeCount: changes.length,
      }),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.close();
  }
}

seed().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
