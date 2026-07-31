import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

const sequences = ['SEQ_JSA_TRANSLATION', 'SEQ_JSA_TRANSL_SEGMENT', 'SEQ_JSA_TRANSL_ACTION'];

async function main() {
  loadDatabaseEnvironment();
  const siteId = process.env.LOCAL_SITE_ID?.trim();
  const actor = process.env.PHASE7_BOOTSTRAP_ACTOR?.trim();
  if (!siteId || !/^\d{1,19}$/.test(siteId))
    throw new Error('LOCAL_SITE_ID is required and must be a NUMBER(19) identifier');
  if (!actor) throw new Error('PHASE7_BOOTSTRAP_ACTOR is required');
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const migration = await connection.execute<{ C: number }>(
      `SELECT COUNT(*) C FROM JSA_SCHEMA_VERSION
       WHERE MIGRATION_ID='018' AND STATUS_CODE='APPLIED'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (migration.rows?.[0]?.C !== 1)
      throw new Error('Phase 7 bootstrap requires applied migration 018');
    const range = await connection.execute<{
      RANGE_START: string;
      RANGE_END: string;
      VARIANTS: number;
    }>(
      `SELECT TO_CHAR(MIN(RANGE_START)) RANGE_START,TO_CHAR(MAX(RANGE_END)) RANGE_END,
        COUNT(DISTINCT TO_CHAR(RANGE_START)||':'||TO_CHAR(RANGE_END)) VARIANTS
       FROM SYS_SITE_SEQUENCE_RANGE
       WHERE SITE_ID=:siteId AND IS_ACTIVE='Y' AND EFFECTIVE_FROM<=SYSTIMESTAMP
        AND (EFFECTIVE_TO IS NULL OR EFFECTIVE_TO>=SYSTIMESTAMP)`,
      { siteId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const approved = range.rows?.[0];
    if (!approved?.RANGE_START || !approved.RANGE_END || approved.VARIANTS !== 1)
      throw new Error('Phase 7 bootstrap refused: Site range is missing or inconsistent');
    const existing = await connection.execute<{ SEQUENCE_CODE: string }>(
      `SELECT SEQUENCE_CODE FROM SYS_SITE_SEQUENCE_RANGE
       WHERE SITE_ID=:siteId AND SEQUENCE_CODE IN
        ('SEQ_JSA_TRANSLATION','SEQ_JSA_TRANSL_SEGMENT','SEQ_JSA_TRANSL_ACTION')`,
      { siteId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((existing.rows?.length ?? 0) === sequences.length) {
      console.log(
        JSON.stringify({ status: 'SKIPPED', siteId, configuredSequenceCount: sequences.length }),
      );
      return;
    }
    if ((existing.rows?.length ?? 0) !== 0)
      throw new Error('Phase 7 bootstrap refused: partial sequence configuration');
    for (const sequence of sequences) {
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
    }
    await connection.commit();
    console.log(
      JSON.stringify({ status: 'PASS', siteId, configuredSequenceCount: sequences.length }),
    );
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
