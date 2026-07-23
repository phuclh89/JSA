import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';

const sequences = [
  'SEQ_SYS_JOB_TYPE',
  'SEQ_SYS_HAZARD_PROMPT',
  'SEQ_SYS_POSITION',
  'SEQ_SYS_TOOL_CATEGORY',
  'SEQ_SYS_TOOL',
  'SEQ_SYS_LANGUAGE',
  'SEQ_SYS_PROCEDURE_REF',
  'SEQ_SYS_SYSTEM_PARAMETER',
  'SEQ_JSA_RISK_MATRIX',
  'SEQ_JSA_RISK_MATRIX_VER',
  'SEQ_JSA_RISK_LIKELIHOOD',
  'SEQ_JSA_RISK_SEVERITY',
  'SEQ_JSA_RISK_RESULT',
  'SEQ_JSA_RISK_MATRIX_CELL',
  'SEQ_JSA_RIG_MATRIX_ASSIGN',
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required Phase 2 bootstrap configuration: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const siteId = required('LOCAL_SITE_ID');
  if (!/^\d{1,19}$/.test(siteId))
    throw new Error('LOCAL_SITE_ID must be a decimal NUMBER(19) value');
  const actor = required('PHASE2_BOOTSTRAP_ACTOR');
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const migration = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='004' AND STATUS_CODE='APPLIED'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (migration.rows?.[0]?.ITEM_COUNT !== 1)
      throw new Error('Phase 2 bootstrap requires applied migration 004');
    const ranges = await connection.execute<{
      RANGE_START: string;
      RANGE_END: string;
      RANGE_VARIANTS: number;
    }>(
      `SELECT TO_CHAR(MIN(RANGE_START)) RANGE_START,TO_CHAR(MAX(RANGE_END)) RANGE_END,COUNT(DISTINCT TO_CHAR(RANGE_START)||':'||TO_CHAR(RANGE_END)) RANGE_VARIANTS FROM SYS_SITE_SEQUENCE_RANGE WHERE SITE_ID=:siteId AND IS_ACTIVE='Y'`,
      { siteId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const range = ranges.rows?.[0];
    if (!range?.RANGE_START || !range.RANGE_END || range.RANGE_VARIANTS !== 1)
      throw new Error('Phase 2 bootstrap requires one consistent approved Phase 1 site range');
    const existing = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM SYS_SITE_SEQUENCE_RANGE WHERE SITE_ID=:siteId AND SEQUENCE_CODE IN (${sequences.map((_, index) => `:sequence${index}`).join(',')})`,
      { siteId, ...Object.fromEntries(sequences.map((name, index) => [`sequence${index}`, name])) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((existing.rows?.[0]?.ITEM_COUNT ?? 0) > 0)
      throw new Error('Phase 2 bootstrap refused: one or more sequence ranges already exist');
    const overlap = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM SYS_SITE_SEQUENCE_RANGE WHERE SITE_ID<>:siteId AND IS_ACTIVE='Y' AND SEQUENCE_CODE IN (${sequences.map((_, index) => `:sequence${index}`).join(',')}) AND RANGE_START<=:rangeEnd AND RANGE_END>=:rangeStart`,
      {
        siteId,
        rangeStart: range.RANGE_START,
        rangeEnd: range.RANGE_END,
        ...Object.fromEntries(sequences.map((name, index) => [`sequence${index}`, name])),
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((overlap.rows?.[0]?.ITEM_COUNT ?? 0) > 0)
      throw new Error('Phase 2 bootstrap refused: approved range overlaps another site');
    for (const sequence of sequences)
      await connection.execute(
        `ALTER SEQUENCE ${sequence} RESTART START WITH ${range.RANGE_START}`,
      );
    for (const sequence of sequences) {
      const idResult = await connection.execute<{ ID_VALUE: string }>(
        'SELECT TO_CHAR(SEQ_SYS_SITE_SEQ_RANGE.NEXTVAL) ID_VALUE FROM DUAL',
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const rangeId = idResult.rows?.[0]?.ID_VALUE;
      if (!rangeId) throw new Error('Could not allocate site sequence range ID');
      await connection.execute(
        `INSERT INTO SYS_SITE_SEQUENCE_RANGE (RANGE_ID,SITE_ID,SEQUENCE_CODE,RANGE_START,RANGE_END,CREATED_BY,UPDATED_BY) VALUES (:rangeId,:siteId,:sequenceCode,:rangeStart,:rangeEnd,:actor,:actor)`,
        {
          rangeId,
          siteId,
          sequenceCode: sequence,
          rangeStart: range.RANGE_START,
          rangeEnd: range.RANGE_END,
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
main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
