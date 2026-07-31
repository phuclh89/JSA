import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

loadDatabaseEnvironment();
type Row = Record<string, any>;
const output = { outFormat: oracledb.OUT_FORMAT_OBJECT };

async function main() {
  const connection = await oracledb.getConnection(connectionConfig());
  let fixtureMode = 'PUBLISHED_SOURCE_EXISTING_DESTINATION_ROLLED_BACK';
  try {
    const metadata = await connection.execute<Row>(
      `SELECT
        (SELECT COUNT(*) FROM JSA_SCHEMA_VERSION
          WHERE MIGRATION_ID='017' AND STATUS_CODE='APPLIED') MIGRATION_COUNT,
        (SELECT COUNT(*) FROM USER_TABLES
          WHERE TABLE_NAME='JSA_COPY_PROVENANCE') TABLE_COUNT,
        (SELECT COUNT(*) FROM USER_SEQUENCES
          WHERE SEQUENCE_NAME='SEQ_JSA_COPY_PROVENANCE') SEQUENCE_COUNT,
        (SELECT COUNT(*) FROM USER_TRIGGERS
          WHERE TRIGGER_NAME='TRG_JSA_COPY_PROV_IMMUTABLE' AND STATUS='ENABLED') TRIGGER_COUNT,
        (SELECT COUNT(*) FROM USER_CONSTRAINTS
          WHERE TABLE_NAME='JSA_COPY_PROVENANCE' AND STATUS='ENABLED') CONSTRAINT_COUNT,
        (SELECT COUNT(*) FROM SYS_SITE_SEQUENCE_RANGE
          WHERE SEQUENCE_CODE='SEQ_JSA_COPY_PROVENANCE' AND IS_ACTIVE='Y') RANGE_COUNT
       FROM DUAL`,
      {},
      output,
    );
    const state = metadata.rows?.[0];
    if (
      state?.MIGRATION_COUNT !== 1 ||
      state?.TABLE_COUNT !== 1 ||
      state?.SEQUENCE_COUNT !== 1 ||
      state?.TRIGGER_COUNT !== 1 ||
      state?.CONSTRAINT_COUNT < 12 ||
      state?.RANGE_COUNT !== 1
    )
      throw new Error('Phase 6C metadata or Site sequence-range verification failed');

    const sourceFixture = await connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID,TO_CHAR(V.JSA_VERSION_ID) VERSION_ID,
              TO_CHAR(M.OWNER_SITE_ID) SITE_ID,TO_CHAR(M.RIG_ID) RIG_ID,
              TO_CHAR(M.CREATOR_USER_ID) USER_ID,U.USERNAME,U.DISPLAY_NAME
         FROM JSA_MASTER M
         JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.CURRENT_VERSION_ID
         JOIN SYS_USER U ON U.USER_ID=M.CREATOR_USER_ID
        WHERE M.LIFECYCLE_STATUS='PUBLISHED' AND V.VERSION_STATUS='PUBLISHED'
        FETCH FIRST 1 ROW ONLY`,
      {},
      output,
    );
    let source = sourceFixture.rows?.[0];
    if (!source) {
      fixtureMode = 'ROLLED_BACK_DRAFT_PROMOTION_AND_EXISTING_DESTINATION';
      const draft = await connection.execute<Row>(
        `SELECT TO_CHAR(M.JSA_ID) JSA_ID,TO_CHAR(V.JSA_VERSION_ID) VERSION_ID,
                TO_CHAR(M.OWNER_SITE_ID) SITE_ID,TO_CHAR(M.RIG_ID) RIG_ID,
                TO_CHAR(M.CREATOR_USER_ID) USER_ID,U.USERNAME,U.DISPLAY_NAME
           FROM JSA_MASTER M
           JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.WORKING_VERSION_ID
           JOIN SYS_USER U ON U.USER_ID=M.CREATOR_USER_ID
          WHERE M.CURRENT_VERSION_ID IS NULL
            AND V.VERSION_STATUS IN ('DRAFT','RETURNED','REJECTED')
          FETCH FIRST 1 ROW ONLY FOR UPDATE`,
        {},
        output,
      );
      source = draft.rows?.[0];
      if (!source) throw new Error('No safely rollbackable source JSA fixture is available');
      await connection.execute(
        `UPDATE JSA_VERSION SET VERSION_STATUS='PUBLISHED',PUBLISHED_AT=SYSTIMESTAMP,
          PUBLISHED_BY_USER_ID=:userId,PUBLISHED_BY_USERNAME=:username
          WHERE JSA_VERSION_ID=:versionId`,
        { userId: source.USER_ID, username: source.USERNAME, versionId: source.VERSION_ID },
      );
      await connection.execute(
        `UPDATE JSA_MASTER SET CURRENT_VERSION_ID=:versionId,WORKING_VERSION_ID=NULL,
          LIFECYCLE_STATUS='PUBLISHED',CHECKED_OUT_BY_USER_ID=NULL,
          CHECKED_OUT_BY_USERNAME=NULL,CHECKED_OUT_BY_DISPLAY_NAME=NULL,CHECKED_OUT_AT=NULL
          WHERE JSA_ID=:jsaId`,
        { versionId: source.VERSION_ID, jsaId: source.JSA_ID },
      );
    }
    const destinationFixture = await connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID,TO_CHAR(V.JSA_VERSION_ID) VERSION_ID,
              TO_CHAR(M.OWNER_SITE_ID) SITE_ID,TO_CHAR(M.RIG_ID) RIG_ID
         FROM JSA_MASTER M
         JOIN JSA_VERSION V ON V.JSA_ID=M.JSA_ID
        WHERE M.JSA_ID<>:sourceJsaId
        ORDER BY M.JSA_ID,V.VERSION_NUMBER
        FETCH FIRST 1 ROW ONLY`,
      { sourceJsaId: source.JSA_ID },
      output,
    );
    const destination = destinationFixture.rows?.[0];
    if (!destination)
      throw new Error('A second JSA is required for the rolled-back Phase 6C fixture');

    const key = `phase6c-verify-${Date.now()}`;
    const hash = 'a'.repeat(64);
    await connection.execute(
      `INSERT INTO JSA_COPY_PROVENANCE(
        COPY_PROVENANCE_ID,DESTINATION_JSA_ID,DESTINATION_VERSION_ID,
        SOURCE_JSA_ID,SOURCE_VERSION_ID,SOURCE_SITE_ID,SOURCE_RIG_ID,
        COPY_REASON,COPIED_BY_USER_ID,COPIED_BY_USERNAME,COPIED_BY_DISPLAY_NAME,
        CREATED_SITE_ID,REQUEST_KEY,REQUEST_HASH,CREATED_BY)
       VALUES(SEQ_JSA_COPY_PROVENANCE.NEXTVAL,:destinationJsaId,:destinationVersionId,
        :sourceJsaId,:sourceVersionId,:sourceSiteId,:sourceRigId,
        'Phase 6C rolled-back verifier',:userId,:username,:displayName,
        :createdSiteId,:requestKey,:requestHash,'PHASE6C_VERIFY')`,
      {
        destinationJsaId: destination.JSA_ID,
        destinationVersionId: destination.VERSION_ID,
        sourceJsaId: source.JSA_ID,
        sourceVersionId: source.VERSION_ID,
        sourceSiteId: source.SITE_ID,
        sourceRigId: source.RIG_ID,
        userId: source.USER_ID,
        username: source.USERNAME,
        displayName: source.DISPLAY_NAME,
        createdSiteId: destination.SITE_ID,
        requestKey: key,
        requestHash: hash,
      },
    );

    let immutableUpdateRejected = false;
    try {
      await connection.execute(
        `UPDATE JSA_COPY_PROVENANCE SET COPY_REASON='mutated'
          WHERE DESTINATION_JSA_ID=:destinationJsaId`,
        { destinationJsaId: destination.JSA_ID },
      );
    } catch (error) {
      immutableUpdateRejected = (error as { errorNum?: number }).errorNum === 20071;
    }
    if (!immutableUpdateRejected) throw new Error('Immutable provenance update was not rejected');

    let duplicateRequestRejected = false;
    try {
      await connection.execute(
        `INSERT INTO JSA_COPY_PROVENANCE(
          COPY_PROVENANCE_ID,DESTINATION_JSA_ID,DESTINATION_VERSION_ID,
          SOURCE_JSA_ID,SOURCE_VERSION_ID,SOURCE_SITE_ID,SOURCE_RIG_ID,
          COPY_REASON,COPIED_BY_USER_ID,COPIED_BY_USERNAME,
          CREATED_SITE_ID,REQUEST_KEY,REQUEST_HASH,CREATED_BY)
         VALUES(SEQ_JSA_COPY_PROVENANCE.NEXTVAL,:sourceJsaId,:sourceVersionId,
          :destinationJsaId,:destinationVersionId,:destinationSiteId,:destinationRigId,
          'duplicate request',:userId,:username,:sourceSiteId,:requestKey,:requestHash,
          'PHASE6C_VERIFY')`,
        {
          sourceJsaId: source.JSA_ID,
          sourceVersionId: source.VERSION_ID,
          destinationJsaId: destination.JSA_ID,
          destinationVersionId: destination.VERSION_ID,
          destinationSiteId: destination.SITE_ID,
          destinationRigId: destination.RIG_ID,
          userId: source.USER_ID,
          username: source.USERNAME,
          sourceSiteId: source.SITE_ID,
          requestKey: key,
          requestHash: hash,
        },
      );
    } catch (error) {
      duplicateRequestRejected = (error as { errorNum?: number }).errorNum === 1;
    }
    if (!duplicateRequestRejected)
      throw new Error('Actor plus Idempotency-Key uniqueness was not enforced');

    console.log(
      JSON.stringify({
        status: 'PASS',
        fixtureMode,
        exactDestinationVersionPersisted: true,
        immutableUpdateRejected,
        duplicateRequestRejected,
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
