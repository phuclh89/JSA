import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { pvDrillingPositions, pvDrillingPositionScope } from './pv-drilling-position-data.js';

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const binds = Object.fromEntries(
      pvDrillingPositions.map((position, index) => [`code${index}`, position.code]),
    );
    const placeholders = pvDrillingPositions.map((_, index) => `:code${index}`).join(',');
    const result = await connection.execute<{
      POSITION_CODE: string;
      POSITION_NAME: string;
      DISPLAY_ORDER: number;
      SCOPE_TYPE: string;
      SITE_ID?: string;
      RIG_ID?: string;
      DEPARTMENT_ID?: string;
    }>(
      `SELECT POSITION_CODE,POSITION_NAME,DISPLAY_ORDER,SCOPE_TYPE,
              TO_CHAR(SITE_ID) SITE_ID,TO_CHAR(RIG_ID) RIG_ID,
              TO_CHAR(DEPARTMENT_ID) DEPARTMENT_ID
       FROM SYS_POSITION
       WHERE IS_ACTIVE='Y' AND POSITION_CODE IN (${placeholders})
       ORDER BY DISPLAY_ORDER,POSITION_CODE`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const actual = result.rows ?? [];
    const expected = pvDrillingPositions.map((position, index) => ({
      POSITION_CODE: position.code,
      POSITION_NAME: position.name,
      DISPLAY_ORDER: index + 1,
      SCOPE_TYPE: pvDrillingPositionScope,
      SITE_ID: null,
      RIG_ID: null,
      DEPARTMENT_ID: null,
    }));
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('Global Position catalogue does not match the confirmed list');

    console.log(
      JSON.stringify({
        status: 'PASS',
        scopeType: pvDrillingPositionScope,
        globalPositions: actual.length,
        firstPosition: actual[0]?.POSITION_NAME,
        lastPosition: actual.at(-1)?.POSITION_NAME,
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
