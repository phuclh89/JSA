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
const actor = process.env.RISK_MATRIX_3X3_SEED_ACTOR?.trim() || 'phuclh';

type IdRow = { ID_VALUE: string };
type MatrixRow = { MATRIX_ID: string; DIMENSION_SIZE: number };
type VersionRow = { MATRIX_VERSION_ID: string };

async function nextId(connection: oracledb.Connection, sequence: string): Promise<string> {
  const result = await connection.execute<IdRow>(
    `SELECT TO_CHAR(${sequence}.NEXTVAL) ID_VALUE FROM DUAL`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const id = result.rows?.[0]?.ID_VALUE;
  if (!id) throw new Error(`Could not allocate an ID from ${sequence}`);
  return id;
}

async function verifyCounts(
  connection: oracledb.Connection,
  versionId: string,
): Promise<{ likelihoods: number; severities: number; results: number; cells: number }> {
  const result = await connection.execute<{
    LIKELIHOODS: number;
    SEVERITIES: number;
    RESULTS: number;
    CELLS: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM JSA_RISK_LIKELIHOOD WHERE MATRIX_VERSION_ID=:versionId AND IS_ACTIVE='Y') LIKELIHOODS,
       (SELECT COUNT(*) FROM JSA_RISK_SEVERITY WHERE MATRIX_VERSION_ID=:versionId AND IS_ACTIVE='Y') SEVERITIES,
       (SELECT COUNT(*) FROM JSA_RISK_RESULT WHERE MATRIX_VERSION_ID=:versionId AND IS_ACTIVE='Y') RESULTS,
       (SELECT COUNT(*) FROM JSA_RISK_MATRIX_CELL WHERE MATRIX_VERSION_ID=:versionId AND IS_ACTIVE='Y') CELLS
     FROM DUAL`,
    { versionId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const row = result.rows?.[0];
  if (!row || row.LIKELIHOODS !== 3 || row.SEVERITIES !== 3 || row.RESULTS !== 3 || row.CELLS !== 9)
    throw new Error('Seeded Matrix Version failed its 3x3 completeness verification');
  return {
    likelihoods: row.LIKELIHOODS,
    severities: row.SEVERITIES,
    results: row.RESULTS,
    cells: row.CELLS,
  };
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const matrixResult = await connection.execute<MatrixRow>(
      `SELECT TO_CHAR(MATRIX_ID) MATRIX_ID,DIMENSION_SIZE
       FROM JSA_RISK_MATRIX
       WHERE MATRIX_CODE=:matrixCode
       FOR UPDATE`,
      { matrixCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    let matrix = matrixResult.rows?.[0];
    if (matrix && matrix.DIMENSION_SIZE !== 3)
      throw new Error(`Matrix ${matrixCode} exists but is not a 3x3 Matrix`);

    if (!matrix) {
      const matrixId = await nextId(connection, 'SEQ_JSA_RISK_MATRIX');
      await connection.execute(
        `INSERT INTO JSA_RISK_MATRIX
         (MATRIX_ID,MATRIX_CODE,MATRIX_NAME,DIMENSION_SIZE,DESCRIPTION,CREATED_BY,UPDATED_BY)
         VALUES
         (:matrixId,:matrixCode,:matrixName,3,:description,:actor,:actor)`,
        {
          matrixId,
          matrixCode,
          matrixName: 'PV Drilling 3x3 Risk Matrix',
          description: 'PV Drilling 3x3 matrix from Procedure Reference P1.04.09',
          actor,
        },
      );
      matrix = { MATRIX_ID: matrixId, DIMENSION_SIZE: 3 };
    }

    const existingVersion = await connection.execute<VersionRow>(
      `SELECT TO_CHAR(MATRIX_VERSION_ID) MATRIX_VERSION_ID
       FROM JSA_RISK_MATRIX_VERSION
       WHERE MATRIX_ID=:matrixId AND VERSION_CODE=:versionCode`,
      { matrixId: matrix.MATRIX_ID, versionCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const existingVersionId = existingVersion.rows?.[0]?.MATRIX_VERSION_ID;
    if (existingVersionId) {
      const counts = await verifyCounts(connection, existingVersionId);
      console.log(
        JSON.stringify({
          status: 'PASS',
          result: 'already_seeded',
          matrixCode,
          versionCode,
          matrixVersionId: existingVersionId,
          assignedToRig: false,
          ...counts,
        }),
      );
      return;
    }

    const versionId = await nextId(connection, 'SEQ_JSA_RISK_MATRIX_VER');
    await connection.execute(
      `INSERT INTO JSA_RISK_MATRIX_VERSION
       (MATRIX_VERSION_ID,MATRIX_ID,VERSION_CODE,DESCRIPTION,EFFECTIVE_FROM,IS_ACTIVE,CREATED_BY,UPDATED_BY)
       VALUES
       (:versionId,:matrixId,:versionCode,:description,SYSTIMESTAMP,'Y',:actor,:actor)`,
      {
        versionId,
        matrixId: matrix.MATRIX_ID,
        versionCode,
        description: 'Confirmed 3x3 likelihood, severity, score, and result configuration',
        actor,
      },
    );

    const likelihoodIds = new Map<string, string>();
    for (const [index, item] of pvDrilling3x3Likelihoods.entries()) {
      const id = await nextId(connection, 'SEQ_JSA_RISK_LIKELIHOOD');
      likelihoodIds.set(item.code, id);
      await connection.execute(
        `INSERT INTO JSA_RISK_LIKELIHOOD
         (LIKELIHOOD_ID,MATRIX_VERSION_ID,LIKELIHOOD_CODE,LIKELIHOOD_LABEL,NUMERIC_VALUE,DISPLAY_ORDER,DEFINITION,CREATED_BY,UPDATED_BY)
         VALUES
         (:id,:versionId,:code,:label,:numericValue,:displayOrder,:definition,:actor,:actor)`,
        {
          id,
          versionId,
          code: item.code,
          label: item.label,
          numericValue: index + 1,
          displayOrder: index + 1,
          definition: item.definition,
          actor,
        },
      );
    }

    const severityIds = new Map<string, string>();
    for (const [index, item] of pvDrilling3x3Severities.entries()) {
      const id = await nextId(connection, 'SEQ_JSA_RISK_SEVERITY');
      severityIds.set(item.code, id);
      await connection.execute(
        `INSERT INTO JSA_RISK_SEVERITY
         (SEVERITY_ID,MATRIX_VERSION_ID,SEVERITY_CODE,SEVERITY_LABEL,NUMERIC_VALUE,DISPLAY_ORDER,
          GENERAL_DEFINITION,PEOPLE_DEFINITION,ASSET_DEFINITION,ENVIRONMENT_DEFINITION,CREATED_BY,UPDATED_BY)
         VALUES
         (:id,:versionId,:code,:label,:numericValue,:displayOrder,:generalDefinition,
          :peopleDefinition,:assetDefinition,:environmentDefinition,:actor,:actor)`,
        {
          id,
          versionId,
          code: item.code,
          label: item.label,
          numericValue: index + 1,
          displayOrder: index + 1,
          generalDefinition: item.generalDefinition,
          peopleDefinition: item.peopleDefinition,
          assetDefinition: item.assetDefinition,
          environmentDefinition: item.environmentDefinition,
          actor,
        },
      );
    }

    const resultIds = new Map<string, string>();
    for (const [index, item] of pvDrilling3x3RiskResults.entries()) {
      const id = await nextId(connection, 'SEQ_JSA_RISK_RESULT');
      resultIds.set(item.code, id);
      await connection.execute(
        `INSERT INTO JSA_RISK_RESULT
         (RISK_RESULT_ID,MATRIX_VERSION_ID,RESULT_CODE,RESULT_NAME,DESCRIPTION,SEMANTIC_CATEGORY,
          DISPLAY_ORDER,DISPLAY_COLOR,GUIDANCE_TEXT,PROHIBITED_FLAG,CREATED_BY,UPDATED_BY)
         VALUES
         (:id,:versionId,:code,:name,:description,:semanticCategory,:displayOrder,:color,
          :guidance,:prohibited,:actor,:actor)`,
        {
          id,
          versionId,
          code: item.code,
          name: item.name,
          description: item.description,
          semanticCategory: item.semanticCategory,
          displayOrder: index + 1,
          color: item.color,
          guidance: item.guidance,
          prohibited: item.prohibited ? 'Y' : 'N',
          actor,
        },
      );
    }

    for (const likelihood of pvDrilling3x3Likelihoods) {
      const row = pvDrilling3x3MatrixCells[likelihood.code];
      if (!row || row.length !== pvDrilling3x3Severities.length)
        throw new Error(`Matrix row ${likelihood.code} is incomplete`);
      for (const [severityIndex, cell] of row.entries()) {
        const severity = pvDrilling3x3Severities[severityIndex]!;
        const likelihoodId = likelihoodIds.get(likelihood.code);
        const severityId = severityIds.get(severity.code);
        const resultId = resultIds.get(cell.result);
        if (!likelihoodId || !severityId || !resultId)
          throw new Error('Matrix cell reference mapping failed');
        await connection.execute(
          `INSERT INTO JSA_RISK_MATRIX_CELL
           (MATRIX_CELL_ID,MATRIX_VERSION_ID,LIKELIHOOD_ID,SEVERITY_ID,RATING_CODE,RATING_VALUE,
            RISK_RESULT_ID,CREATED_BY,UPDATED_BY)
           VALUES
           (SEQ_JSA_RISK_MATRIX_CELL.NEXTVAL,:versionId,:likelihoodId,:severityId,:ratingCode,
            :ratingValue,:resultId,:actor,:actor)`,
          {
            versionId,
            likelihoodId,
            severityId,
            ratingCode: cell.rating,
            ratingValue: cell.value,
            resultId,
            actor,
          },
        );
      }
    }

    const counts = await verifyCounts(connection, versionId);
    await connection.commit();
    console.log(
      JSON.stringify({
        status: 'PASS',
        result: 'seeded',
        matrixCode,
        versionCode,
        matrixId: matrix.MATRIX_ID,
        matrixVersionId: versionId,
        assignedToRig: false,
        ...counts,
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
