import path from 'node:path';
import dotenv from 'dotenv';
import oracledb from 'oracledb';
import { validateEnvironment } from '../src/config/environment';
import {
  initializeOracleClient,
  maskOracleTarget,
  oracleDiagnosticHint,
  oracleErrorCode,
} from '../src/common/oracle/oracle-client';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

interface ContextRow {
  DB_NAME: string;
  SERVICE_NAME: string;
  CURRENT_SCHEMA: string;
  SESSION_USER: string;
}
interface VersionRow {
  VERSION?: string;
  BANNER?: string;
}
interface CountRow {
  OBJECT_COUNT: number;
}
interface PrivilegeRow {
  PRIVILEGE: string;
}

async function main(): Promise<void> {
  console.log('Oracle diagnostic');
  const environment = validateEnvironment(process.env);
  console.log(`Client mode: ${environment.ORACLE_CLIENT_MODE}`);
  if (environment.ORACLE_CLIENT_LIB_DIR)
    console.log(`Oracle client directory: ${environment.ORACLE_CLIENT_LIB_DIR}`);
  console.log(`Target: ${maskOracleTarget(environment.ORACLE_CONNECT_STRING)}`);

  initializeOracleClient({
    clientMode: environment.ORACLE_CLIENT_MODE,
    clientLibDir: environment.ORACLE_CLIENT_LIB_DIR,
  });
  console.log('Oracle client initialization: PASS');

  let pool: oracledb.Pool | undefined;
  let connection: oracledb.Connection | undefined;
  try {
    pool = await oracledb.createPool({
      user: environment.ORACLE_USER,
      password: environment.ORACLE_PASSWORD,
      connectString: environment.ORACLE_CONNECT_STRING,
      poolMin: environment.ORACLE_POOL_MIN,
      poolMax: environment.ORACLE_POOL_MAX,
      poolIncrement: environment.ORACLE_POOL_INCREMENT,
      poolTimeout: environment.ORACLE_POOL_TIMEOUT_SECONDS,
      queueTimeout: environment.ORACLE_QUEUE_TIMEOUT_MS,
      stmtCacheSize: environment.ORACLE_STATEMENT_CACHE_SIZE,
      events: environment.ORACLE_ENABLE_EVENTS,
    });
    console.log('Pool creation: PASS');
    connection = await pool.getConnection();
    console.log('Connection acquisition: PASS');
    const ping = await connection.execute<{ RESULT: number }>(
      'SELECT 1 AS RESULT FROM DUAL',
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (ping.rows?.[0]?.RESULT !== 1) throw new Error('SELECT 1 returned an unexpected result');
    console.log('SELECT 1 FROM DUAL: PASS');

    const context = await connection.execute<ContextRow>(
      `SELECT SYS_CONTEXT('USERENV', 'DB_NAME') AS DB_NAME,
              SYS_CONTEXT('USERENV', 'SERVICE_NAME') AS SERVICE_NAME,
              SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS CURRENT_SCHEMA,
              SYS_CONTEXT('USERENV', 'SESSION_USER') AS SESSION_USER FROM DUAL`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = context.rows?.[0];
    console.log(`Database: ${row?.DB_NAME ?? 'unknown'}`);
    console.log(`Service: ${row?.SERVICE_NAME ?? 'unknown'}`);
    console.log(`Current schema: ${row?.CURRENT_SCHEMA ?? 'unknown'}`);
    console.log(`Session user: ${row?.SESSION_USER ?? 'unknown'}`);

    const productVersion = await connection.execute<VersionRow>(
      "SELECT VERSION FROM PRODUCT_COMPONENT_VERSION WHERE UPPER(PRODUCT) LIKE '%ORACLE%DATABASE%' AND ROWNUM = 1",
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    let databaseVersion = productVersion.rows?.[0]?.VERSION;
    if (!databaseVersion) {
      try {
        const banner = await connection.execute<VersionRow>(
          "SELECT BANNER FROM V$VERSION WHERE UPPER(BANNER) LIKE 'ORACLE DATABASE%' AND ROWNUM = 1",
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        databaseVersion = banner.rows?.[0]?.BANNER;
      } catch {
        // V$VERSION may not be granted to an application account.
      }
    }
    console.log(`Database version: ${databaseVersion ?? 'not available to this account'}`);

    const objects = await connection.execute<CountRow>(
      `SELECT COUNT(*) AS OBJECT_COUNT FROM USER_OBJECTS
       WHERE OBJECT_NAME NOT IN ('JSA_SCHEMA_VERSION', 'PK_JSA_SCHEMA_VERSION', 'CHK_JSA_SCHEMA_VER_STATUS')`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    console.log(`Unrelated schema objects: ${objects.rows?.[0]?.OBJECT_COUNT ?? 'unknown'}`);
    const privileges = await connection.execute<PrivilegeRow>(
      "SELECT PRIVILEGE FROM USER_SYS_PRIVS WHERE PRIVILEGE IN ('CREATE SESSION','CREATE TABLE','CREATE SEQUENCE','CREATE VIEW','CREATE PROCEDURE') ORDER BY PRIVILEGE",
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    console.log(
      `Development privileges: ${(privileges.rows ?? []).map((item) => item.PRIVILEGE).join(', ') || 'none visible'}`,
    );
  } finally {
    if (connection) {
      await connection.close();
      console.log('Connection release: PASS');
    }
    if (pool) {
      await pool.close(10);
      console.log('Pool close: PASS');
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const configurationError = message.startsWith('Invalid application configuration:');
  console.error(`Step failed: Oracle diagnostic`);
  console.error(`Error code: ${oracleErrorCode(error) ?? 'CONFIGURATION_ERROR'}`);
  console.error(`Explanation: ${configurationError ? message : oracleDiagnosticHint(error)}`);
  console.error('Suggested action: configure the ignored root .env and rerun the command.');
  process.exitCode = 1;
});
