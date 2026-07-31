import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

loadDatabaseEnvironment();
type Row = Record<string, any>;
const output = { outFormat: oracledb.OUT_FORMAT_OBJECT };

async function main() {
  const connection = await oracledb.getConnection(connectionConfig());
  let fixtureMode = 'EXISTING_PUBLISHED';
  try {
    const metadata = await connection.execute<Row>(
      `SELECT
        (SELECT COUNT(*) FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='016' AND STATUS_CODE='APPLIED') MIGRATION_COUNT,
        (SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME='JSA_USER_FAVORITE') TABLE_COUNT,
        (SELECT COUNT(*) FROM USER_SEQUENCES WHERE SEQUENCE_NAME='SEQ_JSA_USER_FAVORITE') SEQUENCE_COUNT,
        (SELECT COUNT(*) FROM USER_INDEXES WHERE INDEX_NAME IN
          ('IX_JSA_FAVORITE_USER_ACTIVE','IX_JSA_FAVORITE_MASTER_ACTIVE',
           'IX_JSA_VERSION_BROWSE_STATE','IX_JSA_VERSION_BROWSE_ACTORS')) INDEX_COUNT
       FROM DUAL`,
      {},
      output,
    );
    const state = metadata.rows?.[0];
    if (
      state?.MIGRATION_COUNT !== 1 ||
      state?.TABLE_COUNT !== 1 ||
      state?.SEQUENCE_COUNT !== 1 ||
      state?.INDEX_COUNT !== 4
    )
      throw new Error('Phase 6 metadata verification failed');

    let target = await connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID,TO_CHAR(M.CREATOR_USER_ID) USER_ID,
              U.USERNAME,TO_CHAR(M.OWNER_SITE_ID) SITE_ID
         FROM JSA_MASTER M
         JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.CURRENT_VERSION_ID
         JOIN SYS_USER U ON U.USER_ID=M.CREATOR_USER_ID
        WHERE M.LIFECYCLE_STATUS='PUBLISHED' AND V.VERSION_STATUS='PUBLISHED'
          AND EXISTS(SELECT 1 FROM SYS_USER_DATA_SCOPE DS
            WHERE DS.USER_ID=U.USER_ID AND DS.IS_ACTIVE='Y' AND DS.CAN_VIEW='Y'
              AND DS.SITE_ID=M.OWNER_SITE_ID
              AND (DS.SCOPE_TYPE='SITE'
                OR (DS.SCOPE_TYPE='RIG' AND DS.RIG_ID=M.RIG_ID)
                OR (DS.SCOPE_TYPE='DEPARTMENT' AND DS.DEPARTMENT_ID=M.DEPARTMENT_ID)))
        FETCH FIRST 1 ROW ONLY`,
      {},
      output,
    );

    if (!target.rows?.[0]) {
      fixtureMode = 'ROLLED_BACK_DRAFT_PROMOTION';
      const draft = await connection.execute<Row>(
        `SELECT TO_CHAR(M.JSA_ID) JSA_ID,TO_CHAR(M.WORKING_VERSION_ID) VERSION_ID,
                TO_CHAR(M.CREATOR_USER_ID) USER_ID,U.USERNAME,TO_CHAR(M.OWNER_SITE_ID) SITE_ID
           FROM JSA_MASTER M
           JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.WORKING_VERSION_ID
           JOIN SYS_USER U ON U.USER_ID=M.CREATOR_USER_ID
          WHERE M.CURRENT_VERSION_ID IS NULL
            AND V.VERSION_STATUS IN ('DRAFT','RETURNED','REJECTED')
            AND EXISTS(SELECT 1 FROM SYS_USER_DATA_SCOPE DS
              WHERE DS.USER_ID=U.USER_ID AND DS.IS_ACTIVE='Y' AND DS.CAN_VIEW='Y'
                AND DS.SITE_ID=M.OWNER_SITE_ID)
          FETCH FIRST 1 ROW ONLY FOR UPDATE`,
        {},
        output,
      );
      const row = draft.rows?.[0];
      if (!row) throw new Error('No safely rollbackable JSA fixture is available');
      await connection.execute(
        `UPDATE JSA_VERSION SET VERSION_STATUS='PUBLISHED',PUBLISHED_AT=SYSTIMESTAMP,
          PUBLISHED_BY_USER_ID=:userId,PUBLISHED_BY_USERNAME=:username
          WHERE JSA_VERSION_ID=:versionId`,
        { userId: row.USER_ID, username: row.USERNAME, versionId: row.VERSION_ID },
      );
      await connection.execute(
        `UPDATE JSA_MASTER SET CURRENT_VERSION_ID=:versionId,WORKING_VERSION_ID=NULL,
          LIFECYCLE_STATUS='PUBLISHED',CHECKED_OUT_BY_USER_ID=NULL,CHECKED_OUT_BY_USERNAME=NULL,
          CHECKED_OUT_BY_DISPLAY_NAME=NULL,CHECKED_OUT_AT=NULL
          WHERE JSA_ID=:jsaId`,
        { versionId: row.VERSION_ID, jsaId: row.JSA_ID },
      );
      target = { rows: [row] } as any;
    }

    const row = target.rows![0]!;
    await connection.execute(
      `DELETE FROM JSA_USER_FAVORITE WHERE USER_ID=:userId AND JSA_ID=:jsaId`,
      { userId: row.USER_ID, jsaId: row.JSA_ID },
    );
    await connection.execute(
      `INSERT INTO JSA_USER_FAVORITE
       (FAVORITE_ID,USER_ID,JSA_ID,IS_ACTIVE,FAVORITED_AT,CREATED_SITE_ID,UPDATED_SITE_ID,
        CREATED_BY,UPDATED_BY)
       VALUES(SEQ_JSA_USER_FAVORITE.NEXTVAL,:userId,:jsaId,'Y',SYSTIMESTAMP,:siteId,:siteId,
              'PHASE6_VERIFY','PHASE6_VERIFY')`,
      { userId: row.USER_ID, jsaId: row.JSA_ID, siteId: row.SITE_ID },
    );
    let duplicateRejected = false;
    try {
      await connection.execute(
        `INSERT INTO JSA_USER_FAVORITE
         (FAVORITE_ID,USER_ID,JSA_ID,IS_ACTIVE,FAVORITED_AT,CREATED_SITE_ID,UPDATED_SITE_ID,
          CREATED_BY,UPDATED_BY)
         VALUES(SEQ_JSA_USER_FAVORITE.NEXTVAL,:userId,:jsaId,'Y',SYSTIMESTAMP,:siteId,:siteId,
                'PHASE6_VERIFY','PHASE6_VERIFY')`,
        { userId: row.USER_ID, jsaId: row.JSA_ID, siteId: row.SITE_ID },
      );
    } catch (error) {
      duplicateRejected = (error as { errorNum?: number }).errorNum === 1;
    }
    if (!duplicateRejected) throw new Error('Favorite pair uniqueness was not enforced');

    const escapedPattern = '%\\%\\_%';
    const search = await connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID
         FROM JSA_MASTER M
         JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.CURRENT_VERSION_ID
        WHERE M.LIFECYCLE_STATUS='PUBLISHED' AND V.VERSION_STATUS='PUBLISHED'
          AND EXISTS(SELECT 1 FROM SYS_USER_DATA_SCOPE DS
            WHERE DS.USER_ID=:userId AND DS.IS_ACTIVE='Y' AND DS.CAN_VIEW='Y'
              AND DS.SITE_ID=M.OWNER_SITE_ID)
          AND (UPPER(M.JSA_NUMBER) LIKE :pattern ESCAPE '\\'
            OR UPPER(V.JOB_TITLE) LIKE :pattern ESCAPE '\\')
        ORDER BY V.UPDATED_AT DESC,M.JSA_ID DESC
        OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
      { userId: row.USER_ID, pattern: escapedPattern, offset: 0, pageSize: 25 },
      output,
    );

    await connection.execute(
      `EXPLAIN PLAN SET STATEMENT_ID='JSAMS_PHASE6'
       FOR SELECT M.JSA_ID FROM JSA_MASTER M
       JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.CURRENT_VERSION_ID
       WHERE M.LIFECYCLE_STATUS='PUBLISHED' AND V.VERSION_STATUS='PUBLISHED'
       ORDER BY V.UPDATED_AT DESC,M.JSA_ID DESC`,
    );
    const plan = await connection.execute<{ PLAN_TABLE_OUTPUT: string }>(
      `SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY(NULL,'JSAMS_PHASE6','BASIC'))`,
      {},
      output,
    );
    await connection.execute(
      `EXPLAIN PLAN SET STATEMENT_ID='JSAMS_PHASE6_FAV'
       FOR SELECT F.JSA_ID FROM JSA_USER_FAVORITE F
       WHERE F.USER_ID=1 AND F.IS_ACTIVE='Y'
       ORDER BY F.UPDATED_AT DESC,F.JSA_ID DESC`,
    );
    const favoritePlan = await connection.execute<{ PLAN_TABLE_OUTPUT: string }>(
      `SELECT PLAN_TABLE_OUTPUT
         FROM TABLE(DBMS_XPLAN.DISPLAY(NULL,'JSAMS_PHASE6_FAV','BASIC'))`,
      {},
      output,
    );
    console.log(
      JSON.stringify({
        status: 'PASS',
        fixtureMode,
        duplicateFavoriteRejected: duplicateRejected,
        escapedWildcardSearchRows: search.rows?.length ?? 0,
        queryPlan: (plan.rows ?? []).map((item) => item.PLAN_TABLE_OUTPUT),
        favoriteQueryPlan: (favoritePlan.rows ?? []).map((item) => item.PLAN_TABLE_OUTPUT),
        cleanup: 'ROLLBACK',
      }),
    );
  } finally {
    await connection.rollback();
    await connection.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
