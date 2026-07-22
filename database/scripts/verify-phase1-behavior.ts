import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';

async function expectOracleError(
  action: () => Promise<unknown>,
  expected: readonly number[],
  label: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (expected.includes((error as { errorNum?: number }).errorNum ?? -1)) return;
    throw error;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  const actor = 'phase1-verifier';
  const ids = {
    site1: '8999999999999999001',
    site2: '8999999999999999002',
    rig: '8999999999999999010',
    department: '8999999999999999020',
    user: '8999999999999999030',
    role: '8999999999999999040',
    permission: '8999999999999999050',
    userRole: '8999999999999999060',
    inactiveUserRole: '8999999999999999061',
    rolePermission: '8999999999999999070',
    override: '8999999999999999080',
    scope: '8999999999999999090',
    range: '8999999999999999100',
  };
  try {
    for (const [siteId, siteCode] of [
      [ids.site1, 'P1_VERIFY_A'],
      [ids.site2, 'P1_VERIFY_B'],
    ])
      await connection.execute(
        `INSERT INTO SYS_SITE
         (SITE_ID, SITE_CODE, SITE_NAME, SEQUENCE_CODE, TIMEZONE_NAME, CREATED_BY, UPDATED_BY)
         VALUES (:siteId, :siteCode, :siteName, :sequenceCode, 'UTC', :actor, :actor)`,
        { siteId, siteCode, siteName: siteCode, sequenceCode: siteCode, actor },
      );
    await expectOracleError(
      () =>
        connection.execute(
          `INSERT INTO SYS_SITE
         (SITE_ID, SITE_CODE, SITE_NAME, SEQUENCE_CODE, TIMEZONE_NAME, CREATED_BY, UPDATED_BY)
         VALUES (:siteId, 'P1_VERIFY_A', 'Duplicate', 'P1_VERIFY_DUP', 'UTC', :actor, :actor)`,
          { siteId: '8999999999999999003', actor },
        ),
      [1],
      'duplicate site code',
    );
    await connection.execute(
      `INSERT INTO SYS_RIG
       (RIG_ID, SITE_ID, RIG_CODE, RIG_NAME, CREATED_SITE_ID, UPDATED_SITE_ID, CREATED_BY, UPDATED_BY)
       VALUES (:rigId, :siteId, 'VERIFY_RIG', 'Verify rig', :siteId, :siteId, :actor, :actor)`,
      { rigId: ids.rig, siteId: ids.site1, actor },
    );
    await connection.execute(
      `INSERT INTO SYS_DEPARTMENT
       (DEPARTMENT_ID, SITE_ID, RIG_ID, DEPARTMENT_CODE, DEPARTMENT_NAME,
        CREATED_SITE_ID, UPDATED_SITE_ID, CREATED_BY, UPDATED_BY)
       VALUES (:departmentId, :siteId, :rigId, 'VERIFY_DEPT', 'Verify department',
        :siteId, :siteId, :actor, :actor)`,
      { departmentId: ids.department, siteId: ids.site1, rigId: ids.rig, actor },
    );
    await expectOracleError(
      () =>
        connection.execute(
          `INSERT INTO SYS_DEPARTMENT
         (DEPARTMENT_ID, SITE_ID, RIG_ID, DEPARTMENT_CODE, DEPARTMENT_NAME,
          CREATED_SITE_ID, UPDATED_SITE_ID, CREATED_BY, UPDATED_BY)
         VALUES (:departmentId, :wrongSiteId, :rigId, 'WRONG_SITE', 'Wrong hierarchy',
          :wrongSiteId, :wrongSiteId, :actor, :actor)`,
          { departmentId: '8999999999999999021', wrongSiteId: ids.site2, rigId: ids.rig, actor },
        ),
      [2291],
      'invalid department hierarchy',
    );
    await expectOracleError(
      () =>
        connection.execute(
          `INSERT INTO SYS_SITE_SEQUENCE_RANGE
         (RANGE_ID, SITE_ID, SEQUENCE_CODE, RANGE_START, RANGE_END, CREATED_BY, UPDATED_BY)
         VALUES (:rangeId, :siteId, 'VERIFY_SEQUENCE', 10, 1, :actor, :actor)`,
          { rangeId: ids.range, siteId: ids.site1, actor },
        ),
      [2290],
      'invalid range bounds',
    );
    await connection.execute(
      `INSERT INTO SYS_ROLE
       (ROLE_ID, ROLE_CODE, ROLE_NAME, CREATED_BY, UPDATED_BY)
       VALUES (:roleId, 'P1_VERIFY_ROLE', 'Verify role', :actor, :actor)`,
      { roleId: ids.role, actor },
    );
    await connection.execute(
      `INSERT INTO SYS_PERMISSION
       (PERMISSION_ID, PERMISSION_CODE, PERMISSION_NAME, PERMISSION_GROUP, CREATED_BY, UPDATED_BY)
       VALUES (:permissionId, 'P1_VERIFY_PERMISSION', 'Verify permission', 'VERIFY', :actor, :actor)`,
      { permissionId: ids.permission, actor },
    );
    await connection.execute(
      `INSERT INTO SYS_USER
       (USER_ID, ENTERPRISE_IDENTITY_KEY, USERNAME, DISPLAY_NAME, DEFAULT_SITE_ID,
        CREATED_SITE_ID, UPDATED_SITE_ID, CREATED_BY, UPDATED_BY)
       VALUES (:userId, 'p1-verify-identity', 'p1-verify-user', 'Verify user', :siteId,
        :siteId, :siteId, :actor, :actor)`,
      { userId: ids.user, siteId: ids.site1, actor },
    );
    await connection.execute(
      `INSERT INTO SYS_USER_ROLE
       (USER_ROLE_ID, USER_ID, ROLE_ID, CREATED_BY, UPDATED_BY)
       VALUES (:assignmentId, :userId, :roleId, :actor, :actor)`,
      { assignmentId: ids.userRole, userId: ids.user, roleId: ids.role, actor },
    );
    await expectOracleError(
      () =>
        connection.execute(
          `INSERT INTO SYS_USER_ROLE
         (USER_ROLE_ID, USER_ID, ROLE_ID, CREATED_BY, UPDATED_BY)
         VALUES (:assignmentId, :userId, :roleId, :actor, :actor)`,
          { assignmentId: '8999999999999999062', userId: ids.user, roleId: ids.role, actor },
        ),
      [1],
      'duplicate active user role',
    );
    await connection.execute(
      `INSERT INTO SYS_USER_ROLE
       (USER_ROLE_ID, USER_ID, ROLE_ID, IS_ACTIVE, REVOKED_AT, CREATED_BY, UPDATED_BY)
       VALUES (:assignmentId, :userId, :roleId, 'N', SYSTIMESTAMP, :actor, :actor)`,
      { assignmentId: ids.inactiveUserRole, userId: ids.user, roleId: ids.role, actor },
    );
    await connection.execute(
      `INSERT INTO SYS_ROLE_PERMISSION
       (ROLE_PERMISSION_ID, ROLE_ID, PERMISSION_ID, CREATED_BY, UPDATED_BY)
       VALUES (:assignmentId, :roleId, :permissionId, :actor, :actor)`,
      { assignmentId: ids.rolePermission, roleId: ids.role, permissionId: ids.permission, actor },
    );
    await expectOracleError(
      () =>
        connection.execute(
          `INSERT INTO SYS_USER_PERMISSION_OVERRIDE
         (USER_PERMISSION_OVERRIDE_ID, USER_ID, PERMISSION_ID, EFFECT_CODE, CREATED_BY, UPDATED_BY)
         VALUES (:overrideId, :userId, :permissionId, 'INVALID', :actor, :actor)`,
          { overrideId: ids.override, userId: ids.user, permissionId: ids.permission, actor },
        ),
      [2290],
      'invalid permission override effect',
    );
    await connection.execute(
      `INSERT INTO SYS_USER_DATA_SCOPE
       (USER_DATA_SCOPE_ID, USER_ID, SCOPE_TYPE, SITE_ID, RIG_ID, CAN_VIEW, CAN_ACT,
        CREATED_BY, UPDATED_BY)
       VALUES (:scopeId, :userId, 'RIG', :siteId, :rigId, 'Y', 'Y', :actor, :actor)`,
      { scopeId: ids.scope, userId: ids.user, siteId: ids.site1, rigId: ids.rig, actor },
    );
    await expectOracleError(
      () =>
        connection.execute(
          `INSERT INTO SYS_USER_DATA_SCOPE
         (USER_DATA_SCOPE_ID, USER_ID, SCOPE_TYPE, SITE_ID, CAN_VIEW, CAN_ACT,
          CREATED_BY, UPDATED_BY)
         VALUES (:scopeId, :userId, 'RIG', :siteId, 'N', 'Y', :actor, :actor)`,
          { scopeId: '8999999999999999091', userId: ids.user, siteId: ids.site1, actor },
        ),
      [2290],
      'invalid scope target/access combination',
    );
    const defaults = await connection.execute<{ ROW_VERSION: string; IS_ACTIVE: string }>(
      `SELECT TO_CHAR(ROW_VERSION) AS ROW_VERSION, IS_ACTIVE FROM SYS_USER WHERE USER_ID = :userId`,
      { userId: ids.user },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (defaults.rows?.[0]?.ROW_VERSION !== '1' || defaults.rows[0].IS_ACTIVE !== 'Y')
      throw new Error('Row version or active defaults are invalid');
    await connection.rollback();
    console.log(JSON.stringify({ status: 'PASS', transactionRolledBack: true, checks: 8 }));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
      oracleErrorCode: (error as { code?: string }).code,
    }),
  );
  process.exitCode = 1;
});
