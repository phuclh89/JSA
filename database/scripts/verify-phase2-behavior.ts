import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';

const options = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;
async function nextId(connection: oracledb.Connection, sequence: string): Promise<string> {
  if (!/^SEQ_(SYS|JSA)_[A-Z0-9_]+$/.test(sequence)) throw new Error('Unexpected sequence');
  const result = await connection.execute<{ ID_VALUE: string }>(
    `SELECT TO_CHAR(${sequence}.NEXTVAL) ID_VALUE FROM DUAL`,
    {},
    options,
  );
  return result.rows?.[0]?.ID_VALUE ?? '';
}
async function expectConstraint(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
    throw new Error('Expected Oracle constraint rejection');
  } catch (error) {
    if (![1, 2290, 2291, 2292].includes((error as { errorNum?: number }).errorNum ?? -1))
      throw error;
  }
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  const actor = 'PHASE2_TEST_ONLY';
  try {
    const siteId = await nextId(connection, 'SEQ_SYS_SITE');
    const otherSiteId = await nextId(connection, 'SEQ_SYS_SITE');
    for (const [id, code] of [
      [siteId, 'P2TEST'],
      [otherSiteId, 'P2OTHER'],
    ])
      await connection.execute(
        `INSERT INTO SYS_SITE (SITE_ID,SITE_CODE,SITE_NAME,SEQUENCE_CODE,TIMEZONE_NAME,CREATED_BY,UPDATED_BY) VALUES (:id,:code,:name,:code,'UTC',:actor,:actor)`,
        { id, code, name: `${code} test site`, actor },
      );
    const rigId = await nextId(connection, 'SEQ_SYS_RIG');
    await connection.execute(
      `INSERT INTO SYS_RIG (RIG_ID,SITE_ID,RIG_CODE,RIG_NAME,CREATED_SITE_ID,UPDATED_SITE_ID,CREATED_BY,UPDATED_BY) VALUES (:rigId,:siteId,'P2RIG','Phase 2 test Rig',:siteId,:siteId,:actor,:actor)`,
      { rigId, siteId, actor },
    );
    const positionId = await nextId(connection, 'SEQ_SYS_POSITION');
    await connection.execute(
      `INSERT INTO SYS_POSITION (POSITION_ID,POSITION_CODE,POSITION_NAME,DISPLAY_ORDER,SCOPE_TYPE,SITE_ID,CREATED_BY,UPDATED_BY) VALUES (:id,'DRILLER','Driller',1,'SITE',:siteId,:actor,:actor)`,
      { id: positionId, siteId, actor },
    );
    await expectConstraint(() =>
      connection.execute(
        `INSERT INTO SYS_POSITION (POSITION_ID,POSITION_CODE,POSITION_NAME,DISPLAY_ORDER,SCOPE_TYPE,SITE_ID,CREATED_BY,UPDATED_BY) VALUES (SEQ_SYS_POSITION.NEXTVAL,'driller','Duplicate',2,'SITE',:siteId,:actor,:actor)`,
        { siteId, actor },
      ),
    );
    await connection.execute(
      `INSERT INTO SYS_POSITION (POSITION_ID,POSITION_CODE,POSITION_NAME,DISPLAY_ORDER,SCOPE_TYPE,SITE_ID,CREATED_BY,UPDATED_BY) VALUES (SEQ_SYS_POSITION.NEXTVAL,'DRILLER','Other-site Driller',1,'SITE',:otherSiteId,:actor,:actor)`,
      { otherSiteId, actor },
    );
    await expectConstraint(() =>
      connection.execute(
        `INSERT INTO SYS_POSITION (POSITION_ID,POSITION_CODE,POSITION_NAME,DISPLAY_ORDER,SCOPE_TYPE,SITE_ID,RIG_ID,CREATED_BY,UPDATED_BY) VALUES (SEQ_SYS_POSITION.NEXTVAL,'BAD_SCOPE','Invalid',1,'RIG',:otherSiteId,:rigId,:actor,:actor)`,
        { otherSiteId, rigId, actor },
      ),
    );
    const categoryId = await nextId(connection, 'SEQ_SYS_TOOL_CATEGORY');
    await connection.execute(
      `INSERT INTO SYS_TOOL_CATEGORY (TOOL_CATEGORY_ID,CATEGORY_CODE,CATEGORY_NAME,DISPLAY_ORDER,SCOPE_TYPE,CREATED_BY,UPDATED_BY) VALUES (:id,'HAND','Hand Tools',1,'GLOBAL',:actor,:actor)`,
      { id: categoryId, actor },
    );
    await connection.execute(
      `INSERT INTO SYS_TOOL (TOOL_ID,TOOL_CODE,TOOL_NAME,TOOL_CATEGORY_ID,DISPLAY_ORDER,SCOPE_TYPE,CREATED_BY,UPDATED_BY) VALUES (SEQ_SYS_TOOL.NEXTVAL,'WRENCH','Wrench',:categoryId,1,'GLOBAL',:actor,:actor)`,
      { categoryId, actor },
    );
    await expectConstraint(() =>
      connection.execute(
        `INSERT INTO SYS_TOOL (TOOL_ID,TOOL_CODE,TOOL_NAME,TOOL_CATEGORY_ID,DISPLAY_ORDER,SCOPE_TYPE,CREATED_BY,UPDATED_BY) VALUES (SEQ_SYS_TOOL.NEXTVAL,'BAD_TOOL','Bad Tool',999999999999999999,1,'GLOBAL',:actor,:actor)`,
        { actor },
      ),
    );
    await expectConstraint(() =>
      connection.execute(
        `INSERT INTO JSA_RISK_MATRIX (MATRIX_ID,MATRIX_CODE,MATRIX_NAME,DIMENSION_SIZE,CREATED_BY,UPDATED_BY) VALUES (SEQ_JSA_RISK_MATRIX.NEXTVAL,'BAD_DIM','Invalid',4,:actor,:actor)`,
        { actor },
      ),
    );

    const matrixId = await nextId(connection, 'SEQ_JSA_RISK_MATRIX');
    await connection.execute(
      `INSERT INTO JSA_RISK_MATRIX (MATRIX_ID,MATRIX_CODE,MATRIX_NAME,DIMENSION_SIZE,CREATED_BY,UPDATED_BY) VALUES (:id,'TEST_MIXED_5X5','Test-only mixed-code 5x5',5,:actor,:actor)`,
      { id: matrixId, actor },
    );
    const versionId = await nextId(connection, 'SEQ_JSA_RISK_MATRIX_VER');
    await connection.execute(
      `INSERT INTO JSA_RISK_MATRIX_VERSION (MATRIX_VERSION_ID,MATRIX_ID,VERSION_CODE,CREATED_BY,UPDATED_BY) VALUES (:id,:matrixId,'TEST_V1',:actor,:actor)`,
      { id: versionId, matrixId, actor },
    );
    const likelihoodIds: string[] = [];
    for (let index = 1; index <= 5; index++) {
      const id = await nextId(connection, 'SEQ_JSA_RISK_LIKELIHOOD');
      likelihoodIds.push(id);
      await connection.execute(
        `INSERT INTO JSA_RISK_LIKELIHOOD (LIKELIHOOD_ID,MATRIX_VERSION_ID,LIKELIHOOD_CODE,LIKELIHOOD_LABEL,NUMERIC_VALUE,DISPLAY_ORDER,DEFINITION,CREATED_BY,UPDATED_BY) VALUES (:id,:versionId,:code,:label,:numericValue,:displayOrder,:definition,:actor,:actor)`,
        {
          id,
          versionId,
          code: String(index),
          label: `Test likelihood ${index}`,
          numericValue: index,
          displayOrder: index,
          definition: `Test-only definition ${index}`,
          actor,
        },
      );
    }
    const severityCodes = ['A', 'B', 'C', 'D', 'E'];
    const severityIds: string[] = [];
    for (let index = 0; index < 5; index++) {
      const id = await nextId(connection, 'SEQ_JSA_RISK_SEVERITY');
      severityIds.push(id);
      await connection.execute(
        `INSERT INTO JSA_RISK_SEVERITY (SEVERITY_ID,MATRIX_VERSION_ID,SEVERITY_CODE,SEVERITY_LABEL,DISPLAY_ORDER,GENERAL_DEFINITION,CREATED_BY,UPDATED_BY) VALUES (:id,:versionId,:code,:label,:displayOrder,:definition,:actor,:actor)`,
        {
          id,
          versionId,
          code: severityCodes[index],
          label: `Test severity ${severityCodes[index]}`,
          displayOrder: index + 1,
          definition: `Test-only severity ${severityCodes[index]}`,
          actor,
        },
      );
    }
    const resultIds = new Map<string, string>();
    for (const [index, code] of ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'].entries()) {
      const id = await nextId(connection, 'SEQ_JSA_RISK_RESULT');
      resultIds.set(code, id);
      await connection.execute(
        `INSERT INTO JSA_RISK_RESULT (RISK_RESULT_ID,MATRIX_VERSION_ID,RESULT_CODE,RESULT_NAME,DISPLAY_ORDER,DISPLAY_COLOR,CREATED_BY,UPDATED_BY) VALUES (:id,:versionId,:code,:name,:displayOrder,:color,:actor,:actor)`,
        {
          id,
          versionId,
          code,
          name: `${code} test result`,
          displayOrder: index + 1,
          color: ['#e2f6d5', '#ffd11a', '#ffc091', '#d03238'][index],
          actor,
        },
      );
    }
    const ratings = [
      'L',
      'L',
      'M',
      'M',
      'H',
      'L',
      'M',
      'M',
      'H',
      'H',
      'M',
      'M',
      'H',
      'H',
      'E',
      'M',
      'H',
      'H',
      'E',
      'E',
      'M',
      'H',
      'H',
      'E',
      'E',
    ];
    const resultByRating: Record<string, string> = {
      L: 'LOW',
      M: 'MEDIUM',
      H: 'HIGH',
      E: 'EXTREME',
    };
    let cellIndex = 0;
    for (let likelihood = 0; likelihood < 5; likelihood++)
      for (let severity = 0; severity < 5; severity++) {
        const rating = ratings[cellIndex++]!;
        await connection.execute(
          `INSERT INTO JSA_RISK_MATRIX_CELL (MATRIX_CELL_ID,MATRIX_VERSION_ID,LIKELIHOOD_ID,SEVERITY_ID,RATING_CODE,RISK_RESULT_ID,CREATED_BY,UPDATED_BY) VALUES (SEQ_JSA_RISK_MATRIX_CELL.NEXTVAL,:versionId,:likelihoodId,:severityId,:ratingCode,:resultId,:actor,:actor)`,
          {
            versionId,
            likelihoodId: likelihoodIds[likelihood],
            severityId: severityIds[severity],
            ratingCode: rating,
            resultId: resultIds.get(resultByRating[rating]!),
            actor,
          },
        );
      }
    const lookup = await connection.execute<{
      LIKELIHOOD_CODE: string;
      SEVERITY_CODE: string;
      RATING_CODE: string;
      RESULT_CODE: string;
    }>(
      `SELECT L.LIKELIHOOD_CODE,S.SEVERITY_CODE,C.RATING_CODE,R.RESULT_CODE FROM JSA_RISK_MATRIX_CELL C JOIN JSA_RISK_LIKELIHOOD L ON L.LIKELIHOOD_ID=C.LIKELIHOOD_ID JOIN JSA_RISK_SEVERITY S ON S.SEVERITY_ID=C.SEVERITY_ID JOIN JSA_RISK_RESULT R ON R.RISK_RESULT_ID=C.RISK_RESULT_ID WHERE C.MATRIX_VERSION_ID=:versionId AND L.LIKELIHOOD_CODE='5' AND S.SEVERITY_CODE='D'`,
      { versionId },
      options,
    );
    const row = lookup.rows?.[0];
    if (
      row?.LIKELIHOOD_CODE !== '5' ||
      row.SEVERITY_CODE !== 'D' ||
      row.RATING_CODE !== 'E' ||
      row.RESULT_CODE !== 'EXTREME'
    )
      throw new Error('Mixed-code configured lookup failed');
    const complete = await connection.execute<{ CELL_COUNT: number }>(
      `SELECT COUNT(*) CELL_COUNT FROM JSA_RISK_MATRIX_CELL WHERE MATRIX_VERSION_ID=:versionId`,
      { versionId },
      options,
    );
    if (complete.rows?.[0]?.CELL_COUNT !== 25)
      throw new Error('Test-only 5x5 Matrix is incomplete');
    await expectConstraint(() =>
      connection.execute(
        `INSERT INTO JSA_RISK_MATRIX_CELL (MATRIX_CELL_ID,MATRIX_VERSION_ID,LIKELIHOOD_ID,SEVERITY_ID,RATING_CODE,RISK_RESULT_ID,CREATED_BY,UPDATED_BY) VALUES (SEQ_JSA_RISK_MATRIX_CELL.NEXTVAL,:versionId,:likelihoodId,:severityId,'E',:resultId,:actor,:actor)`,
        {
          versionId,
          likelihoodId: likelihoodIds[4],
          severityId: severityIds[4],
          resultId: resultIds.get('EXTREME'),
          actor,
        },
      ),
    );
    const assignmentId = await nextId(connection, 'SEQ_JSA_RIG_MATRIX_ASSIGN');
    await connection.execute(
      `INSERT INTO JSA_RIG_MATRIX_ASSIGNMENT (RIG_MATRIX_ASSIGNMENT_ID,RIG_ID,MATRIX_VERSION_ID,EFFECTIVE_FROM,EFFECTIVE_TO,REASON_TEXT,CREATED_BY,UPDATED_BY) VALUES (:id,:rigId,:versionId,SYSTIMESTAMP,SYSTIMESTAMP+10,'Test-only assignment',:actor,:actor)`,
      { id: assignmentId, rigId, versionId, actor },
    );
    const overlap = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM JSA_RIG_MATRIX_ASSIGNMENT WHERE RIG_ID=:rigId AND EFFECTIVE_FROM<SYSTIMESTAMP+5 AND NVL(EFFECTIVE_TO,TIMESTAMP '9999-12-31 23:59:59')>SYSTIMESTAMP+1`,
      { rigId },
      options,
    );
    if (overlap.rows?.[0]?.ITEM_COUNT !== 1) throw new Error('Assignment overlap lookup failed');
    await connection.rollback();
    const remaining = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM JSA_RISK_MATRIX WHERE MATRIX_CODE='TEST_MIXED_5X5'`,
      {},
      options,
    );
    if (remaining.rows?.[0]?.ITEM_COUNT !== 0)
      throw new Error('Phase 2 verifier rollback did not remove test fixture');
    console.log(
      JSON.stringify({
        status: 'PASS',
        transactionRolledBack: true,
        checks: [
          'scoped active uniqueness',
          'scope hierarchy',
          'Tool Category FK',
          'dimension check',
          '25 configured mixed-code cells',
          '5/D lookup returns configured E/EXTREME',
          'duplicate cell rejection',
          'assignment overlap lookup',
        ],
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
      oracleErrorCode: (error as { code?: string }).code,
    }),
  );
  process.exitCode = 1;
});
