import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import {
  legacyLikelihoods,
  legacyMatrixCells,
  legacyRiskResults,
  legacySeverities,
} from './legacy-risk-matrix-data.js';

const matrixCode = process.env.RISK_MATRIX_SEED_CODE?.trim() || 'DEV-5X5';
const versionCode = process.env.RISK_MATRIX_SEED_VERSION?.trim() || 'PVDRILLING-V2';

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
      MATRIX_VERSION_ID: string;
      RIG_ID: string;
    }>(
      `SELECT TO_CHAR(V.MATRIX_VERSION_ID) MATRIX_VERSION_ID,TO_CHAR(A.RIG_ID) RIG_ID
       FROM JSA_RISK_MATRIX M
       JOIN JSA_RISK_MATRIX_VERSION V ON V.MATRIX_ID=M.MATRIX_ID
       JOIN JSA_RIG_MATRIX_ASSIGNMENT A ON A.MATRIX_VERSION_ID=V.MATRIX_VERSION_ID
       WHERE M.MATRIX_CODE=:matrixCode AND V.VERSION_CODE=:versionCode
         AND V.IS_ACTIVE='Y' AND A.IS_ACTIVE='Y' AND A.EFFECTIVE_TO IS NULL`,
      { matrixCode, versionCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const version = versionResult.rows?.[0];
    if (!version) throw new Error('The seeded Matrix Version is not the active Rig assignment');

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
      legacyLikelihoods.map((item) => ({
        CODE: item.code,
        LABEL: item.label,
        DEFINITION: item.definition,
      })),
      'Probability terminology',
    );

    const severityResult = await connection.execute<{
      CODE: string;
      LABEL: string;
      DEFINITION: string;
    }>(
      `SELECT SEVERITY_CODE CODE,SEVERITY_LABEL LABEL,GENERAL_DEFINITION DEFINITION
       FROM JSA_RISK_SEVERITY
       WHERE MATRIX_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY DISPLAY_ORDER`,
      { versionId: version.MATRIX_VERSION_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      severityResult.rows,
      legacySeverities.map((item) => ({
        CODE: item.code,
        LABEL: item.label,
        DEFINITION: item.definition,
      })),
      'Severity terminology',
    );

    const resultRows = await connection.execute<{
      CODE: string;
      NAME: string;
      DISPLAY_COLOR: string;
      GUIDANCE_TEXT: string;
      PROHIBITED_FLAG: string;
    }>(
      `SELECT RESULT_CODE CODE,RESULT_NAME NAME,DISPLAY_COLOR,GUIDANCE_TEXT,PROHIBITED_FLAG
       FROM JSA_RISK_RESULT
       WHERE MATRIX_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY DISPLAY_ORDER`,
      { versionId: version.MATRIX_VERSION_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      resultRows.rows,
      legacyRiskResults.map((item) => ({
        CODE: item.code,
        NAME: item.name,
        DISPLAY_COLOR: item.color,
        GUIDANCE_TEXT: item.guidance,
        PROHIBITED_FLAG: item.prohibited ? 'Y' : 'N',
      })),
      'Risk Colour Overview',
    );

    const cellResult = await connection.execute<{
      LIKELIHOOD_CODE: string;
      SEVERITY_CODE: string;
      RATING_CODE: string;
      RESULT_CODE: string;
    }>(
      `SELECT L.LIKELIHOOD_CODE,S.SEVERITY_CODE,C.RATING_CODE,R.RESULT_CODE
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
      legacyLikelihoods.flatMap((likelihood) =>
        legacySeverities.map((severity, index) => ({
          LIKELIHOOD_CODE: likelihood.code,
          SEVERITY_CODE: severity.code,
          RATING_CODE: legacyMatrixCells[likelihood.code]![index]!.rating,
          RESULT_CODE: legacyMatrixCells[likelihood.code]![index]!.result,
        })),
      ),
      '5x5 cells',
    );

    console.log(
      JSON.stringify({
        status: 'PASS',
        matrixCode,
        versionCode,
        matrixVersionId: version.MATRIX_VERSION_ID,
        rigId: version.RIG_ID,
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
