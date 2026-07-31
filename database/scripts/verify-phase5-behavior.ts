import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';

type Row = Record<string, any>;
const connection = await oracledb.getConnection(connectionConfig());
try {
  const metadata = await connection.execute<Row>(
    `SELECT
       (SELECT COUNT(*) FROM JSA_SCHEMA_VERSION
        WHERE MIGRATION_ID IN ('014','015') AND STATUS_CODE='APPLIED') MIGRATION_COUNT,
       (SELECT COUNT(*) FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME='JSA_MASTER'
          AND COLUMN_NAME IN ('CHECKED_OUT_BY_USER_ID','CHECKED_OUT_BY_USERNAME',
            'CHECKED_OUT_BY_DISPLAY_NAME','CHECKED_OUT_AT')) CHECKOUT_COLUMN_COUNT,
       (SELECT COUNT(*) FROM USER_INDEXES
        WHERE INDEX_NAME IN ('IX_JSA_MASTER_CURRENT_WORKING','IX_JSA_VERSION_BASE')) INDEX_COUNT,
       (SELECT COUNT(*) FROM USER_OBJECTS
        WHERE OBJECT_NAME IN ('JSA_ASSERT_VERSION_MUTABLE','TRG_JSA_VER_IMMUTABLE')
          AND STATUS='VALID') IMMUTABILITY_OBJECT_COUNT,
       (SELECT COUNT(*) FROM USER_OBJECTS
        WHERE STATUS='VALID'
          AND (OBJECT_NAME='JSA_ASSERT_VERSION_MUTABLE'
            OR OBJECT_NAME IN ('TRG_JSA_VER_IMMUTABLE','TRG_JSA_PROMPT_IMMUTABLE',
              'TRG_JSA_COVER_IMMUTABLE','TRG_JSA_TASK_IMMUTABLE',
              'TRG_JSA_HAZARD_IMMUTABLE','TRG_JSA_CONTROL_IMUTABLE',
              'TRG_JSA_STEP_IMMUTABLE','TRG_JSA_PERF_IMMUTABLE',
              'TRG_JSA_SUP_IMMUTABLE','TRG_JSA_TOOL_IMMUTABLE',
              'TRG_JSA_PROC_IMMUTABLE','TRG_JSA_ATTACH_IMMUTABLE'))) ALL_GUARD_COUNT
     FROM DUAL`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const row = metadata.rows?.[0];
  if (
    !row ||
    row.MIGRATION_COUNT !== 2 ||
    row.CHECKOUT_COLUMN_COUNT !== 4 ||
    row.INDEX_COUNT !== 2 ||
    row.IMMUTABILITY_OBJECT_COUNT !== 2 ||
    row.ALL_GUARD_COUNT !== 13
  )
    throw new Error(`Phase 5 schema metadata verification failed: ${JSON.stringify(row)}`);

  const published = await connection.execute<Row>(
    `SELECT TO_CHAR(JSA_VERSION_ID) VERSION_ID
     FROM JSA_VERSION WHERE VERSION_STATUS='PUBLISHED'
     ORDER BY JSA_VERSION_ID FETCH FIRST 1 ROW ONLY`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const versionId = published.rows?.[0]?.VERSION_ID as string | undefined;
  let transition = 'SKIPPED_NO_PUBLISHED_FIXTURE';
  if (versionId) {
    const changed = await connection.execute(
      `UPDATE JSA_VERSION SET VERSION_STATUS='SUPERSEDED',UPDATED_BY='VERIFY_PHASE5',
       UPDATED_AT=SYSTIMESTAMP,ROW_VERSION=ROW_VERSION+1
       WHERE JSA_VERSION_ID=:versionId AND VERSION_STATUS='PUBLISHED'`,
      { versionId },
    );
    if (changed.rowsAffected !== 1)
      throw new Error('Published to Superseded transition was not allowed');
    try {
      await connection.execute(
        `UPDATE JSA_VERSION SET JOB_TITLE=JOB_TITLE||' forbidden'
         WHERE JSA_VERSION_ID=:versionId`,
        { versionId },
      );
      throw new Error('Superseded content mutation was unexpectedly allowed');
    } catch (error) {
      if ((error as { errorNum?: number }).errorNum !== 20041) throw error;
    }
    transition = 'PASS';
  }
  await connection.rollback();
  console.log(
    JSON.stringify({
      status: 'PASS',
      checkoutColumns: row.CHECKOUT_COLUMN_COUNT,
      indexes: row.INDEX_COUNT,
    immutabilityObjects: row.IMMUTABILITY_OBJECT_COUNT,
    allImmutabilityGuards: row.ALL_GUARD_COUNT,
      publishedToSupersededAndImmutable: transition,
    }),
  );
} finally {
  try {
    await connection.rollback();
  } finally {
    await connection.close();
  }
}
