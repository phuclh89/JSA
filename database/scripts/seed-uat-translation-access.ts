import { randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

loadDatabaseEnvironment();

const username = (process.env.SEED_UAT_TRANSLATION_USERNAME ?? 'phuclh').trim();
const actor = `uat-translation-access-seed:${username}`;
const permissionDefinitions = [
  ['DEV_JSA_TRANSLATION_VIEW', 'View JSA translations'],
  ['DEV_JSA_TRANSLATION_ASSIGN', 'Assign JSA translations'],
  ['DEV_JSA_TRANSLATE', 'Translate JSA content'],
  ['DEV_JSA_TRANSLATION_APPROVE', 'Approve JSA translations'],
  ['DEV_JSA_TRANSLATION_PRINT', 'Print JSA translations'],
] as const;
const workflowRoles = ['OIM', 'TRANSLATOR', 'STC'] as const;
const sequenceAllowlist = {
  permission: 'SEQ_SYS_PERMISSION',
  rolePermission: 'SEQ_SYS_ROLE_PERMISSION',
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

async function seed(): Promise<void> {
  if ((process.env.NODE_ENV ?? 'development') === 'production')
    throw new Error('The Translation UAT access seed is forbidden in production');
  if (!username) throw new Error('SEED_UAT_TRANSLATION_USERNAME must not be empty');

  const siteId = process.env.LOCAL_SITE_ID?.trim();
  if (!siteId || !/^\d{1,19}$/.test(siteId))
    throw new Error('LOCAL_SITE_ID is required and must be a NUMBER(19) identifier');

  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const migration = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM JSA_SCHEMA_VERSION
       WHERE MIGRATION_ID='018' AND STATUS_CODE='APPLIED'`,
      {},
      options,
    );
    if (migration.rows?.[0]?.ITEM_COUNT !== 1)
      throw new Error('The Translation UAT access seed requires applied migration 018');

    const users = await connection.execute<{
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
    if (users.rows?.length !== 1)
      throw new Error('Translation UAT access requires exactly one active target user');
    const user = users.rows[0]!;

    const roles = await connection.execute<{ ROLE_ID: string }>(
      `SELECT TO_CHAR(ROLE_ID) ROLE_ID FROM SYS_ROLE
       WHERE ROLE_CODE='SYSTEM_ADMIN' AND IS_ACTIVE='Y'`,
      {},
      options,
    );
    if (roles.rows?.length !== 1)
      throw new Error('Exactly one active SYSTEM_ADMIN Role is required');
    const roleId = roles.rows[0]!.ROLE_ID;

    const membership = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM SYS_USER_ROLE
       WHERE USER_ID=:userId AND ROLE_ID=:roleId AND IS_ACTIVE='Y'`,
      { userId: user.USER_ID, roleId },
      options,
    );
    if (membership.rows?.[0]?.ITEM_COUNT !== 1)
      throw new Error('Target user must have the active SYSTEM_ADMIN Role');

    const scopes = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM SYS_USER_DATA_SCOPE
       WHERE USER_ID=:userId AND SITE_ID=:siteId AND SCOPE_TYPE='SITE'
         AND IS_ACTIVE='Y' AND CAN_VIEW='Y' AND CAN_ACT='Y'
         AND EFFECTIVE_FROM<=SYSTIMESTAMP
         AND (EFFECTIVE_TO IS NULL OR EFFECTIVE_TO>SYSTIMESTAMP)`,
      { userId: user.USER_ID, siteId },
      options,
    );
    if (scopes.rows?.[0]?.ITEM_COUNT !== 1)
      throw new Error('Target user requires exactly one effective Site VIEW/ACT scope');

    const changes: string[] = [];
    for (const [code, name] of permissionDefinitions) {
      const existing = await connection.execute<{
        PERMISSION_ID: string;
        IS_ACTIVE: 'Y' | 'N';
      }>(
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
           VALUES(:id,:code,:name,'Development/UAT Translation permission',
            'JSA_TRANSLATION',:actor,:actor)`,
          { id: permissionId, code, name, actor },
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

      const grants = await connection.execute<{ ITEM_COUNT: number }>(
        `SELECT COUNT(*) ITEM_COUNT FROM SYS_ROLE_PERMISSION
         WHERE ROLE_ID=:roleId AND PERMISSION_ID=:permissionId AND IS_ACTIVE='Y'`,
        { roleId, permissionId },
        options,
      );
      if ((grants.rows?.[0]?.ITEM_COUNT ?? 0) === 0) {
        await connection.execute(
          `INSERT INTO SYS_ROLE_PERMISSION
           (ROLE_PERMISSION_ID,ROLE_ID,PERMISSION_ID,CREATED_BY,UPDATED_BY)
           VALUES(:id,:roleId,:permissionId,:actor,:actor)`,
          {
            id: await nextId(connection, sequenceAllowlist.rolePermission),
            roleId,
            permissionId,
            actor,
          },
        );
        changes.push(`role-permission:${code}`);
      }
    }

    for (const workflowRole of workflowRoles) {
      const assignments = await connection.execute<{ ITEM_COUNT: number }>(
        `SELECT COUNT(*) ITEM_COUNT FROM JSA_WF_ROLE_ASSIGNMENT
         WHERE WORKFLOW_ROLE_CODE=:roleCode AND USER_ID=:userId AND SITE_ID=:siteId
           AND RIG_ID IS NULL AND DEPARTMENT_ID IS NULL AND IS_ACTIVE='Y'
           AND EFFECTIVE_FROM<=SYSTIMESTAMP
           AND (EFFECTIVE_TO IS NULL OR EFFECTIVE_TO>SYSTIMESTAMP)`,
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
         VALUES(:id,'UAT_TRANSLATION_ACCESS_SEEDED','SYS_USER',:userId,:username,
          :userId,:username,:displayName,:siteId,:afterState,:reason,:correlationId,:siteId)`,
        {
          id: await nextId(connection, sequenceAllowlist.audit),
          userId: user.USER_ID,
          username: user.USERNAME,
          displayName: user.DISPLAY_NAME,
          siteId,
          afterState: JSON.stringify({ permissionDefinitions, workflowRoles, changes }),
          reason: 'Development/UAT Translation access requested for end-to-end testing',
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
        permissions: permissionDefinitions.map(([code]) => code),
        workflowRoles,
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
