import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';

interface CountRow {
  OBJECT_COUNT: number;
}
interface ColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  DATA_LENGTH: number;
  DATA_PRECISION?: number;
  DATA_SCALE?: number;
  NULLABLE: string;
}
interface ConstraintRow {
  CONSTRAINT_NAME: string;
  CONSTRAINT_TYPE: string;
  STATUS: string;
}
interface HistoryRow {
  MIGRATION_ID: string;
  MIGRATION_NAME: string;
  CHECKSUM_VALUE: string;
  APPLIED_AT: Date;
  APPLIED_BY: string;
  EXECUTION_MS: number;
  STATUS_CODE: string;
}

const phase1Tables = [
  'SYS_SITE',
  'SYS_RIG',
  'SYS_DEPARTMENT',
  'SYS_SITE_SEQUENCE_RANGE',
  'SYS_USER',
  'SYS_ROLE',
  'SYS_PERMISSION',
  'SYS_USER_ROLE',
  'SYS_ROLE_PERMISSION',
  'SYS_USER_PERMISSION_OVERRIDE',
  'SYS_USER_DATA_SCOPE',
];
const phase1Sequences = [
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
];

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const table = await connection.execute<CountRow>(
      'SELECT COUNT(*) AS OBJECT_COUNT FROM USER_TABLES WHERE TABLE_NAME = :tableName',
      { tableName: 'JSA_SCHEMA_VERSION' },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (table.rows?.[0]?.OBJECT_COUNT !== 1) throw new Error('JSA_SCHEMA_VERSION does not exist');
    const columns = await connection.execute<ColumnRow>(
      `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
       FROM USER_TAB_COLUMNS WHERE TABLE_NAME = :tableName ORDER BY COLUMN_ID`,
      { tableName: 'JSA_SCHEMA_VERSION' },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const constraints = await connection.execute<ConstraintRow>(
      `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE, STATUS FROM USER_CONSTRAINTS
       WHERE TABLE_NAME = :tableName AND CONSTRAINT_NAME IN (:primaryKeyName, :statusCheckName)
       ORDER BY CONSTRAINT_NAME`,
      {
        tableName: 'JSA_SCHEMA_VERSION',
        primaryKeyName: 'PK_JSA_SCHEMA_VERSION',
        statusCheckName: 'CHK_JSA_SCHEMA_VER_STATUS',
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const history = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID, MIGRATION_NAME, CHECKSUM_VALUE, APPLIED_AT, APPLIED_BY, EXECUTION_MS, STATUS_CODE
       FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID = :migrationId`,
      { migrationId: '001' },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = history.rows?.[0];
    if (!row || row.STATUS_CODE !== 'APPLIED' || row.CHECKSUM_VALUE.length !== 64)
      throw new Error('Migration 001 history metadata is invalid');
    if (
      (constraints.rows ?? []).length !== 2 ||
      constraints.rows?.some((item) => item.STATUS !== 'ENABLED')
    )
      throw new Error('Expected migration constraints are missing or disabled');
    const phase1TableCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) AS OBJECT_COUNT FROM USER_TABLES
       WHERE TABLE_NAME IN (${phase1Tables.map((_, index) => `:table${index}`).join(',')})`,
      Object.fromEntries(phase1Tables.map((name, index) => [`table${index}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (phase1TableCount.rows?.[0]?.OBJECT_COUNT !== phase1Tables.length)
      throw new Error('One or more Phase 1 tables are missing');
    const sequenceCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) AS OBJECT_COUNT FROM USER_SEQUENCES
       WHERE SEQUENCE_NAME IN (${phase1Sequences.map((_, index) => `:sequence${index}`).join(',')})`,
      Object.fromEntries(phase1Sequences.map((name, index) => [`sequence${index}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (sequenceCount.rows?.[0]?.OBJECT_COUNT !== phase1Sequences.length)
      throw new Error('One or more Phase 1 sequences are missing');
    const invalidPrimaryKeys = await connection.execute<CountRow>(
      `SELECT COUNT(*) AS OBJECT_COUNT
       FROM USER_CONSTRAINTS C
       JOIN USER_CONS_COLUMNS CC ON CC.CONSTRAINT_NAME = C.CONSTRAINT_NAME
       JOIN USER_TAB_COLUMNS TC ON TC.TABLE_NAME = CC.TABLE_NAME AND TC.COLUMN_NAME = CC.COLUMN_NAME
       WHERE C.CONSTRAINT_TYPE = 'P'
         AND C.TABLE_NAME IN (${phase1Tables.map((_, index) => `:pkTable${index}`).join(',')})
         AND (TC.DATA_TYPE <> 'NUMBER' OR TC.DATA_PRECISION <> 19 OR NVL(TC.DATA_SCALE, 0) <> 0)`,
      Object.fromEntries(phase1Tables.map((name, index) => [`pkTable${index}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((invalidPrimaryKeys.rows?.[0]?.OBJECT_COUNT ?? 0) !== 0)
      throw new Error('A Phase 1 primary key is not NUMBER(19)');
    const phase1History = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID, MIGRATION_NAME, CHECKSUM_VALUE, APPLIED_AT, APPLIED_BY, EXECUTION_MS, STATUS_CODE
       FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID = :migrationId`,
      { migrationId: '002' },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (phase1History.rows?.[0]?.STATUS_CODE !== 'APPLIED')
      throw new Error('Migration 002 history metadata is invalid');
    const indexCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) AS OBJECT_COUNT FROM USER_INDEXES
       WHERE INDEX_NAME IN ('IX_SYS_USER_ROLE_ACTIVE','IX_SYS_ROLE_PERM_ACTIVE',
         'IX_SYS_USER_OVR_ACTIVE','IX_SYS_USER_SCOPE_ACTIVE') AND UNIQUENESS = 'UNIQUE'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (indexCount.rows?.[0]?.OBJECT_COUNT !== 4)
      throw new Error('Phase 1 active-assignment unique indexes are missing');
    const namingHistory = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID, MIGRATION_NAME, CHECKSUM_VALUE, APPLIED_AT, APPLIED_BY, EXECUTION_MS, STATUS_CODE
       FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID = :migrationId`,
      { migrationId: '003' },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (namingHistory.rows?.[0]?.STATUS_CODE !== 'APPLIED')
      throw new Error('Migration 003 history metadata is invalid');
    console.log(
      JSON.stringify({
        status: 'PASS',
        table: 'JSA_SCHEMA_VERSION',
        columns: columns.rows,
        constraints: constraints.rows,
        migration: row,
        phase1: {
          tables: phase1Tables,
          sequences: phase1Sequences,
          migrations: [phase1History.rows[0], namingHistory.rows[0]],
        },
      }),
    );
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
