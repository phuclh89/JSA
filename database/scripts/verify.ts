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
const phase2Tables = [
  'SYS_JOB_TYPE',
  'SYS_HAZARD_PROMPT',
  'SYS_POSITION',
  'SYS_TOOL_CATEGORY',
  'SYS_TOOL',
  'SYS_LANGUAGE',
  'SYS_PROCEDURE_REFERENCE',
  'SYS_SYSTEM_PARAMETER',
  'JSA_RISK_MATRIX',
  'JSA_RISK_MATRIX_VERSION',
  'JSA_RISK_LIKELIHOOD',
  'JSA_RISK_SEVERITY',
  'JSA_RISK_RESULT',
  'JSA_RISK_MATRIX_CELL',
  'JSA_RIG_MATRIX_ASSIGNMENT',
];
const phase2Sequences = [
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
];
const phase3Tables = [
  'JSA_MASTER',
  'JSA_VERSION',
  'JSA_VERSION_PROMPT',
  'JSA_VERSION_PROMPT_COVERAGE',
  'JSA_VERSION_TASK',
  'JSA_VERSION_HAZARD',
  'JSA_VERSION_CONTROL',
  'JSA_VERSION_BASIC_STEP',
  'JSA_VER_BASIC_STEP_PERFORMER',
  'JSA_VER_BASIC_STEP_SUPERVISOR',
  'JSA_VER_BASIC_STEP_TOOL',
  'JSA_VERSION_PROCEDURE_REF',
  'JSA_VERSION_ATTACHMENT',
];
const phase3Sequences = [
  'SEQ_JSA_BUSINESS_NUMBER',
  'SEQ_JSA_MASTER',
  'SEQ_JSA_VERSION',
  'SEQ_JSA_VER_PROMPT',
  'SEQ_JSA_VER_PROMPT_COV',
  'SEQ_JSA_VER_TASK',
  'SEQ_JSA_VER_HAZARD',
  'SEQ_JSA_VER_CONTROL',
  'SEQ_JSA_VER_BASIC_STEP',
  'SEQ_JSA_VER_STEP_PERF',
  'SEQ_JSA_VER_STEP_SUP',
  'SEQ_JSA_VER_STEP_TOOL',
  'SEQ_JSA_VER_PROC_REF',
  'SEQ_JSA_VER_ATTACHMENT',
];
const phase4Tables = [
  'JSA_WORKFLOW_DEFINITION',
  'JSA_WORKFLOW_STEP',
  'JSA_WORKFLOW_BINDING',
  'JSA_WF_ROLE_ASSIGNMENT',
  'JSA_WORKFLOW_INSTANCE',
  'JSA_WORKFLOW_TASK',
  'JSA_WORKFLOW_ACTION',
  'SYS_NOTIFICATION',
  'SYS_NOTIFICATION_OUTBOX',
];
const phase4Sequences = [
  'SEQ_JSA_WORKFLOW_DEF',
  'SEQ_JSA_WORKFLOW_STEP',
  'SEQ_JSA_WORKFLOW_BIND',
  'SEQ_JSA_WF_ROLE_ASSIGN',
  'SEQ_JSA_WORKFLOW_INST',
  'SEQ_JSA_WORKFLOW_TASK',
  'SEQ_JSA_WORKFLOW_ACTION',
  'SEQ_SYS_NOTIFICATION',
  'SEQ_SYS_NOTIF_OUTBOX',
];
const phase45Tables = ['SYS_ACCESS_ADMIN_AUDIT'];
const phase45Sequences = ['SEQ_SYS_ACCESS_ADMIN_AUDIT'];
const attachmentTables = [
  'JSA_ATTACHMENT_FOLDER',
  'JSA_ATTACHMENT_ASSET',
  'JSA_ATTACHMENT_ASSET_VERSION',
];
const attachmentSequences = [
  'SEQ_JSA_ATTACHMENT_FOLDER',
  'SEQ_JSA_ATTACHMENT_ASSET',
  'SEQ_JSA_ATTACHMENT_VERSION',
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
    const phase2TableCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) AS OBJECT_COUNT FROM USER_TABLES WHERE TABLE_NAME IN (${phase2Tables.map((_, index) => `:phase2Table${index}`).join(',')})`,
      Object.fromEntries(phase2Tables.map((name, index) => [`phase2Table${index}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (phase2TableCount.rows?.[0]?.OBJECT_COUNT !== phase2Tables.length)
      throw new Error('One or more Phase 2 tables are missing');
    const phase2SequenceCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) AS OBJECT_COUNT FROM USER_SEQUENCES WHERE SEQUENCE_NAME IN (${phase2Sequences.map((_, index) => `:phase2Sequence${index}`).join(',')})`,
      Object.fromEntries(phase2Sequences.map((name, index) => [`phase2Sequence${index}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (phase2SequenceCount.rows?.[0]?.OBJECT_COUNT !== phase2Sequences.length)
      throw new Error('One or more Phase 2 sequences are missing');
    const invalidPhase2PrimaryKeys = await connection.execute<CountRow>(
      `SELECT COUNT(*) AS OBJECT_COUNT FROM USER_CONSTRAINTS C JOIN USER_CONS_COLUMNS CC ON CC.CONSTRAINT_NAME=C.CONSTRAINT_NAME JOIN USER_TAB_COLUMNS TC ON TC.TABLE_NAME=CC.TABLE_NAME AND TC.COLUMN_NAME=CC.COLUMN_NAME WHERE C.CONSTRAINT_TYPE='P' AND C.TABLE_NAME IN (${phase2Tables.map((_, index) => `:phase2Pk${index}`).join(',')}) AND (TC.DATA_TYPE<>'NUMBER' OR TC.DATA_PRECISION<>19 OR NVL(TC.DATA_SCALE,0)<>0)`,
      Object.fromEntries(phase2Tables.map((name, index) => [`phase2Pk${index}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((invalidPhase2PrimaryKeys.rows?.[0]?.OBJECT_COUNT ?? 0) !== 0)
      throw new Error('A Phase 2 primary key is not NUMBER(19)');
    const phase2History = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID,MIGRATION_NAME,CHECKSUM_VALUE,APPLIED_AT,APPLIED_BY,EXECUTION_MS,STATUS_CODE FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID=:migrationId`,
      { migrationId: '004' },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (phase2History.rows?.[0]?.STATUS_CODE !== 'APPLIED')
      throw new Error('Migration 004 history metadata is invalid');
    const textualCodes = await connection.execute<CountRow>(
      `SELECT COUNT(*) AS OBJECT_COUNT FROM USER_TAB_COLUMNS WHERE (TABLE_NAME,COLUMN_NAME) IN (('JSA_RISK_LIKELIHOOD','LIKELIHOOD_CODE'),('JSA_RISK_SEVERITY','SEVERITY_CODE'),('JSA_RISK_RESULT','RESULT_CODE'),('JSA_RISK_MATRIX_CELL','RATING_CODE')) AND DATA_TYPE='VARCHAR2'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (textualCodes.rows?.[0]?.OBJECT_COUNT !== 4)
      throw new Error('Phase 2 mixed-code columns are not textual');
    const phase3TableCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_TABLES WHERE TABLE_NAME IN (${phase3Tables.map((_, i) => `:p3t${i}`).join(',')})`,
      Object.fromEntries(phase3Tables.map((name, i) => [`p3t${i}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (phase3TableCount.rows?.[0]?.OBJECT_COUNT !== phase3Tables.length)
      throw new Error('One or more Phase 3 tables are missing');
    const phase3SequenceCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_SEQUENCES WHERE SEQUENCE_NAME IN (${phase3Sequences.map((_, i) => `:p3s${i}`).join(',')})`,
      Object.fromEntries(phase3Sequences.map((name, i) => [`p3s${i}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (phase3SequenceCount.rows?.[0]?.OBJECT_COUNT !== phase3Sequences.length)
      throw new Error('One or more Phase 3 sequences are missing');
    const phase3History = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID,MIGRATION_NAME,CHECKSUM_VALUE,APPLIED_AT,APPLIED_BY,EXECUTION_MS,STATUS_CODE FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='005'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (phase3History.rows?.[0]?.STATUS_CODE !== 'APPLIED')
      throw new Error('Migration 005 history metadata is invalid');
    const phase4TableCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_TABLES WHERE TABLE_NAME IN (${phase4Tables.map((_, i) => `:p4t${i}`).join(',')})`,
      Object.fromEntries(phase4Tables.map((name, i) => [`p4t${i}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const phase4SequenceCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_SEQUENCES WHERE SEQUENCE_NAME IN (${phase4Sequences.map((_, i) => `:p4s${i}`).join(',')})`,
      Object.fromEntries(phase4Sequences.map((name, i) => [`p4s${i}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const phase4History = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID,MIGRATION_NAME,CHECKSUM_VALUE,APPLIED_AT,APPLIED_BY,EXECUTION_MS,STATUS_CODE FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='006'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (
      phase4TableCount.rows?.[0]?.OBJECT_COUNT !== phase4Tables.length ||
      phase4SequenceCount.rows?.[0]?.OBJECT_COUNT !== phase4Sequences.length ||
      phase4History.rows?.[0]?.STATUS_CODE !== 'APPLIED'
    )
      throw new Error('Phase 4 schema objects are incomplete');
    const phase4GuardCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_OBJECTS WHERE STATUS='VALID' AND (OBJECT_NAME='JSA_ASSERT_VERSION_MUTABLE' OR OBJECT_NAME IN ('TRG_JSA_VER_IMMUTABLE','TRG_JSA_PROMPT_IMMUTABLE','TRG_JSA_COVER_IMMUTABLE','TRG_JSA_TASK_IMMUTABLE','TRG_JSA_HAZARD_IMMUTABLE','TRG_JSA_CONTROL_IMUTABLE','TRG_JSA_STEP_IMMUTABLE','TRG_JSA_PERF_IMMUTABLE','TRG_JSA_SUP_IMMUTABLE','TRG_JSA_TOOL_IMMUTABLE','TRG_JSA_PROC_IMMUTABLE','TRG_JSA_ATTACH_IMMUTABLE'))`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (phase4GuardCount.rows?.[0]?.OBJECT_COUNT !== 13)
      throw new Error('Phase 4 Published immutability guards are missing or invalid');
    const phase45TableCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_TABLES WHERE TABLE_NAME='SYS_ACCESS_ADMIN_AUDIT'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const phase45SequenceCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_SEQUENCES WHERE SEQUENCE_NAME='SEQ_SYS_ACCESS_ADMIN_AUDIT'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const phase45History = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID,MIGRATION_NAME,CHECKSUM_VALUE,APPLIED_AT,APPLIED_BY,EXECUTION_MS,STATUS_CODE FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='007'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const phase45SnapshotCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_TAB_COLUMNS WHERE (TABLE_NAME='JSA_WORKFLOW_TASK' AND COLUMN_NAME IN ('STEP_CODE_SNAPSHOT','STEP_NAME_SNAPSHOT','WF_ROLE_CODE_SNAPSHOT','ASSIGNEE_USERNAME_SNAPSHOT','ASSIGNEE_DISPLAY_SNAPSHOT')) OR (TABLE_NAME='JSA_WORKFLOW_ACTION' AND COLUMN_NAME IN ('STEP_CODE_SNAPSHOT','STEP_NAME_SNAPSHOT','WF_ROLE_CODE_SNAPSHOT','ACTOR_DISPLAY_NAME_SNAPSHOT'))`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const phase45AuditTrigger = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_OBJECTS WHERE OBJECT_NAME='TRG_SYS_ACCESS_AUDIT_IMMUTABLE' AND OBJECT_TYPE='TRIGGER' AND STATUS='VALID'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (
      phase45TableCount.rows?.[0]?.OBJECT_COUNT !== 1 ||
      phase45SequenceCount.rows?.[0]?.OBJECT_COUNT !== 1 ||
      phase45History.rows?.[0]?.STATUS_CODE !== 'APPLIED' ||
      phase45SnapshotCount.rows?.[0]?.OBJECT_COUNT !== 9 ||
      phase45AuditTrigger.rows?.[0]?.OBJECT_COUNT !== 1
    )
      throw new Error('Phase 4.5 schema objects are incomplete');
    const hazardControlHistory = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID,MIGRATION_NAME,CHECKSUM_VALUE,APPLIED_AT,APPLIED_BY,EXECUTION_MS,STATUS_CODE FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='008'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const hazardControlUniqueIndex = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_INDEXES WHERE INDEX_NAME='UX_JSA_VER_CTL_ACTIVE_HAZ' AND TABLE_NAME='JSA_VERSION_CONTROL' AND UNIQUENESS='UNIQUE' AND STATUS='VALID'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const duplicateActiveHazardControls = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM (SELECT VERSION_HAZARD_ID FROM JSA_VERSION_CONTROL WHERE IS_ACTIVE='Y' GROUP BY VERSION_HAZARD_ID HAVING COUNT(*)>1)`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (
      hazardControlHistory.rows?.[0]?.STATUS_CODE !== 'APPLIED' ||
      hazardControlUniqueIndex.rows?.[0]?.OBJECT_COUNT !== 1 ||
      duplicateActiveHazardControls.rows?.[0]?.OBJECT_COUNT !== 0
    )
      throw new Error('Hazard-Control one-to-one database invariant is incomplete');
    const residualSeverityHistory = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID,MIGRATION_NAME,CHECKSUM_VALUE,APPLIED_AT,APPLIED_BY,EXECUTION_MS,STATUS_CODE FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='009'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const residualSeverityConstraint = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_CONSTRAINTS WHERE CONSTRAINT_NAME='CHK_JSA_HAZ_RES_SEV_MATCH' AND TABLE_NAME='JSA_VERSION_HAZARD' AND CONSTRAINT_TYPE='C' AND STATUS='ENABLED'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const mismatchedResidualSeverities = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM JSA_VERSION_HAZARD WHERE (INITIAL_SEVERITY_ID IS NULL AND RESIDUAL_SEVERITY_ID IS NOT NULL) OR (INITIAL_SEVERITY_ID IS NOT NULL AND RESIDUAL_SEVERITY_ID IS NULL) OR INITIAL_SEVERITY_ID<>RESIDUAL_SEVERITY_ID`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (
      residualSeverityHistory.rows?.[0]?.STATUS_CODE !== 'APPLIED' ||
      residualSeverityConstraint.rows?.[0]?.OBJECT_COUNT !== 1 ||
      mismatchedResidualSeverities.rows?.[0]?.OBJECT_COUNT !== 0
    )
      throw new Error('Initial/Residual Severity database invariant is incomplete');
    const englishDefaultHistory = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID,MIGRATION_NAME,CHECKSUM_VALUE,APPLIED_AT,APPLIED_BY,EXECUTION_MS,STATUS_CODE FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='010'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const jsaClassificationColumns = await connection.execute<ColumnRow>(
      `SELECT COLUMN_NAME,DATA_TYPE,DATA_LENGTH,DATA_PRECISION,DATA_SCALE,NULLABLE
       FROM USER_TAB_COLUMNS
       WHERE TABLE_NAME='JSA_VERSION' AND COLUMN_NAME IN ('JOB_TYPE_ID','LANGUAGE_ID')`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const jobTypeColumn = jsaClassificationColumns.rows?.find(
      (column) => column.COLUMN_NAME === 'JOB_TYPE_ID',
    );
    const languageColumn = jsaClassificationColumns.rows?.find(
      (column) => column.COLUMN_NAME === 'LANGUAGE_ID',
    );
    const englishTrigger = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT FROM USER_OBJECTS WHERE OBJECT_NAME='TRG_JSA_VERSION_ENGLISH' AND OBJECT_TYPE='TRIGGER' AND STATUS='VALID'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const invalidSourceLanguages = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT
       FROM JSA_VERSION V
       LEFT JOIN SYS_LANGUAGE L ON L.LANGUAGE_ID=V.LANGUAGE_ID
       WHERE V.LANGUAGE_ID IS NULL OR UPPER(L.LANGUAGE_CODE)<>'EN'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (
      englishDefaultHistory.rows?.[0]?.STATUS_CODE !== 'APPLIED' ||
      jobTypeColumn?.NULLABLE !== 'Y' ||
      languageColumn?.NULLABLE !== 'N' ||
      englishTrigger.rows?.[0]?.OBJECT_COUNT !== 1 ||
      invalidSourceLanguages.rows?.[0]?.OBJECT_COUNT !== 0
    )
      throw new Error('English-only source JSA database invariant is incomplete');
    const officialNumberHistory = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID,MIGRATION_NAME,CHECKSUM_VALUE,APPLIED_AT,APPLIED_BY,EXECUTION_MS,STATUS_CODE
       FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='011'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const officialNumberTable = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT
       FROM USER_TABLES WHERE TABLE_NAME='JSA_NUMBER_COUNTER'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const numberStatusColumn = await connection.execute<ColumnRow>(
      `SELECT COLUMN_NAME,DATA_TYPE,DATA_LENGTH,DATA_PRECISION,DATA_SCALE,NULLABLE
       FROM USER_TAB_COLUMNS
       WHERE TABLE_NAME='JSA_MASTER' AND COLUMN_NAME='NUMBER_STATUS'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const officialNumberTrigger = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT
       FROM USER_OBJECTS
       WHERE OBJECT_NAME='TRG_JSA_OFFICIAL_NUM_IMMUTABLE'
         AND OBJECT_TYPE='TRIGGER' AND STATUS='VALID'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (
      officialNumberHistory.rows?.[0]?.STATUS_CODE !== 'APPLIED' ||
      officialNumberTable.rows?.[0]?.OBJECT_COUNT !== 1 ||
      numberStatusColumn.rows?.[0]?.NULLABLE !== 'N' ||
      officialNumberTrigger.rows?.[0]?.OBJECT_COUNT !== 1
    )
      throw new Error('Official JSA numbering database invariant is incomplete');
    const attachmentHistory = await connection.execute<HistoryRow>(
      `SELECT MIGRATION_ID,MIGRATION_NAME,CHECKSUM_VALUE,APPLIED_AT,APPLIED_BY,EXECUTION_MS,STATUS_CODE
       FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='012'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const attachmentTableCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT
       FROM USER_TABLES
       WHERE TABLE_NAME IN (${attachmentTables.map((_, index) => `:attachmentTable${index}`).join(',')})`,
      Object.fromEntries(attachmentTables.map((name, index) => [`attachmentTable${index}`, name])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const attachmentSequenceCount = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT
       FROM USER_SEQUENCES
       WHERE SEQUENCE_NAME IN (${attachmentSequences.map((_, index) => `:attachmentSequence${index}`).join(',')})`,
      Object.fromEntries(
        attachmentSequences.map((name, index) => [`attachmentSequence${index}`, name]),
      ),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const attachmentLinkColumns = await connection.execute<CountRow>(
      `SELECT COUNT(*) OBJECT_COUNT
       FROM USER_TAB_COLUMNS
       WHERE TABLE_NAME='JSA_VERSION_ATTACHMENT'
         AND COLUMN_NAME IN ('LIBRARY_ASSET_VERSION_ID','CONTENT_SHA256')`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (
      attachmentHistory.rows?.[0]?.STATUS_CODE !== 'APPLIED' ||
      attachmentTableCount.rows?.[0]?.OBJECT_COUNT !== attachmentTables.length ||
      attachmentSequenceCount.rows?.[0]?.OBJECT_COUNT !== attachmentSequences.length ||
      attachmentLinkColumns.rows?.[0]?.OBJECT_COUNT !== 2
    )
      throw new Error('Attachment library schema objects are incomplete');
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
        phase2: {
          tables: phase2Tables,
          sequences: phase2Sequences,
          migration: phase2History.rows[0],
        },
        phase3: {
          tables: phase3Tables,
          sequences: phase3Sequences,
          migration: phase3History.rows[0],
        },
        phase4: {
          tables: phase4Tables,
          sequences: phase4Sequences,
          migration: phase4History.rows[0],
        },
        phase45: {
          tables: phase45Tables,
          sequences: phase45Sequences,
          migration: phase45History.rows[0],
        },
        hazardControlOneToOne: {
          migration: hazardControlHistory.rows[0],
          uniqueActiveIndex: 'UX_JSA_VER_CTL_ACTIVE_HAZ',
          duplicateActivePairs: duplicateActiveHazardControls.rows?.[0]?.OBJECT_COUNT,
        },
        residualSeverityMatch: {
          migration: residualSeverityHistory.rows[0],
          constraint: 'CHK_JSA_HAZ_RES_SEV_MATCH',
          mismatchedHazards: mismatchedResidualSeverities.rows?.[0]?.OBJECT_COUNT,
        },
        englishSourceDefault: {
          migration: englishDefaultHistory.rows[0],
          jobTypeNullable: jobTypeColumn?.NULLABLE,
          languageNullable: languageColumn?.NULLABLE,
          trigger: 'TRG_JSA_VERSION_ENGLISH',
          invalidSourceLanguages: invalidSourceLanguages.rows?.[0]?.OBJECT_COUNT,
        },
        officialJsaNumber: {
          migration: officialNumberHistory.rows[0],
          counterTable: 'JSA_NUMBER_COUNTER',
          numberStatusNullable: numberStatusColumn.rows?.[0]?.NULLABLE,
          immutableTrigger: 'TRG_JSA_OFFICIAL_NUM_IMMUTABLE',
        },
        attachmentLibrary: {
          migration: attachmentHistory.rows[0],
          tables: attachmentTables,
          sequences: attachmentSequences,
          jsaSnapshotColumns: ['LIBRARY_ASSET_VERSION_ID', 'CONTENT_SHA256'],
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
