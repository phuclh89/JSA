import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

loadDatabaseEnvironment();

const options = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;
const username = (process.env.SEED_UAT_TRANSLATION_USERNAME ?? 'phuclh').trim();
const siteId = process.env.LOCAL_SITE_ID?.trim();
const permissionCodes = [
  'DEV_JSA_TRANSLATION_VIEW',
  'DEV_JSA_TRANSLATION_ASSIGN',
  'DEV_JSA_TRANSLATE',
  'DEV_JSA_TRANSLATION_APPROVE',
  'DEV_JSA_TRANSLATION_PRINT',
] as const;

interface SummaryRow {
  EFFECTIVE_PERMISSIONS: number;
  WORKFLOW_ROLES: number;
  SITE_SCOPES: number;
  AUDIT_EVENTS: number;
}

async function verify(): Promise<void> {
  if (!siteId) throw new Error('LOCAL_SITE_ID is required');
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const result = await connection.execute<SummaryRow>(
      `SELECT
         (SELECT COUNT(DISTINCT P.PERMISSION_CODE)
          FROM SYS_USER U
          JOIN SYS_USER_ROLE UR ON UR.USER_ID=U.USER_ID AND UR.IS_ACTIVE='Y'
          JOIN SYS_ROLE R ON R.ROLE_ID=UR.ROLE_ID AND R.IS_ACTIVE='Y'
          JOIN SYS_ROLE_PERMISSION RP ON RP.ROLE_ID=R.ROLE_ID AND RP.IS_ACTIVE='Y'
          JOIN SYS_PERMISSION P ON P.PERMISSION_ID=RP.PERMISSION_ID AND P.IS_ACTIVE='Y'
          WHERE UPPER(U.USERNAME)=UPPER(:username)
            AND P.PERMISSION_CODE IN
             ('DEV_JSA_TRANSLATION_VIEW','DEV_JSA_TRANSLATION_ASSIGN',
              'DEV_JSA_TRANSLATE','DEV_JSA_TRANSLATION_APPROVE',
              'DEV_JSA_TRANSLATION_PRINT')) EFFECTIVE_PERMISSIONS,
         (SELECT COUNT(DISTINCT A.WORKFLOW_ROLE_CODE)
          FROM JSA_WF_ROLE_ASSIGNMENT A
          JOIN SYS_USER U ON U.USER_ID=A.USER_ID AND U.IS_ACTIVE='Y'
          WHERE UPPER(U.USERNAME)=UPPER(:username) AND A.SITE_ID=:siteId
            AND A.WORKFLOW_ROLE_CODE IN ('OIM','TRANSLATOR','STC')
            AND A.RIG_ID IS NULL AND A.DEPARTMENT_ID IS NULL
            AND A.IS_ACTIVE='Y' AND A.EFFECTIVE_FROM<=SYSTIMESTAMP
            AND (A.EFFECTIVE_TO IS NULL OR A.EFFECTIVE_TO>SYSTIMESTAMP))
           WORKFLOW_ROLES,
         (SELECT COUNT(*) FROM SYS_USER_DATA_SCOPE DS
          JOIN SYS_USER U ON U.USER_ID=DS.USER_ID
          WHERE UPPER(U.USERNAME)=UPPER(:username) AND DS.SITE_ID=:siteId
            AND DS.SCOPE_TYPE='SITE' AND DS.CAN_VIEW='Y' AND DS.CAN_ACT='Y'
            AND DS.IS_ACTIVE='Y' AND DS.EFFECTIVE_FROM<=SYSTIMESTAMP
            AND (DS.EFFECTIVE_TO IS NULL OR DS.EFFECTIVE_TO>SYSTIMESTAMP))
           SITE_SCOPES,
         (SELECT COUNT(*) FROM SYS_ACCESS_ADMIN_AUDIT
          WHERE ACTION_CODE='UAT_TRANSLATION_ACCESS_SEEDED'
            AND UPPER(TARGET_USERNAME_SNAPSHOT)=UPPER(:username)) AUDIT_EVENTS
       FROM DUAL`,
      { username, siteId },
      options,
    );
    const summary = result.rows?.[0];
    if (
      !summary ||
      summary.EFFECTIVE_PERMISSIONS !== permissionCodes.length ||
      summary.WORKFLOW_ROLES !== 3 ||
      summary.SITE_SCOPES !== 1 ||
      summary.AUDIT_EVENTS < 1
    )
      throw new Error('UAT Translation access is incomplete or ambiguous');

    console.log(JSON.stringify({ status: 'PASS', username, siteId, ...summary }));
  } finally {
    await connection.close();
  }
}

verify().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
