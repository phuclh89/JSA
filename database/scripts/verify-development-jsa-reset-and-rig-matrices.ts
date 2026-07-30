import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { pvDrillingRigMatrixAssignments } from './pv-drilling-rig-matrix-assignment-data.js';

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

function same(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${label} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const resetResult = await connection.execute<{
      JSAS: number;
      VERSIONS: number;
      WORKFLOWS: number;
      ACTIONS: number;
      NOTIFICATIONS: number;
      COUNTERS: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM JSA_MASTER) JSAS,
         (SELECT COUNT(*) FROM JSA_VERSION) VERSIONS,
         (SELECT COUNT(*) FROM JSA_WORKFLOW_INSTANCE) WORKFLOWS,
         (SELECT COUNT(*) FROM JSA_WORKFLOW_ACTION) ACTIONS,
         (SELECT COUNT(*) FROM SYS_NOTIFICATION WHERE TARGET_TYPE='JSA_MASTER') NOTIFICATIONS,
         (SELECT COUNT(*) FROM JSA_NUMBER_COUNTER) COUNTERS
       FROM DUAL`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      resetResult.rows?.[0],
      {
        JSAS: 0,
        VERSIONS: 0,
        WORKFLOWS: 0,
        ACTIONS: 0,
        NOTIFICATIONS: 0,
        COUNTERS: 0,
      },
      'Cleared JSA data',
    );

    const assignmentResult = await connection.execute<{
      RIG_CODE: string;
      MATRIX_CODE: string;
      VERSION_CODE: string;
    }>(
      `SELECT R.RIG_CODE,M.MATRIX_CODE,V.VERSION_CODE
       FROM SYS_RIG R
       JOIN JSA_RIG_MATRIX_ASSIGNMENT A ON A.RIG_ID=R.RIG_ID
       JOIN JSA_RISK_MATRIX_VERSION V ON V.MATRIX_VERSION_ID=A.MATRIX_VERSION_ID
       JOIN JSA_RISK_MATRIX M ON M.MATRIX_ID=V.MATRIX_ID
       WHERE R.IS_ACTIVE='Y' AND A.IS_ACTIVE='Y' AND A.EFFECTIVE_TO IS NULL
       ORDER BY R.RIG_CODE`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      assignmentResult.rows,
      [...pvDrillingRigMatrixAssignments]
        .sort((a, b) => a.rigCode.localeCompare(b.rigCode))
        .map((item) => ({
          RIG_CODE: item.rigCode,
          MATRIX_CODE: item.matrixCode,
          VERSION_CODE: item.versionCode,
        })),
      'Active Rig Matrix assignments',
    );

    const triggerResult = await connection.execute<{
      TRIGGER_NAME: string;
      STATUS: string;
    }>(
      `SELECT TRIGGER_NAME,STATUS FROM USER_TRIGGERS
       WHERE TRIGGER_NAME IN (${immutabilityTriggers
         .map((_, index) => `:trigger${index}`)
         .join(',')})
       ORDER BY TRIGGER_NAME`,
      Object.fromEntries(
        immutabilityTriggers.map((trigger, index) => [`trigger${index}`, trigger]),
      ),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (
      triggerResult.rows?.length !== immutabilityTriggers.length ||
      triggerResult.rows.some((trigger) => trigger.STATUS !== 'ENABLED')
    )
      throw new Error('One or more JSA immutability triggers are not enabled');

    console.log(
      JSON.stringify({
        status: 'PASS',
        reset: resetResult.rows?.[0],
        activeAssignments: assignmentResult.rows?.length,
        enabledImmutabilityTriggers: triggerResult.rows.length,
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
    }),
  );
  process.exitCode = 1;
});
