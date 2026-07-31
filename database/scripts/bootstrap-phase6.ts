import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

const sequence = 'SEQ_JSA_USER_FAVORITE';

async function main() {
  loadDatabaseEnvironment();
  const siteId = process.env.LOCAL_SITE_ID?.trim();
  const actor = process.env.PHASE6_BOOTSTRAP_ACTOR?.trim();
  if (!siteId || !/^\d{1,19}$/.test(siteId))
    throw new Error('LOCAL_SITE_ID is required and must be a NUMBER(19) identifier');
  if (!actor) throw new Error('PHASE6_BOOTSTRAP_ACTOR is required');

  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const migration = await connection.execute<{ C: number }>(
      `SELECT COUNT(*) C FROM JSA_SCHEMA_VERSION
        WHERE MIGRATION_ID='016' AND STATUS_CODE='APPLIED'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (migration.rows?.[0]?.C !== 1)
      throw new Error('Phase 6 bootstrap requires applied migration 016');
    const range = await connection.execute<{
      RANGE_START: string;
      RANGE_END: string;
      VARIANTS: number;
    }>(
      `SELECT TO_CHAR(MIN(RANGE_START)) RANGE_START,TO_CHAR(MAX(RANGE_END)) RANGE_END,
              COUNT(DISTINCT TO_CHAR(RANGE_START)||':'||TO_CHAR(RANGE_END)) VARIANTS
         FROM SYS_SITE_SEQUENCE_RANGE
        WHERE SITE_ID=:siteId AND IS_ACTIVE='Y'
          AND EFFECTIVE_FROM<=SYSTIMESTAMP
          AND (EFFECTIVE_TO IS NULL OR EFFECTIVE_TO>=SYSTIMESTAMP)`,
      { siteId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const approved = range.rows?.[0];
    if (!approved?.RANGE_START || approved.VARIANTS !== 1)
      throw new Error('Phase 6 bootstrap refused: Site range is missing or inconsistent');

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
    if (existing.rows?.[0]?.C !== 0)
      throw new Error('Phase 6 bootstrap refused: inconsistent sequence configuration');

    await connection.execute(
      `ALTER SEQUENCE ${sequence} RESTART START WITH ${approved.RANGE_START}`,
    );
    const id = await connection.execute<{ ID: string }>(
      `SELECT TO_CHAR(SEQ_SYS_SITE_SEQ_RANGE.NEXTVAL) ID FROM DUAL`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (!id.rows?.[0]?.ID) throw new Error('Could not allocate sequence-range identifier');
    await connection.execute(
      `INSERT INTO SYS_SITE_SEQUENCE_RANGE
       (RANGE_ID,SITE_ID,SEQUENCE_CODE,RANGE_START,RANGE_END,CREATED_BY,UPDATED_BY)
       VALUES(:id,:siteId,:sequence,:rangeStart,:rangeEnd,:actor,:actor)`,
      {
        id: id.rows[0].ID,
        siteId,
        sequence,
        rangeStart: approved.RANGE_START,
        rangeEnd: approved.RANGE_END,
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
