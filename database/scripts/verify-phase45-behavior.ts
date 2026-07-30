import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

loadDatabaseEnvironment();
type Row = Record<string, any>;
const options = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;

async function main() {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const migration = await connection.execute<Row>(
      `SELECT STATUS_CODE FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='007'`,
      {},
      options,
    );
    if (migration.rows?.[0]?.STATUS_CODE !== 'APPLIED')
      throw new Error('Migration 007 is not applied');
    const snapshots = await connection.execute<Row>(
      `SELECT
        (SELECT COUNT(*) FROM JSA_WORKFLOW_TASK
         WHERE STEP_CODE_SNAPSHOT IS NULL OR STEP_NAME_SNAPSHOT IS NULL
            OR WF_ROLE_CODE_SNAPSHOT IS NULL OR ASSIGNEE_USERNAME_SNAPSHOT IS NULL
            OR ASSIGNEE_DISPLAY_SNAPSHOT IS NULL) INVALID_TASKS,
        (SELECT COUNT(*) FROM JSA_WORKFLOW_ACTION
         WHERE ACTOR_DISPLAY_NAME_SNAPSHOT IS NULL) INVALID_ACTIONS
       FROM DUAL`,
      {},
      options,
    );
    const pending = await connection.execute<Row>(
      `SELECT COUNT(*) INVALID_PENDING_TASKS
       FROM JSA_WORKFLOW_TASK T
       JOIN JSA_WORKFLOW_INSTANCE I ON I.INSTANCE_ID=T.INSTANCE_ID
       JOIN JSA_WORKFLOW_STEP S ON S.STEP_ID=T.STEP_ID
       JOIN SYS_USER U ON U.USER_ID=T.ASSIGNEE_USER_ID
       WHERE T.TASK_STATUS='PENDING' AND I.INSTANCE_STATUS='ACTIVE'
         AND (U.IS_ACTIVE<>'Y' OR T.STEP_CODE_SNAPSHOT<>S.STEP_CODE
           OR T.WF_ROLE_CODE_SNAPSHOT<>S.WORKFLOW_ROLE_CODE)`,
      {},
      options,
    );
    const immutable = await connection.execute<Row>(
      `SELECT COUNT(*) VALID_TRIGGER FROM USER_TRIGGERS
       WHERE TRIGGER_NAME='TRG_SYS_ACCESS_AUDIT_IMMUTABLE' AND STATUS='ENABLED'`,
      {},
      options,
    );
    const result = {
      invalidTaskSnapshots: snapshots.rows?.[0]?.INVALID_TASKS ?? 0,
      invalidActionSnapshots: snapshots.rows?.[0]?.INVALID_ACTIONS ?? 0,
      invalidPendingTasks: pending.rows?.[0]?.INVALID_PENDING_TASKS ?? 0,
      immutableAuditTrigger: immutable.rows?.[0]?.VALID_TRIGGER === 1,
    };
    if (
      Object.values(result).some(
        (value) => value === false || (typeof value === 'number' && value > 0),
      )
    )
      throw new Error(`Phase 4.5 behavior verification failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify({ status: 'PASS', ...result }));
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
