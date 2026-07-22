import path from 'node:path';
import dotenv from 'dotenv';
import oracledb from 'oracledb';
import { validateEnvironment } from '../src/config/environment';
import { initializeOracleClient } from '../src/common/oracle/oracle-client';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
const enabled = process.env.RUN_ORACLE_INTEGRATION_TESTS === 'true';

(enabled ? describe : describe.skip)('real Oracle integration', () => {
  let pool: oracledb.Pool;
  beforeAll(async () => {
    const environment = validateEnvironment(process.env);
    initializeOracleClient({
      clientMode: environment.ORACLE_CLIENT_MODE,
      clientLibDir: environment.ORACLE_CLIENT_LIB_DIR,
    });
    pool = await oracledb.createPool({
      user: environment.ORACLE_USER,
      password: environment.ORACLE_PASSWORD,
      connectString: environment.ORACLE_CONNECT_STRING,
      poolMin: 1,
      poolMax: 3,
      poolIncrement: 1,
      queueTimeout: environment.ORACLE_QUEUE_TIMEOUT_MS,
    });
  });
  afterAll(async () => {
    if (pool) await pool.close(10);
  });

  it('creates a pool, acquires/releases connections, and executes SELECT 1', async () => {
    const connection = await pool.getConnection();
    try {
      const result = await connection.execute<{ RESULT: number }>(
        'SELECT 1 AS RESULT FROM DUAL',
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      expect(result.rows?.[0]?.RESULT).toBe(1);
    } finally {
      await connection.close();
    }
  });

  it('handles 30 repeated pooled readiness queries', async () => {
    for (let index = 0; index < 30; index += 1) {
      const connection = await pool.getConnection();
      try {
        await connection.execute('SELECT 1 AS RESULT FROM DUAL');
      } finally {
        await connection.close();
      }
    }
    expect(pool.connectionsInUse).toBe(0);
  });

  it('verifies commit and rollback with a disposable technical table', async () => {
    const connection = await pool.getConnection();
    const tableName = 'JSA_INT_TX_TEST';
    try {
      const existing = await connection.execute<{ TABLE_COUNT: number }>(
        `SELECT COUNT(*) AS TABLE_COUNT FROM USER_TABLES WHERE TABLE_NAME = :tableName`,
        { tableName },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if (existing.rows?.[0]?.TABLE_COUNT !== 0)
        throw new Error(`${tableName} already exists; refusing to alter it`);
      await connection.execute(`CREATE TABLE ${tableName} (TEST_ID NUMBER(10) PRIMARY KEY)`);
      await connection.execute(`INSERT INTO ${tableName} (TEST_ID) VALUES (:testId)`, {
        testId: 1,
      });
      await connection.commit();
      const committed = await connection.execute<{ ROW_COUNT: number }>(
        `SELECT COUNT(*) AS ROW_COUNT FROM ${tableName}`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      expect(committed.rows?.[0]?.ROW_COUNT).toBe(1);
      await connection.execute(`DELETE FROM ${tableName}`);
      await connection.commit();
      await connection.execute(`INSERT INTO ${tableName} (TEST_ID) VALUES (:testId)`, {
        testId: 2,
      });
      await connection.rollback();
      const rolledBack = await connection.execute<{ ROW_COUNT: number }>(
        `SELECT COUNT(*) AS ROW_COUNT FROM ${tableName}`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      expect(rolledBack.rows?.[0]?.ROW_COUNT).toBe(0);
    } finally {
      try {
        await connection.execute(`DROP TABLE ${tableName} PURGE`);
      } catch {
        /* table may not have been created */
      }
      await connection.close();
    }
  });
});
