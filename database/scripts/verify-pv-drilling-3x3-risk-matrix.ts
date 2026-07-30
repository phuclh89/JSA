import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import {
  pvDrilling3x3Likelihoods,
  pvDrilling3x3MatrixCells,
  pvDrilling3x3RiskResults,
  pvDrilling3x3Severities,
} from './pv-drilling-3x3-risk-matrix-data.js';

const matrixCode = process.env.RISK_MATRIX_3X3_SEED_CODE?.trim() || 'PVD-3X3';
const versionCode = process.env.RISK_MATRIX_3X3_SEED_VERSION?.trim() || 'V1';

function same(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${label} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const versionResult = await connection.execute<{
      MATRIX_ID: string;
      MATRIX_VERSION_ID: string;
      DIMENSION_SIZE: number;
    }>(
      `SELECT TO_CHAR(M.MATRIX_ID) MATRIX_ID,TO_CHAR(V.MATRIX_VERSION_ID) MATRIX_VERSION_ID,
              M.DIMENSION_SIZE
       FROM JSA_RISK_MATRIX M
       JOIN JSA_RISK_MATRIX_VERSION V ON V.MATRIX_ID=M.MATRIX_ID
       WHERE M.MATRIX_CODE=:matrixCode AND V.VERSION_CODE=:versionCode
         AND M.IS_ACTIVE='Y' AND V.IS_ACTIVE='Y'`,
      { matrixCode, versionCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const version = versionResult.rows?.[0];
    if (!version || version.DIMENSION_SIZE !== 3)
      throw new Error('The seeded active 3x3 Matrix Version was not found');

    const likelihoodResult = await connection.execute<{
      CODE: string;
      LABEL: string;
      DEFINITION: string;
    }>(
      `SELECT LIKELIHOOD_CODE CODE,LIKELIHOOD_LABEL LABEL,DEFINITION
       FROM JSA_RISK_LIKELIHOOD
       WHERE MATRIX_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY DISPLAY_ORDER`,
      { versionId: version.MATRIX_VERSION_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      likelihoodResult.rows,
      pvDrilling3x3Likelihoods.map((item) => ({
        CODE: item.code,
        LABEL: item.label,
        DEFINITION: item.definition,
      })),
      'Likelihood terminology',
    );

    const severityResult = await connection.execute<{
      CODE: string;
      LABEL: string;
      GENERAL_DEFINITION: string;
      PEOPLE_DEFINITION: string;
      ASSET_DEFINITION: string;
      ENVIRONMENT_DEFINITION: string;
    }>(
      `SELECT SEVERITY_CODE CODE,SEVERITY_LABEL LABEL,GENERAL_DEFINITION,
              PEOPLE_DEFINITION,ASSET_DEFINITION,ENVIRONMENT_DEFINITION
       FROM JSA_RISK_SEVERITY
       WHERE MATRIX_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY DISPLAY_ORDER`,
      { versionId: version.MATRIX_VERSION_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      severityResult.rows,
      pvDrilling3x3Severities.map((item) => ({
        CODE: item.code,
        LABEL: item.label,
        GENERAL_DEFINITION: item.generalDefinition,
        PEOPLE_DEFINITION: item.peopleDefinition,
        ASSET_DEFINITION: item.assetDefinition,
        ENVIRONMENT_DEFINITION: item.environmentDefinition,
      })),
      'Severity terminology',
    );

    const resultRows = await connection.execute<{
      CODE: string;
      NAME: string;
      DISPLAY_COLOR: string;
      PROHIBITED_FLAG: string;
    }>(
      `SELECT RESULT_CODE CODE,RESULT_NAME NAME,DISPLAY_COLOR,PROHIBITED_FLAG
       FROM JSA_RISK_RESULT
       WHERE MATRIX_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY DISPLAY_ORDER`,
      { versionId: version.MATRIX_VERSION_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      resultRows.rows,
      pvDrilling3x3RiskResults.map((item) => ({
        CODE: item.code,
        NAME: item.name,
        DISPLAY_COLOR: item.color,
        PROHIBITED_FLAG: item.prohibited ? 'Y' : 'N',
      })),
      'Risk results',
    );

    const cellResult = await connection.execute<{
      LIKELIHOOD_CODE: string;
      SEVERITY_CODE: string;
      RATING_CODE: string;
      RATING_VALUE: number;
      RESULT_CODE: string;
    }>(
      `SELECT L.LIKELIHOOD_CODE,S.SEVERITY_CODE,C.RATING_CODE,C.RATING_VALUE,R.RESULT_CODE
       FROM JSA_RISK_MATRIX_CELL C
       JOIN JSA_RISK_LIKELIHOOD L ON L.LIKELIHOOD_ID=C.LIKELIHOOD_ID
       JOIN JSA_RISK_SEVERITY S ON S.SEVERITY_ID=C.SEVERITY_ID
       JOIN JSA_RISK_RESULT R ON R.RISK_RESULT_ID=C.RISK_RESULT_ID
       WHERE C.MATRIX_VERSION_ID=:versionId AND C.IS_ACTIVE='Y'
       ORDER BY L.DISPLAY_ORDER,S.DISPLAY_ORDER`,
      { versionId: version.MATRIX_VERSION_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      cellResult.rows,
      pvDrilling3x3Likelihoods.flatMap((likelihood) =>
        pvDrilling3x3Severities.map((severity, index) => {
          const cell = pvDrilling3x3MatrixCells[likelihood.code]![index]!;
          return {
            LIKELIHOOD_CODE: likelihood.code,
            SEVERITY_CODE: severity.code,
            RATING_CODE: cell.rating,
            RATING_VALUE: cell.value,
            RESULT_CODE: cell.result,
          };
        }),
      ),
      '3x3 cells',
    );

    const assignmentResult = await connection.execute<{ ASSIGNMENT_COUNT: number }>(
      `SELECT COUNT(*) ASSIGNMENT_COUNT
       FROM JSA_RIG_MATRIX_ASSIGNMENT
       WHERE MATRIX_VERSION_ID=:versionId AND IS_ACTIVE='Y' AND EFFECTIVE_TO IS NULL`,
      { versionId: version.MATRIX_VERSION_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    console.log(
      JSON.stringify({
        status: 'PASS',
        matrixCode,
        versionCode,
        matrixId: version.MATRIX_ID,
        matrixVersionId: version.MATRIX_VERSION_ID,
        activeRigAssignments: assignmentResult.rows?.[0]?.ASSIGNMENT_COUNT ?? 0,
        likelihoods: likelihoodResult.rows?.length,
        severities: severityResult.rows?.length,
        results: resultRows.rows?.length,
        cells: cellResult.rows?.length,
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
