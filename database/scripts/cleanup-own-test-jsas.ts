import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';

const username = process.env.JSA_CLEANUP_USERNAME?.trim() || 'phuclh';
const confirmation = process.env.CONFIRM_OWN_JSA_CLEANUP?.trim();

type CountRow = {
  JSA_COUNT: number;
  VERSION_COUNT: number;
  WORKFLOW_COUNT: number;
  PUBLISHED_COUNT: number;
};

const targetJsas = `SELECT M.JSA_ID
  FROM JSA_MASTER M
  JOIN SYS_USER U ON U.USER_ID=M.CREATOR_USER_ID
  WHERE LOWER(U.USERNAME)=LOWER(:username)`;

const targetVersions = `SELECT V.JSA_VERSION_ID
  FROM JSA_VERSION V
  WHERE V.JSA_ID IN (${targetJsas})`;

const targetInstances = `SELECT I.INSTANCE_ID
  FROM JSA_WORKFLOW_INSTANCE I
  WHERE I.JSA_ID IN (${targetJsas})`;

async function remove(connection: oracledb.Connection, sql: string): Promise<number> {
  const result = await connection.execute(sql, { username });
  return result.rowsAffected ?? 0;
}

async function main(): Promise<void> {
  if ((process.env.NODE_ENV || 'development').toLowerCase() === 'production')
    throw new Error('Own-JSA cleanup is forbidden in production');
  if (confirmation !== username)
    throw new Error(`Set CONFIRM_OWN_JSA_CLEANUP=${username} to authorize this cleanup`);

  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const countsResult = await connection.execute<CountRow>(
      `SELECT
         (SELECT COUNT(*) FROM JSA_MASTER WHERE JSA_ID IN (${targetJsas})) JSA_COUNT,
         (SELECT COUNT(*) FROM JSA_VERSION WHERE JSA_VERSION_ID IN (${targetVersions})) VERSION_COUNT,
         (SELECT COUNT(*) FROM JSA_WORKFLOW_INSTANCE WHERE INSTANCE_ID IN (${targetInstances})) WORKFLOW_COUNT,
         (SELECT COUNT(*) FROM JSA_VERSION WHERE JSA_VERSION_ID IN (${targetVersions}) AND VERSION_STATUS='PUBLISHED') PUBLISHED_COUNT
       FROM DUAL`,
      { username },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const before = countsResult.rows?.[0];
    if (!before) throw new Error('Could not inspect target JSA records');
    if (before.PUBLISHED_COUNT > 0)
      throw new Error('Cleanup refused because one or more target JSA Versions are Published');
    if (before.JSA_COUNT === 0) {
      console.log(JSON.stringify({ status: 'PASS', result: 'nothing_to_delete', username }));
      return;
    }

    const deleted: Record<string, number> = {};
    deleted.notificationOutbox = await remove(
      connection,
      `DELETE FROM SYS_NOTIFICATION_OUTBOX
       WHERE NOTIFICATION_ID IN (
         SELECT NOTIFICATION_ID FROM SYS_NOTIFICATION
         WHERE TARGET_TYPE='JSA_MASTER' AND TARGET_ID IN (${targetJsas})
       )`,
    );
    deleted.notifications = await remove(
      connection,
      `DELETE FROM SYS_NOTIFICATION
       WHERE TARGET_TYPE='JSA_MASTER' AND TARGET_ID IN (${targetJsas})`,
    );
    deleted.workflowActions = await remove(
      connection,
      `DELETE FROM JSA_WORKFLOW_ACTION WHERE INSTANCE_ID IN (${targetInstances})`,
    );
    deleted.workflowTasks = await remove(
      connection,
      `DELETE FROM JSA_WORKFLOW_TASK WHERE INSTANCE_ID IN (${targetInstances})`,
    );
    deleted.workflowInstances = await remove(
      connection,
      `DELETE FROM JSA_WORKFLOW_INSTANCE WHERE INSTANCE_ID IN (${targetInstances})`,
    );
    deleted.promptCoverage = await remove(
      connection,
      `DELETE FROM JSA_VERSION_PROMPT_COVERAGE WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    deleted.stepPerformers = await remove(
      connection,
      `DELETE FROM JSA_VER_BASIC_STEP_PERFORMER WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    deleted.stepSupervisors = await remove(
      connection,
      `DELETE FROM JSA_VER_BASIC_STEP_SUPERVISOR WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    deleted.stepTools = await remove(
      connection,
      `DELETE FROM JSA_VER_BASIC_STEP_TOOL WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    deleted.attachments = await remove(
      connection,
      `DELETE FROM JSA_VERSION_ATTACHMENT WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    deleted.procedureReferences = await remove(
      connection,
      `DELETE FROM JSA_VERSION_PROCEDURE_REF WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    deleted.basicSteps = await remove(
      connection,
      `DELETE FROM JSA_VERSION_BASIC_STEP WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    deleted.controls = await remove(
      connection,
      `DELETE FROM JSA_VERSION_CONTROL WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    deleted.hazards = await remove(
      connection,
      `DELETE FROM JSA_VERSION_HAZARD WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    await remove(
      connection,
      `UPDATE JSA_VERSION_TASK SET PARENT_TASK_ID=NULL
       WHERE JSA_VERSION_ID IN (${targetVersions}) AND PARENT_TASK_ID IS NOT NULL`,
    );
    deleted.tasks = await remove(
      connection,
      `DELETE FROM JSA_VERSION_TASK WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    deleted.prompts = await remove(
      connection,
      `DELETE FROM JSA_VERSION_PROMPT WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    await remove(
      connection,
      `UPDATE JSA_MASTER SET CURRENT_VERSION_ID=NULL,WORKING_VERSION_ID=NULL
       WHERE JSA_ID IN (${targetJsas})`,
    );
    await remove(
      connection,
      `UPDATE JSA_VERSION SET BASE_VERSION_ID=NULL
       WHERE JSA_VERSION_ID IN (${targetVersions}) AND BASE_VERSION_ID IS NOT NULL`,
    );
    deleted.versions = await remove(
      connection,
      `DELETE FROM JSA_VERSION WHERE JSA_VERSION_ID IN (${targetVersions})`,
    );
    deleted.masters = await remove(
      connection,
      `DELETE FROM JSA_MASTER WHERE JSA_ID IN (${targetJsas})`,
    );

    const remaining = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM JSA_MASTER M
       JOIN SYS_USER U ON U.USER_ID=M.CREATOR_USER_ID
       WHERE LOWER(U.USERNAME)=LOWER(:username)`,
      { username },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((remaining.rows?.[0]?.ITEM_COUNT ?? -1) !== 0)
      throw new Error('Cleanup verification failed: target JSA rows remain');

    await connection.commit();
    console.log(
      JSON.stringify({
        status: 'PASS',
        result: 'deleted',
        username,
        before,
        deleted,
        remainingJsas: 0,
      }),
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
