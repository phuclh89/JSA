import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';

const sequences = [
  'SEQ_SYS_SITE',
  'SEQ_SYS_RIG',
  'SEQ_SYS_DEPARTMENT',
  'SEQ_SYS_SITE_SEQ_RANGE',
  'SEQ_SYS_USER',
  'SEQ_SYS_ROLE',
  'SEQ_SYS_PERMISSION',
  'SEQ_SYS_USER_ROLE',
  'SEQ_SYS_ROLE_PERMISSION',
  'SEQ_SYS_USER_PERM_OVERRIDE',
  'SEQ_SYS_USER_DATA_SCOPE',
] as const;
type SequenceName = (typeof sequences)[number];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required Phase 1 bootstrap configuration: ${name}`);
  return value;
}
function decimal(name: string): bigint {
  const value = required(name);
  if (!/^\d{1,19}$/.test(value)) throw new Error(`${name} must be a decimal NUMBER(19) value`);
  return BigInt(value);
}
async function nextId(connection: oracledb.Connection, sequence: SequenceName): Promise<string> {
  const result = await connection.execute<{ ID_VALUE: string }>(
    `SELECT TO_CHAR(${sequence}.NEXTVAL) AS ID_VALUE FROM DUAL`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const value = result.rows?.[0]?.ID_VALUE;
  if (!value) throw new Error(`Could not allocate an ID from ${sequence}`);
  return value;
}

async function main(): Promise<void> {
  const siteCode = required('BOOTSTRAP_SITE_CODE').toUpperCase();
  const siteName = required('BOOTSTRAP_SITE_NAME');
  const timezone = required('BOOTSTRAP_SITE_TIMEZONE');
  const rangeStart = decimal('BOOTSTRAP_SEQUENCE_RANGE_START');
  const rangeEnd = decimal('BOOTSTRAP_SEQUENCE_RANGE_END');
  if (rangeStart > rangeEnd) throw new Error('Bootstrap sequence range start must not exceed end');
  if (rangeEnd - rangeStart + 1n < BigInt(sequences.length))
    throw new Error('Bootstrap sequence range is too small for initial governed metadata');
  const identityKey = required('BOOTSTRAP_ADMIN_IDENTITY_KEY');
  const username = required('BOOTSTRAP_ADMIN_USERNAME');
  const displayName = required('BOOTSTRAP_ADMIN_DISPLAY_NAME');
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || undefined;
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const existing = await connection.execute<{ ITEM_COUNT: number }>(
      'SELECT COUNT(*) AS ITEM_COUNT FROM SYS_SITE WHERE UPPER(SITE_CODE) = :siteCode',
      { siteCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((existing.rows?.[0]?.ITEM_COUNT ?? 0) > 0)
      throw new Error('Bootstrap refused: the configured site already exists');
    const overlap = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) AS ITEM_COUNT FROM SYS_SITE_SEQUENCE_RANGE
       WHERE SEQUENCE_CODE IN (${sequences.map((_, index) => `:sequence${index}`).join(',')})
         AND IS_ACTIVE = 'Y' AND RANGE_START <= :rangeEnd AND RANGE_END >= :rangeStart`,
      {
        ...Object.fromEntries(sequences.map((name, index) => [`sequence${index}`, name])),
        rangeStart: rangeStart.toString(),
        rangeEnd: rangeEnd.toString(),
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((overlap.rows?.[0]?.ITEM_COUNT ?? 0) > 0)
      throw new Error('Bootstrap refused: the configured range overlaps active governed ranges');

    for (const sequence of sequences)
      await connection.execute(
        `ALTER SEQUENCE ${sequence} RESTART START WITH ${rangeStart.toString()}`,
      );

    const siteId = await nextId(connection, 'SEQ_SYS_SITE');
    await connection.execute(
      `INSERT INTO SYS_SITE
       (SITE_ID, SITE_CODE, SITE_NAME, SEQUENCE_CODE, TIMEZONE_NAME, CREATED_BY, UPDATED_BY)
       VALUES (:siteId, :siteCode, :siteName, :sequenceCode, :timezone, :actor, :actor)`,
      { siteId, siteCode, siteName, sequenceCode: siteCode, timezone, actor: username },
    );
    for (const sequence of sequences) {
      const rangeId = await nextId(connection, 'SEQ_SYS_SITE_SEQ_RANGE');
      await connection.execute(
        `INSERT INTO SYS_SITE_SEQUENCE_RANGE
         (RANGE_ID, SITE_ID, SEQUENCE_CODE, RANGE_START, RANGE_END, CREATED_BY, UPDATED_BY)
         VALUES (:rangeId, :siteId, :sequenceCode, :rangeStart, :rangeEnd, :actor, :actor)`,
        {
          rangeId,
          siteId,
          sequenceCode: sequence,
          rangeStart: rangeStart.toString(),
          rangeEnd: rangeEnd.toString(),
          actor: username,
        },
      );
    }
    const healthPermissionId = await nextId(connection, 'SEQ_SYS_PERMISSION');
    const adminPermissionId = await nextId(connection, 'SEQ_SYS_PERMISSION');
    await connection.execute(
      `INSERT ALL
       INTO SYS_PERMISSION (PERMISSION_ID, PERMISSION_CODE, PERMISSION_NAME, PERMISSION_GROUP, IS_ACTIVE, CREATED_BY, UPDATED_BY)
       VALUES (:healthId, 'SYSTEM_HEALTH_VIEW', 'View system health', 'SYSTEM', 'Y', :actor, :actor)
       INTO SYS_PERMISSION (PERMISSION_ID, PERMISSION_CODE, PERMISSION_NAME, PERMISSION_GROUP, IS_ACTIVE, CREATED_BY, UPDATED_BY)
       VALUES (:adminId, 'SYSTEM_ADMIN', 'Administer security foundation', 'SYSTEM', 'Y', :actor, :actor)
       SELECT 1 FROM DUAL`,
      { healthId: healthPermissionId, adminId: adminPermissionId, actor: username },
    );
    const roleId = await nextId(connection, 'SEQ_SYS_ROLE');
    await connection.execute(
      `INSERT INTO SYS_ROLE
       (ROLE_ID, ROLE_CODE, ROLE_NAME, DESCRIPTION, IS_SYSTEM_MANAGED, CREATED_BY, UPDATED_BY)
       VALUES (:roleId, 'SYSTEM_ADMIN', 'System Administrator', 'Phase 1 bootstrap administrator', 'Y', :actor, :actor)`,
      { roleId, actor: username },
    );
    const userId = await nextId(connection, 'SEQ_SYS_USER');
    await connection.execute(
      `INSERT INTO SYS_USER
       (USER_ID, ENTERPRISE_IDENTITY_KEY, USERNAME, DISPLAY_NAME, EMAIL, DEFAULT_SITE_ID,
        CREATED_SITE_ID, UPDATED_SITE_ID, CREATED_BY, UPDATED_BY)
       VALUES (:userId, :identityKey, :username, :displayName, :email, :siteId,
        :siteId, :siteId, :actor, :actor)`,
      { userId, identityKey, username, displayName, email: email ?? null, siteId, actor: username },
    );
    await connection.execute(
      `INSERT INTO SYS_USER_ROLE
       (USER_ROLE_ID, USER_ID, ROLE_ID, CREATED_BY, UPDATED_BY)
       VALUES (:assignmentId, :userId, :roleId, :actor, :actor)`,
      {
        assignmentId: await nextId(connection, 'SEQ_SYS_USER_ROLE'),
        userId,
        roleId,
        actor: username,
      },
    );
    for (const permissionId of [healthPermissionId, adminPermissionId])
      await connection.execute(
        `INSERT INTO SYS_ROLE_PERMISSION
         (ROLE_PERMISSION_ID, ROLE_ID, PERMISSION_ID, CREATED_BY, UPDATED_BY)
         VALUES (:assignmentId, :roleId, :permissionId, :actor, :actor)`,
        {
          assignmentId: await nextId(connection, 'SEQ_SYS_ROLE_PERMISSION'),
          roleId,
          permissionId,
          actor: username,
        },
      );
    await connection.execute(
      `INSERT INTO SYS_USER_DATA_SCOPE
       (USER_DATA_SCOPE_ID, USER_ID, SCOPE_TYPE, SITE_ID, CAN_VIEW, CAN_ACT, CREATED_BY, UPDATED_BY)
       VALUES (:scopeId, :userId, 'SITE', :siteId, 'Y', 'Y', :actor, :actor)`,
      {
        scopeId: await nextId(connection, 'SEQ_SYS_USER_DATA_SCOPE'),
        userId,
        siteId,
        actor: username,
      },
    );
    await connection.commit();
    console.log(JSON.stringify({ status: 'PASS', siteCode, siteId, adminUsername: username }));
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
    }),
  );
  process.exitCode = 1;
});
