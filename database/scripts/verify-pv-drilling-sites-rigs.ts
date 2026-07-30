import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { pvDrillingSites } from './pv-drilling-site-rig-data.js';

function same(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${label} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const siteResult = await connection.execute<{
      SITE_ID: string;
      SITE_CODE: string;
      SITE_NAME: string;
      SEQUENCE_CODE: string;
    }>(
      `SELECT TO_CHAR(SITE_ID) SITE_ID,SITE_CODE,SITE_NAME,SEQUENCE_CODE
       FROM SYS_SITE WHERE IS_ACTIVE='Y' ORDER BY SITE_CODE`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      siteResult.rows?.map(({ SITE_CODE, SITE_NAME, SEQUENCE_CODE }) => ({
        SITE_CODE,
        SITE_NAME,
        SEQUENCE_CODE,
      })),
      [...pvDrillingSites]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((site) => ({
          SITE_CODE: site.code,
          SITE_NAME: site.name,
          SEQUENCE_CODE: site.sequenceCode,
        })),
      'Active Sites',
    );

    const rigResult = await connection.execute<{
      SITE_CODE: string;
      RIG_ID: string;
      RIG_CODE: string;
      RIG_NAME: string;
    }>(
      `SELECT S.SITE_CODE,TO_CHAR(R.RIG_ID) RIG_ID,R.RIG_CODE,R.RIG_NAME
       FROM SYS_RIG R JOIN SYS_SITE S ON S.SITE_ID=R.SITE_ID
       WHERE R.IS_ACTIVE='Y' AND S.IS_ACTIVE='Y'
       ORDER BY S.SITE_CODE,R.RIG_CODE`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      rigResult.rows?.map(({ SITE_CODE, RIG_CODE, RIG_NAME }) => ({
        SITE_CODE,
        RIG_CODE,
        RIG_NAME,
      })),
      pvDrillingSites
        .flatMap((site) =>
          site.rigs.map((rig) => ({
            SITE_CODE: site.code,
            RIG_CODE: rig.code,
            RIG_NAME: rig.name,
          })),
        )
        .sort(
          (a, b) => a.SITE_CODE.localeCompare(b.SITE_CODE) || a.RIG_CODE.localeCompare(b.RIG_CODE),
        ),
      'Active Rigs',
    );

    const offshore = siteResult.rows?.find((site) => site.SITE_CODE === 'OFFSHORE');
    const pvdI = rigResult.rows?.find(
      (rig) => rig.SITE_CODE === 'OFFSHORE' && rig.RIG_CODE === 'PVD-I',
    );
    if (!offshore || !pvdI) throw new Error('Converted Offshore/PV DRILLING I rows missing');

    const preservedResult = await connection.execute<{
      JSAS: number;
      DEPARTMENTS: number;
      MATRIX_ASSIGNMENTS: number;
      USER_SCOPES: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM JSA_MASTER
          WHERE OWNER_SITE_ID=:siteId AND RIG_ID=:rigId) JSAS,
         (SELECT COUNT(*) FROM SYS_DEPARTMENT
          WHERE SITE_ID=:siteId AND RIG_ID=:rigId) DEPARTMENTS,
         (SELECT COUNT(*) FROM JSA_RIG_MATRIX_ASSIGNMENT
          WHERE RIG_ID=:rigId) MATRIX_ASSIGNMENTS,
         (SELECT COUNT(*) FROM SYS_USER_DATA_SCOPE
          WHERE SITE_ID=:siteId) USER_SCOPES
       FROM DUAL`,
      { siteId: offshore.SITE_ID, rigId: pvdI.RIG_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    console.log(
      JSON.stringify({
        status: 'PASS',
        offshoreSiteId: offshore.SITE_ID,
        pvdIRigId: pvdI.RIG_ID,
        activeSites: siteResult.rows?.length,
        activeRigs: rigResult.rows?.length,
        preservedReferences: preservedResult.rows?.[0],
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
