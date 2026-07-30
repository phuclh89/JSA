import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { pvDrillingRigMatrixAssignments } from './pv-drilling-rig-matrix-assignment-data.js';

const confirmation = process.env.CONFIRM_ALL_JSA_RESET?.trim();
const actor = process.env.JSA_RESET_ACTOR?.trim() || 'phuclh';
const requiredConfirmation = 'DELETE_ALL_JSAS';

const immutabilityTriggers = [
  'TRG_JSA_VER_IMMUTABLE',
  'TRG_JSA_PROMPT_IMMUTABLE',
  'TRG_JSA_COVER_IMMUTABLE',
  'TRG_JSA_TASK_IMMUTABLE',
  'TRG_JSA_HAZARD_IMMUTABLE',
  'TRG_JSA_CONTROL_IMUTABLE',
  'TRG_JSA_STEP_IMMUTABLE',
  'TRG_JSA_PERF_IMMUTABLE',
  'TRG_JSA_SUP_IMMUTABLE',
  'TRG_JSA_TOOL_IMMUTABLE',
  'TRG_JSA_PROC_IMMUTABLE',
  'TRG_JSA_ATTACH_IMMUTABLE',
] as const;

const targetVersions = 'SELECT JSA_VERSION_ID FROM JSA_VERSION';
const targetInstances = 'SELECT INSTANCE_ID FROM JSA_WORKFLOW_INSTANCE';

type CountRow = {
  JSA_COUNT: number;
  VERSION_COUNT: number;
  PUBLISHED_COUNT: number;
  WORKFLOW_COUNT: number;
};
type RigRow = { RIG_ID: string };
type VersionRow = { MATRIX_VERSION_ID: string };
type AssignmentRow = { ASSIGNMENT_ID: string; MATRIX_VERSION_ID: string };

async function remove(
  connection: oracledb.Connection,
  sql: string,
  binds: oracledb.BindParameters = {},
): Promise<number> {
  const result = await connection.execute(sql, binds);
  return result.rowsAffected ?? 0;
}

async function setImmutabilityTriggers(
  connection: oracledb.Connection,
  state: 'ENABLE' | 'DISABLE',
): Promise<void> {
  for (const trigger of immutabilityTriggers)
    await connection.execute(`ALTER TRIGGER ${trigger} ${state}`);
}

async function findMatrixVersion(
  connection: oracledb.Connection,
  matrixCode: string,
  versionCode: string,
): Promise<string> {
  const result = await connection.execute<VersionRow>(
    `SELECT TO_CHAR(V.MATRIX_VERSION_ID) MATRIX_VERSION_ID
     FROM JSA_RISK_MATRIX M
     JOIN JSA_RISK_MATRIX_VERSION V ON V.MATRIX_ID=M.MATRIX_ID
     WHERE M.MATRIX_CODE=:matrixCode AND V.VERSION_CODE=:versionCode
       AND M.IS_ACTIVE='Y' AND V.IS_ACTIVE='Y'`,
    { matrixCode, versionCode },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const id = result.rows?.[0]?.MATRIX_VERSION_ID;
  if (!id) throw new Error(`Active Matrix Version ${matrixCode}/${versionCode} was not found`);
  return id;
}

async function assignRigMatrices(
  connection: oracledb.Connection,
): Promise<Array<Record<string, unknown>>> {
  const versionIds = new Map<string, string>();
  const results: Array<Record<string, unknown>> = [];

  for (const target of pvDrillingRigMatrixAssignments) {
    const versionKey = `${target.matrixCode}/${target.versionCode}`;
    let matrixVersionId = versionIds.get(versionKey);
    if (!matrixVersionId) {
      matrixVersionId = await findMatrixVersion(connection, target.matrixCode, target.versionCode);
      versionIds.set(versionKey, matrixVersionId);
    }

    const rigResult = await connection.execute<RigRow>(
      `SELECT TO_CHAR(RIG_ID) RIG_ID
       FROM SYS_RIG WHERE RIG_CODE=:rigCode AND IS_ACTIVE='Y' FOR UPDATE`,
      { rigCode: target.rigCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const rigId = rigResult.rows?.[0]?.RIG_ID;
    if (!rigId) throw new Error(`Active Rig ${target.rigCode} was not found`);

    const currentResult = await connection.execute<AssignmentRow>(
      `SELECT TO_CHAR(RIG_MATRIX_ASSIGNMENT_ID) ASSIGNMENT_ID,
              TO_CHAR(MATRIX_VERSION_ID) MATRIX_VERSION_ID
       FROM JSA_RIG_MATRIX_ASSIGNMENT
       WHERE RIG_ID=:rigId AND IS_ACTIVE='Y' AND EFFECTIVE_TO IS NULL
       FOR UPDATE`,
      { rigId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((currentResult.rows?.length ?? 0) > 1)
      throw new Error(`Rig ${target.rigCode} has multiple active Matrix assignments`);
    const current = currentResult.rows?.[0];
    if (current?.MATRIX_VERSION_ID === matrixVersionId) {
      results.push({
        rigCode: target.rigCode,
        matrixCode: target.matrixCode,
        versionCode: target.versionCode,
        result: 'already_assigned',
        assignmentId: current.ASSIGNMENT_ID,
      });
      continue;
    }

    if (current)
      await connection.execute(
        `UPDATE JSA_RIG_MATRIX_ASSIGNMENT
         SET EFFECTIVE_TO=SYSTIMESTAMP,IS_ACTIVE='N',UPDATED_AT=SYSTIMESTAMP,
             UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
         WHERE RIG_MATRIX_ASSIGNMENT_ID=:assignmentId`,
        { actor, assignmentId: current.ASSIGNMENT_ID },
      );

    const insertResult = await connection.execute<{ ASSIGNMENT_ID: string }>(
      `INSERT INTO JSA_RIG_MATRIX_ASSIGNMENT
       (RIG_MATRIX_ASSIGNMENT_ID,RIG_ID,MATRIX_VERSION_ID,EFFECTIVE_FROM,REASON_TEXT,
        CREATED_BY,UPDATED_BY)
       VALUES
       (SEQ_JSA_RIG_MATRIX_ASSIGN.NEXTVAL,:rigId,:matrixVersionId,SYSTIMESTAMP,:reason,
        :actor,:actor)
       RETURNING TO_CHAR(RIG_MATRIX_ASSIGNMENT_ID) INTO :assignmentId`,
      {
        rigId,
        matrixVersionId,
        reason:
          target.rigCode === 'PVD-V'
            ? 'Confirmed PVD-V 5x5 Matrix assignment'
            : 'Confirmed non-PVD-V 3x3 Matrix assignment',
        actor,
        assignmentId: {
          dir: oracledb.BIND_OUT,
          type: oracledb.STRING,
          maxSize: 20,
        },
      },
    );
    const assignmentId = (insertResult.outBinds as { assignmentId?: string[] }).assignmentId?.[0];
    results.push({
      rigCode: target.rigCode,
      matrixCode: target.matrixCode,
      versionCode: target.versionCode,
      result: 'assigned',
      assignmentId,
    });
  }
  return results;
}

async function main(): Promise<void> {
  if ((process.env.NODE_ENV || 'development').toLowerCase() === 'production')
    throw new Error('Full JSA reset is forbidden in production');
  if (confirmation !== requiredConfirmation)
    throw new Error(`Set CONFIRM_ALL_JSA_RESET=${requiredConfirmation} to authorize this reset`);

  const connection = await oracledb.getConnection(connectionConfig());
  let triggersDisabled = false;
  try {
    const countsResult = await connection.execute<CountRow>(
      `SELECT
         (SELECT COUNT(*) FROM JSA_MASTER) JSA_COUNT,
         (SELECT COUNT(*) FROM JSA_VERSION) VERSION_COUNT,
         (SELECT COUNT(*) FROM JSA_VERSION WHERE VERSION_STATUS='PUBLISHED') PUBLISHED_COUNT,
         (SELECT COUNT(*) FROM JSA_WORKFLOW_INSTANCE) WORKFLOW_COUNT
       FROM DUAL`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const before = countsResult.rows?.[0];
    if (!before) throw new Error('Could not inspect JSA reset targets');

    const deleted: Record<string, number> = {};
    if (before.JSA_COUNT > 0) {
      triggersDisabled = true;
      await setImmutabilityTriggers(connection, 'DISABLE');

      deleted.notificationOutbox = await remove(
        connection,
        `DELETE FROM SYS_NOTIFICATION_OUTBOX
         WHERE NOTIFICATION_ID IN (
           SELECT NOTIFICATION_ID FROM SYS_NOTIFICATION
           WHERE TARGET_TYPE='JSA_MASTER' AND TARGET_ID IN (SELECT JSA_ID FROM JSA_MASTER)
         )`,
      );
      deleted.notifications = await remove(
        connection,
        `DELETE FROM SYS_NOTIFICATION
         WHERE TARGET_TYPE='JSA_MASTER' AND TARGET_ID IN (SELECT JSA_ID FROM JSA_MASTER)`,
      );
      deleted.workflowActions = await remove(
        connection,
        `DELETE FROM JSA_WORKFLOW_ACTION WHERE INSTANCE_ID IN (${targetInstances})`,
      );
      deleted.workflowTasks = await remove(
        connection,
        `DELETE FROM JSA_WORKFLOW_TASK WHERE INSTANCE_ID IN (${targetInstances})`,
      );
      deleted.workflowInstances = await remove(connection, 'DELETE FROM JSA_WORKFLOW_INSTANCE');
      deleted.promptCoverage = await remove(
        connection,
        `DELETE FROM JSA_VERSION_PROMPT_COVERAGE
         WHERE JSA_VERSION_ID IN (${targetVersions})`,
      );
      deleted.stepPerformers = await remove(
        connection,
        `DELETE FROM JSA_VER_BASIC_STEP_PERFORMER
         WHERE JSA_VERSION_ID IN (${targetVersions})`,
      );
      deleted.stepSupervisors = await remove(
        connection,
        `DELETE FROM JSA_VER_BASIC_STEP_SUPERVISOR
         WHERE JSA_VERSION_ID IN (${targetVersions})`,
      );
      deleted.stepTools = await remove(
        connection,
        `DELETE FROM JSA_VER_BASIC_STEP_TOOL
         WHERE JSA_VERSION_ID IN (${targetVersions})`,
      );
      deleted.attachments = await remove(
        connection,
        `DELETE FROM JSA_VERSION_ATTACHMENT
         WHERE JSA_VERSION_ID IN (${targetVersions})`,
      );
      deleted.procedureReferences = await remove(
        connection,
        `DELETE FROM JSA_VERSION_PROCEDURE_REF
         WHERE JSA_VERSION_ID IN (${targetVersions})`,
      );
      deleted.basicSteps = await remove(
        connection,
        `DELETE FROM JSA_VERSION_BASIC_STEP
         WHERE JSA_VERSION_ID IN (${targetVersions})`,
      );
      deleted.controls = await remove(
        connection,
        `DELETE FROM JSA_VERSION_CONTROL
         WHERE JSA_VERSION_ID IN (${targetVersions})`,
      );
      deleted.hazards = await remove(
        connection,
        `DELETE FROM JSA_VERSION_HAZARD
         WHERE JSA_VERSION_ID IN (${targetVersions})`,
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
        `UPDATE JSA_MASTER SET CURRENT_VERSION_ID=NULL,WORKING_VERSION_ID=NULL`,
      );
      await remove(
        connection,
        `UPDATE JSA_VERSION SET BASE_VERSION_ID=NULL WHERE BASE_VERSION_ID IS NOT NULL`,
      );
      deleted.versions = await remove(connection, 'DELETE FROM JSA_VERSION');
      deleted.masters = await remove(connection, 'DELETE FROM JSA_MASTER');
    }
    deleted.numberCounters = await remove(connection, 'DELETE FROM JSA_NUMBER_COUNTER');

    const assignments = await assignRigMatrices(connection);

    const remainingResult = await connection.execute<{
      JSAS: number;
      VERSIONS: number;
      WORKFLOWS: number;
      COUNTERS: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM JSA_MASTER) JSAS,
         (SELECT COUNT(*) FROM JSA_VERSION) VERSIONS,
         (SELECT COUNT(*) FROM JSA_WORKFLOW_INSTANCE) WORKFLOWS,
         (SELECT COUNT(*) FROM JSA_NUMBER_COUNTER) COUNTERS
       FROM DUAL`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const remaining = remainingResult.rows?.[0];
    if (
      !remaining ||
      remaining.JSAS !== 0 ||
      remaining.VERSIONS !== 0 ||
      remaining.WORKFLOWS !== 0 ||
      remaining.COUNTERS !== 0
    )
      throw new Error('JSA reset verification failed before commit');

    await connection.commit();
    console.log(
      JSON.stringify({
        status: 'PASS',
        before,
        deleted,
        remaining,
        assignments,
      }),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (triggersDisabled) await setImmutabilityTriggers(connection, 'ENABLE');
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
