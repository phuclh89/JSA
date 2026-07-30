import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

loadDatabaseEnvironment();
const sequence = 'SEQ_SYS_ACCESS_ADMIN_AUDIT';
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required Phase 4.5 bootstrap configuration: ${name}`);
  return value;
};

async function main() {
  const siteId = required('LOCAL_SITE_ID');
  const actor = required('PHASE45_BOOTSTRAP_ACTOR');
  if (!/^\d{1,19}$/.test(siteId))
    throw new Error('LOCAL_SITE_ID must be a decimal NUMBER(19) value');
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const migration = await connection.execute<{ C: number }>(
      `SELECT COUNT(*) C FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='007' AND STATUS_CODE='APPLIED'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (migration.rows?.[0]?.C !== 1)
      throw new Error('Phase 4.5 bootstrap requires applied migration 007');
    const ranges = await connection.execute<{ RANGE_START: string; RANGE_END: string; V: number }>(
      `SELECT TO_CHAR(MIN(RANGE_START)) RANGE_START,TO_CHAR(MAX(RANGE_END)) RANGE_END,
              COUNT(DISTINCT TO_CHAR(RANGE_START)||':'||TO_CHAR(RANGE_END)) V
       FROM SYS_SITE_SEQUENCE_RANGE WHERE SITE_ID=:siteId AND IS_ACTIVE='Y'`,
      { siteId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const range = ranges.rows?.[0];
    if (!range?.RANGE_START || !range.RANGE_END || range.V !== 1)
      throw new Error('Phase 4.5 bootstrap requires one consistent approved site range');
    const existing = await connection.execute<{ C: number }>(
      `SELECT COUNT(*) C FROM SYS_SITE_SEQUENCE_RANGE
       WHERE SITE_ID=:siteId AND SEQUENCE_CODE=:sequence`,
      { siteId, sequence },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (existing.rows?.[0]?.C === 1) {
      console.log(JSON.stringify({ status: 'SKIPPED', siteId, configuredSequenceCount: 1 }));
      return;
    }
    await connection.execute(`ALTER SEQUENCE ${sequence} RESTART START WITH ${range.RANGE_START}`);
    const id = await connection.execute<{ ID: string }>(
      `SELECT TO_CHAR(SEQ_SYS_SITE_SEQ_RANGE.NEXTVAL) ID FROM DUAL`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    await connection.execute(
      `INSERT INTO SYS_SITE_SEQUENCE_RANGE
       (RANGE_ID,SITE_ID,SEQUENCE_CODE,RANGE_START,RANGE_END,CREATED_BY,UPDATED_BY)
       VALUES(:id,:siteId,:sequence,:rangeStart,:rangeEnd,:actor,:actor)`,
      {
        id: id.rows?.[0]?.ID,
        siteId,
        sequence,
        rangeStart: range.RANGE_START,
        rangeEnd: range.RANGE_END,
        actor,
      },
    );
    await connection.commit();
    console.log(JSON.stringify({ status: 'PASS', siteId, configuredSequenceCount: 1 }));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
