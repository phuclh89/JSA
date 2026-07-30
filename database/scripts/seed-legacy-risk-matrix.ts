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
const actor = process.env.RISK_MATRIX_SEED_ACTOR?.trim() || 'phuclh';

type IdRow = { ID_VALUE: string };
type MatrixRow = { MATRIX_ID: string; MATRIX_NAME: string };
type VersionRow = { MATRIX_VERSION_ID: string };
type AssignmentRow = { RIG_ID: string };

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

async function verify(
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
  if (
    !row ||
    row.LIKELIHOODS !== 5 ||
    row.SEVERITIES !== 5 ||
    row.RESULTS !== 4 ||
    row.CELLS !== 25
  )
    throw new Error('Seeded Matrix Version failed its 5x5 completeness verification');
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
      `SELECT TO_CHAR(MATRIX_ID) MATRIX_ID,MATRIX_NAME
       FROM JSA_RISK_MATRIX
       WHERE MATRIX_CODE=:matrixCode AND DIMENSION_SIZE=5
       FOR UPDATE`,
      { matrixCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const matrix = matrixResult.rows?.[0];
    if (!matrix) throw new Error(`Active 5x5 Matrix ${matrixCode} was not found`);

    const existingVersion = await connection.execute<VersionRow>(
      `SELECT TO_CHAR(MATRIX_VERSION_ID) MATRIX_VERSION_ID
       FROM JSA_RISK_MATRIX_VERSION
       WHERE MATRIX_ID=:matrixId AND VERSION_CODE=:versionCode`,
      { matrixId: matrix.MATRIX_ID, versionCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const existingVersionId = existingVersion.rows?.[0]?.MATRIX_VERSION_ID;
    if (existingVersionId) {
      const counts = await verify(connection, existingVersionId);
      console.log(
        JSON.stringify({
          status: 'PASS',
          result: 'already_seeded',
          matrixCode,
          versionCode,
          matrixVersionId: existingVersionId,
          ...counts,
        }),
      );
      return;
    }

    const currentAssignment = await connection.execute<AssignmentRow>(
      `SELECT TO_CHAR(RIG_ID) RIG_ID
       FROM JSA_RIG_MATRIX_ASSIGNMENT
       WHERE MATRIX_VERSION_ID IN (
         SELECT MATRIX_VERSION_ID FROM JSA_RISK_MATRIX_VERSION WHERE MATRIX_ID=:matrixId
       )
       AND IS_ACTIVE='Y' AND EFFECTIVE_TO IS NULL
       ORDER BY EFFECTIVE_FROM DESC
       FETCH FIRST 1 ROW ONLY`,
      { matrixId: matrix.MATRIX_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const rigId =
      process.env.RISK_MATRIX_SEED_RIG_ID?.trim() || currentAssignment.rows?.[0]?.RIG_ID;
    if (!rigId || !/^\d{1,19}$/.test(rigId))
      throw new Error('No valid Rig assignment was found for the target Matrix');

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
        description: 'PV Drilling legacy 5x5 terminology and risk colour guidance',
        actor,
      },
    );

    const likelihoodIds = new Map<string, string>();
    for (const [index, item] of legacyLikelihoods.entries()) {
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
    for (const [index, item] of legacySeverities.entries()) {
      const id = await nextId(connection, 'SEQ_JSA_RISK_SEVERITY');
      severityIds.set(item.code, id);
      await connection.execute(
        `INSERT INTO JSA_RISK_SEVERITY
         (SEVERITY_ID,MATRIX_VERSION_ID,SEVERITY_CODE,SEVERITY_LABEL,NUMERIC_VALUE,DISPLAY_ORDER,GENERAL_DEFINITION,CREATED_BY,UPDATED_BY)
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

    const resultIds = new Map<string, string>();
    for (const [index, item] of legacyRiskResults.entries()) {
      const id = await nextId(connection, 'SEQ_JSA_RISK_RESULT');
      resultIds.set(item.code, id);
      await connection.execute(
        `INSERT INTO JSA_RISK_RESULT
         (RISK_RESULT_ID,MATRIX_VERSION_ID,RESULT_CODE,RESULT_NAME,DESCRIPTION,SEMANTIC_CATEGORY,DISPLAY_ORDER,DISPLAY_COLOR,GUIDANCE_TEXT,PROHIBITED_FLAG,CREATED_BY,UPDATED_BY)
         VALUES
         (:id,:versionId,:code,:name,:description,:semanticCategory,:displayOrder,:color,:guidance,:prohibited,:actor,:actor)`,
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

    for (const likelihood of legacyLikelihoods) {
      const row = legacyMatrixCells[likelihood.code];
      if (!row || row.length !== legacySeverities.length)
        throw new Error(`Matrix row ${likelihood.code} is incomplete`);
      for (const [severityIndex, cell] of row.entries()) {
        const severity = legacySeverities[severityIndex]!;
        const cellId = await nextId(connection, 'SEQ_JSA_RISK_MATRIX_CELL');
        const likelihoodId = likelihoodIds.get(likelihood.code);
        const severityId = severityIds.get(severity.code);
        const resultId = resultIds.get(cell.result);
        if (!likelihoodId || !severityId || !resultId)
          throw new Error('Matrix cell reference mapping failed');
        await connection.execute(
          `INSERT INTO JSA_RISK_MATRIX_CELL
           (MATRIX_CELL_ID,MATRIX_VERSION_ID,LIKELIHOOD_ID,SEVERITY_ID,RATING_CODE,RISK_RESULT_ID,CREATED_BY,UPDATED_BY)
           VALUES
           (:cellId,:versionId,:likelihoodId,:severityId,:ratingCode,:resultId,:actor,:actor)`,
          {
            cellId,
            versionId,
            likelihoodId,
            severityId,
            ratingCode: cell.rating,
            resultId,
            actor,
          },
        );
      }
    }

    await connection.execute(
      `UPDATE JSA_RIG_MATRIX_ASSIGNMENT
       SET EFFECTIVE_TO=SYSTIMESTAMP,IS_ACTIVE='N',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE RIG_ID=:rigId AND IS_ACTIVE='Y' AND EFFECTIVE_TO IS NULL`,
      { actor, rigId },
    );
    await connection.execute(
      `UPDATE JSA_RISK_MATRIX_VERSION
       SET IS_ACTIVE='N',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE MATRIX_ID=:matrixId AND MATRIX_VERSION_ID<>:versionId AND IS_ACTIVE='Y'`,
      { actor, matrixId: matrix.MATRIX_ID, versionId },
    );
    const assignmentId = await nextId(connection, 'SEQ_JSA_RIG_MATRIX_ASSIGN');
    await connection.execute(
      `INSERT INTO JSA_RIG_MATRIX_ASSIGNMENT
       (RIG_MATRIX_ASSIGNMENT_ID,RIG_ID,MATRIX_VERSION_ID,EFFECTIVE_FROM,REASON_TEXT,CREATED_BY,UPDATED_BY)
       VALUES
       (:assignmentId,:rigId,:versionId,SYSTIMESTAMP,:reason,:actor,:actor)`,
      {
        assignmentId,
        rigId,
        versionId,
        reason: 'PV Drilling legacy 5x5 terminology confirmed for JSA use',
        actor,
      },
    );

    const counts = await verify(connection, versionId);
    await connection.commit();
    console.log(
      JSON.stringify({
        status: 'PASS',
        result: 'seeded',
        matrixCode,
        matrixName: matrix.MATRIX_NAME,
        versionCode,
        matrixVersionId: versionId,
        rigId,
        assignmentId,
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
