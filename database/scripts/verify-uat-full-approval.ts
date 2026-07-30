import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

loadDatabaseEnvironment();

const options = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;
const username = (process.env.SEED_UAT_APPROVER_USERNAME ?? 'phuclh').trim();
const siteId = process.env.LOCAL_SITE_ID?.trim();

interface SummaryRow {
  ACTIVE_PERMISSIONS: number;
  ADMIN_GRANTS: number;
  ACTIVE_STEPS: number;
  ACTIVE_BINDINGS: number;
  WORKFLOW_ROLES: number;
  AUDIT_EVENTS: number;
}

async function verify(): Promise<void> {
  if (!siteId) throw new Error('LOCAL_SITE_ID is required');
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const result = await connection.execute<SummaryRow>(
      `SELECT
         (SELECT COUNT(*) FROM SYS_PERMISSION WHERE IS_ACTIVE='Y') ACTIVE_PERMISSIONS,
         (SELECT COUNT(*) FROM SYS_ROLE_PERMISSION RP
          JOIN SYS_ROLE R ON R.ROLE_ID=RP.ROLE_ID
          WHERE R.ROLE_CODE='SYSTEM_ADMIN' AND R.IS_ACTIVE='Y' AND RP.IS_ACTIVE='Y')
           ADMIN_GRANTS,
         (SELECT COUNT(*) FROM JSA_WORKFLOW_STEP S
          JOIN JSA_WORKFLOW_DEFINITION D ON D.DEFINITION_ID=S.DEFINITION_ID
          WHERE D.DEFINITION_CODE='UAT_FULL_APPROVAL' AND D.STATUS_CODE='ACTIVE'
            AND S.IS_ACTIVE='Y') ACTIVE_STEPS,
         (SELECT COUNT(*) FROM JSA_WORKFLOW_BINDING B
          JOIN JSA_WORKFLOW_DEFINITION D ON D.DEFINITION_ID=B.DEFINITION_ID
          WHERE D.DEFINITION_CODE='UAT_FULL_APPROVAL' AND B.SITE_ID=:siteId
            AND B.IS_ACTIVE='Y' AND B.EFFECTIVE_FROM<=SYSTIMESTAMP
            AND (B.EFFECTIVE_TO IS NULL OR B.EFFECTIVE_TO>=SYSTIMESTAMP))
           ACTIVE_BINDINGS,
         (SELECT COUNT(*) FROM JSA_WF_ROLE_ASSIGNMENT A
          JOIN SYS_USER U ON U.USER_ID=A.USER_ID
          WHERE UPPER(U.USERNAME)=UPPER(:username) AND A.SITE_ID=:siteId
            AND A.IS_ACTIVE='Y' AND A.EFFECTIVE_FROM<=SYSTIMESTAMP
            AND (A.EFFECTIVE_TO IS NULL OR A.EFFECTIVE_TO>=SYSTIMESTAMP))
           WORKFLOW_ROLES,
         (SELECT COUNT(*) FROM SYS_ACCESS_ADMIN_AUDIT
          WHERE ACTION_CODE='UAT_FULL_APPROVAL_SEEDED'
            AND UPPER(TARGET_USERNAME_SNAPSHOT)=UPPER(:username)) AUDIT_EVENTS
       FROM DUAL`,
      { siteId, username },
      options,
    );
    const summary = result.rows?.[0];
    if (!summary) throw new Error('UAT workflow verification returned no summary');
    const valid =
      summary.ACTIVE_PERMISSIONS === summary.ADMIN_GRANTS &&
      summary.ACTIVE_STEPS === 4 &&
      summary.ACTIVE_BINDINGS === 1 &&
      summary.WORKFLOW_ROLES === 4 &&
      summary.AUDIT_EVENTS >= 1;
    if (!valid) throw new Error('UAT full-approval configuration is incomplete or ambiguous');
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
