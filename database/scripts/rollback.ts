import oracledb from 'oracledb';
import { connectionConfig, history, loadSqlFiles, rollbackLatest } from './migration-core.js';
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Production rollback is disabled by the Phase 0A safety policy');
  if (process.env.NODE_ENV !== 'test' && process.env.CONFIRM_DEVELOPMENT_ROLLBACK !== 'YES')
    throw new Error('Development rollback requires CONFIRM_DEVELOPMENT_ROLLBACK=YES');
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const context = await connection.execute<{
      CURRENT_SCHEMA: string;
      SESSION_USER: string;
      SERVICE_NAME: string;
    }>(
      `SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS CURRENT_SCHEMA,
              SYS_CONTEXT('USERENV','SESSION_USER') AS SESSION_USER,
              SYS_CONTEXT('USERENV','SERVICE_NAME') AS SERVICE_NAME FROM DUAL`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const session = context.rows?.[0];
    const expectedUser = process.env.ORACLE_USER?.toUpperCase();
    const expectedService = process.env.ORACLE_CONNECT_STRING?.split('/')[1]
      ?.split('?')[0]
      ?.toUpperCase();
    if (
      !expectedUser ||
      session?.CURRENT_SCHEMA.toUpperCase() !== expectedUser ||
      session.SESSION_USER.toUpperCase() !== expectedUser
    )
      throw new Error('Rollback refused: current schema and session user do not match ORACLE_USER');
    if (!expectedService || session.SERVICE_NAME.toUpperCase() !== expectedService)
      throw new Error('Rollback refused: connected service does not match ORACLE_CONNECT_STRING');
    const existing = await history(connection);
    if (existing.some((item) => item.MIGRATION_ID === '002' && item.STATUS_CODE === 'APPLIED')) {
      const phase1Objects = await connection.execute<{ OBJECT_COUNT: number }>(
        `SELECT COUNT(*) AS OBJECT_COUNT FROM USER_TABLES
         WHERE TABLE_NAME IN ('SYS_SITE','SYS_RIG','SYS_DEPARTMENT','SYS_SITE_SEQUENCE_RANGE',
           'SYS_USER','SYS_ROLE','SYS_PERMISSION','SYS_USER_ROLE','SYS_ROLE_PERMISSION',
           'SYS_USER_PERMISSION_OVERRIDE','SYS_USER_DATA_SCOPE')`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if (phase1Objects.rows?.[0]?.OBJECT_COUNT !== 11)
        throw new Error('Rollback refused: Phase 1 ownership markers are incomplete');
    }
    if (existing.some((item) => item.MIGRATION_ID === '001' && item.STATUS_CODE === 'APPLIED')) {
      const metadata = await connection.execute<{ OBJECT_COUNT: number }>(
        `SELECT COUNT(*) AS OBJECT_COUNT
         FROM USER_CONSTRAINTS
         WHERE TABLE_NAME = :tableName
           AND CONSTRAINT_NAME IN (:primaryKeyName, :statusCheckName)`,
        {
          tableName: 'JSA_SCHEMA_VERSION',
          primaryKeyName: 'PK_JSA_SCHEMA_VERSION',
          statusCheckName: 'CHK_JSA_SCHEMA_VER_STATUS',
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if (metadata.rows?.[0]?.OBJECT_COUNT !== 2)
        throw new Error(
          'Rollback refused: migration 001 constraints do not match JSAMS ownership markers',
        );
    }
    const started = Date.now();
    const migrationId = await rollbackLatest(connection, existing, await loadSqlFiles('rollback'));
    if (!migrationId) {
      console.log(JSON.stringify({ status: 'nothing_to_rollback' }));
      return;
    }
    console.log(
      JSON.stringify({
        migrationId,
        status: 'rolled_back',
        executionMs: Date.now() - started,
      }),
    );
  } finally {
    await connection.close();
  }
}
main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      oracleErrorCode: (error as { errorNum?: number }).errorNum,
    }),
  );
  process.exitCode = 1;
});
