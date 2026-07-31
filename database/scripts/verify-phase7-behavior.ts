import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

type Row = Record<string, any>;
const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };

async function next(connection: oracledb.Connection, sequence: string) {
  const result = await connection.execute<Row>(
    `SELECT TO_CHAR(${sequence}.NEXTVAL) ID FROM DUAL`,
    {},
    options,
  );
  if (!result.rows?.[0]?.ID) throw new Error(`Could not allocate ${sequence}`);
  return result.rows[0].ID as string;
}

async function expectOracleError(operation: () => Promise<unknown>, expectedCode: string) {
  try {
    await operation();
  } catch (error) {
    if ((error as { code?: string }).code === expectedCode) return;
    throw error;
  }
  throw new Error(`Expected ${expectedCode}`);
}

async function main() {
  loadDatabaseEnvironment();
  const siteId = process.env.LOCAL_SITE_ID?.trim();
  if (!siteId) throw new Error('LOCAL_SITE_ID is required');
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const metadata = await connection.execute<Row>(
      `SELECT
        (SELECT COUNT(*) FROM JSA_SCHEMA_VERSION WHERE MIGRATION_ID='018' AND STATUS_CODE='APPLIED') MIGRATION_COUNT,
        (SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME IN
          ('JSA_TRANSLATION','JSA_TRANSLATION_SEGMENT','JSA_TRANSLATION_ACTION')) TABLE_COUNT,
        (SELECT COUNT(*) FROM USER_SEQUENCES WHERE SEQUENCE_NAME IN
          ('SEQ_JSA_TRANSLATION','SEQ_JSA_TRANSL_SEGMENT','SEQ_JSA_TRANSL_ACTION')) SEQUENCE_COUNT,
        (SELECT COUNT(*) FROM USER_OBJECTS WHERE OBJECT_NAME IN
          ('JSA_ASSERT_TRANSL_MUTABLE','TRG_JSA_TRANSL_SEG_MUTABLE',
           'TRG_JSA_TRANSL_FINAL_IMMUT','TRG_JSA_TRANSL_ACTION_IMMUT')
          AND STATUS='VALID') GUARD_COUNT
       FROM DUAL`,
      {},
      options,
    );
    const object = metadata.rows?.[0];
    if (
      object?.MIGRATION_COUNT !== 1 ||
      object.TABLE_COUNT !== 3 ||
      object.SEQUENCE_COUNT !== 3 ||
      object.GUARD_COUNT !== 4
    )
      throw new Error('Phase 7 Oracle objects are incomplete or invalid');
    const ranges = await connection.execute<Row>(
      `SELECT COUNT(*) ITEM_COUNT FROM SYS_SITE_SEQUENCE_RANGE
       WHERE SITE_ID=:siteId AND IS_ACTIVE='Y' AND SEQUENCE_CODE IN
        ('SEQ_JSA_TRANSLATION','SEQ_JSA_TRANSL_SEGMENT','SEQ_JSA_TRANSL_ACTION')`,
      { siteId },
      options,
    );
    if (ranges.rows?.[0]?.ITEM_COUNT !== 3)
      throw new Error('Phase 7 Site sequence ranges are not configured');

    await connection.execute(`SAVEPOINT PHASE7_VERIFY`);
    const fixture = await connection.execute<Row>(
      `SELECT TO_CHAR(S.SITE_ID) SITE_ID,TO_CHAR(R.RIG_ID) RIG_ID,
        TO_CHAR(D.DEPARTMENT_ID) DEPARTMENT_ID,TO_CHAR(U.USER_ID) USER_ID,U.USERNAME,
        TO_CHAR(L.LANGUAGE_ID) LANGUAGE_ID,TO_CHAR(MV.MATRIX_VERSION_ID) MATRIX_VERSION_ID
       FROM SYS_SITE S
       JOIN SYS_RIG R ON R.SITE_ID=S.SITE_ID AND R.IS_ACTIVE='Y'
       JOIN SYS_DEPARTMENT D ON D.SITE_ID=S.SITE_ID AND D.RIG_ID=R.RIG_ID AND D.IS_ACTIVE='Y'
       CROSS JOIN (SELECT * FROM SYS_USER WHERE IS_ACTIVE='Y' FETCH FIRST 1 ROW ONLY) U
       CROSS JOIN (SELECT * FROM SYS_LANGUAGE WHERE UPPER(LANGUAGE_CODE)='EN' AND IS_ACTIVE='Y'
         FETCH FIRST 1 ROW ONLY) L
       CROSS JOIN (SELECT * FROM JSA_RISK_MATRIX_VERSION WHERE IS_ACTIVE='Y'
         FETCH FIRST 1 ROW ONLY) MV
       WHERE S.SITE_ID=:siteId AND S.IS_ACTIVE='Y' FETCH FIRST 1 ROW ONLY`,
      { siteId },
      options,
    );
    const base = fixture.rows?.[0];
    if (!base)
      throw new Error(
        'Phase 7 verifier requires governed local organization, user, English, and Matrix configuration',
      );
    let targetLanguageId = (
      await connection.execute<Row>(
        `SELECT TO_CHAR(LANGUAGE_ID) ID FROM SYS_LANGUAGE
         WHERE IS_ACTIVE='Y' AND UPPER(LANGUAGE_CODE)<>'EN' FETCH FIRST 1 ROW ONLY`,
        {},
        options,
      )
    ).rows?.[0]?.ID;
    if (!targetLanguageId) {
      targetLanguageId = await next(connection, 'SEQ_SYS_LANGUAGE');
      await connection.execute(
        `INSERT INTO SYS_LANGUAGE(
          LANGUAGE_ID,LANGUAGE_CODE,LANGUAGE_NAME,DISPLAY_ORDER,SCOPE_TYPE,CREATED_BY,UPDATED_BY)
         VALUES(:id,:code,'Phase 7 verifier language',9999,'GLOBAL','phase7-verifier','phase7-verifier')`,
        { id: targetLanguageId, code: `Z7${Date.now().toString().slice(-8)}` },
      );
    }
    const jsaId = await next(connection, 'SEQ_JSA_MASTER');
    const versionId = await next(connection, 'SEQ_JSA_VERSION');
    const translationId = await next(connection, 'SEQ_JSA_TRANSLATION');
    const segmentId = await next(connection, 'SEQ_JSA_TRANSL_SEGMENT');
    const actionId = await next(connection, 'SEQ_JSA_TRANSL_ACTION');
    await connection.execute(
      `INSERT INTO JSA_MASTER(
        JSA_ID,JSA_NUMBER,NUMBER_SCOPE_KEY,OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,
        ORIGIN_SITE_ID,CREATED_SITE_ID,UPDATED_SITE_ID,CREATOR_USER_ID,
        LIFECYCLE_STATUS,CREATED_BY,UPDATED_BY)
       VALUES(:jsaId,:jsaNumber,:scopeKey,:siteId,:rigId,:departmentId,:siteId,:siteId,
        :siteId,:userId,'DRAFT','phase7-verifier','phase7-verifier')`,
      {
        jsaId,
        jsaNumber: `P7-${Date.now()}`,
        scopeKey: `P7-${jsaId}`,
        siteId: base.SITE_ID,
        rigId: base.RIG_ID,
        departmentId: base.DEPARTMENT_ID,
        userId: base.USER_ID,
      },
    );
    await connection.execute(
      `INSERT INTO JSA_VERSION(
        JSA_VERSION_ID,JSA_ID,VERSION_NUMBER,VERSION_STATUS,OWNER_SITE_ID,RIG_ID,
        DEPARTMENT_ID,MATRIX_VERSION_ID,LANGUAGE_ID,JOB_TITLE,CREATED_BY,UPDATED_BY,
        PUBLISHED_AT,PUBLISHED_BY_USER_ID,PUBLISHED_BY_USERNAME)
       VALUES(:versionId,:jsaId,1,'PUBLISHED',:siteId,:rigId,:departmentId,:matrixId,
        :languageId,'Phase 7 verifier source','phase7-verifier','phase7-verifier',
        SYSTIMESTAMP,:userId,:username)`,
      {
        versionId,
        jsaId,
        siteId: base.SITE_ID,
        rigId: base.RIG_ID,
        departmentId: base.DEPARTMENT_ID,
        matrixId: base.MATRIX_VERSION_ID,
        languageId: base.LANGUAGE_ID,
        userId: base.USER_ID,
        username: base.USERNAME,
      },
    );
    await connection.execute(
      `UPDATE JSA_MASTER SET CURRENT_VERSION_ID=:versionId,LIFECYCLE_STATUS='PUBLISHED'
       WHERE JSA_ID=:jsaId`,
      { versionId, jsaId },
    );
    await connection.execute(
      `INSERT INTO JSA_TRANSLATION(
        TRANSLATION_ID,JSA_ID,SOURCE_JSA_VERSION_ID,SOURCE_LANGUAGE_ID,TARGET_LANGUAGE_ID,
        OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,TRANSLATOR_USER_ID,TRANSLATOR_USERNAME,
        TRANSLATOR_DISPLAY_NAME,CURRENT_ASSIGNEE_USER_ID,ASSIGNED_BY_USER_ID,
        ASSIGNED_BY_USERNAME,ASSIGNED_BY_DISPLAY_NAME,SOURCE_CONTENT_HASH,
        CREATED_SITE_ID,UPDATED_SITE_ID,CREATED_BY,UPDATED_BY)
       VALUES(:translationId,:jsaId,:versionId,:sourceLanguageId,:targetLanguageId,
        :siteId,:rigId,:departmentId,:userId,:username,:username,:userId,:userId,
        :username,:username,:hash,:siteId,:siteId,'phase7-verifier','phase7-verifier')`,
      {
        translationId,
        jsaId,
        versionId,
        sourceLanguageId: base.LANGUAGE_ID,
        targetLanguageId,
        siteId: base.SITE_ID,
        rigId: base.RIG_ID,
        departmentId: base.DEPARTMENT_ID,
        userId: base.USER_ID,
        username: base.USERNAME,
        hash: 'A'.repeat(64),
      },
    );
    await connection.execute(
      `INSERT INTO JSA_TRANSLATION_SEGMENT(
        TRANSLATION_SEGMENT_ID,TRANSLATION_ID,ENTITY_TYPE,SOURCE_ENTITY_ID,
        SOURCE_LOGICAL_KEY,FIELD_CODE,SECTION_CODE,DISPLAY_ORDER,REQUIRED_FLAG,
        SOURCE_TEXT,SOURCE_TEXT_HASH,CREATED_BY,UPDATED_BY)
       VALUES(:segmentId,:translationId,'HEADER',:versionId,:versionId,'JOB_TITLE',
        'GENERAL',1,'Y','Phase 7 verifier source',:hash,'phase7-verifier','phase7-verifier')`,
      { segmentId, translationId, versionId, hash: 'B'.repeat(64) },
    );
    await connection.execute(
      `UPDATE JSA_TRANSLATION SET INVENTORY_LOCKED_FLAG='Y' WHERE TRANSLATION_ID=:translationId`,
      { translationId },
    );
    await expectOracleError(
      () =>
        connection.execute(
          `DELETE FROM JSA_TRANSLATION_SEGMENT WHERE TRANSLATION_SEGMENT_ID=:segmentId`,
          { segmentId },
        ),
      'ORA-20072',
    );
    await connection.execute(
      `UPDATE JSA_TRANSLATION_SEGMENT SET TRANSLATED_TEXT='Bản dịch',
        ROW_VERSION=ROW_VERSION+1 WHERE TRANSLATION_SEGMENT_ID=:segmentId`,
      { segmentId },
    );
    await connection.execute(
      `UPDATE JSA_TRANSLATION SET TRANSLATION_STATUS='PUBLISHED',
        CURRENT_ASSIGNEE_USER_ID=NULL,PUBLISHED_AT=SYSTIMESTAMP,
        PUBLISHED_BY_USER_ID=:userId,PUBLISHED_BY_USERNAME=:username
       WHERE TRANSLATION_ID=:translationId`,
      { userId: base.USER_ID, username: base.USERNAME, translationId },
    );
    await expectOracleError(
      () =>
        connection.execute(
          `UPDATE JSA_TRANSLATION_SEGMENT SET TRANSLATED_TEXT='changed'
           WHERE TRANSLATION_SEGMENT_ID=:segmentId`,
          { segmentId },
        ),
      'ORA-20071',
    );
    await connection.execute(
      `INSERT INTO JSA_TRANSLATION_ACTION(
        TRANSLATION_ACTION_ID,TRANSLATION_ID,ACTION_CODE,ACTOR_USER_ID,
        ACTOR_USERNAME,ACTOR_DISPLAY_NAME,FROM_STATUS,TO_STATUS,CYCLE_NUMBER,CORRELATION_ID)
       VALUES(:actionId,:translationId,'PUBLISH',:userId,:username,:username,
        'STC_REVIEW','PUBLISHED',1,'phase7-verifier')`,
      { actionId, translationId, userId: base.USER_ID, username: base.USERNAME },
    );
    await expectOracleError(
      () =>
        connection.execute(
          `DELETE FROM JSA_TRANSLATION_ACTION WHERE TRANSLATION_ACTION_ID=:actionId`,
          { actionId },
        ),
      'ORA-20077',
    );
    await connection.execute(`ROLLBACK TO PHASE7_VERIFY`);
    console.log(
      JSON.stringify({
        status: 'PASS',
        migration: '018',
        metadata: { tables: 3, sequences: 3, guards: 4 },
        behavior: {
          segmentInventoryImmutable: true,
          publishedContentImmutable: true,
          actionAppendOnly: true,
          fixtureRolledBack: true,
        },
      }),
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original verifier failure when rollback also fails.
    }
    throw error;
  } finally {
    await connection.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
