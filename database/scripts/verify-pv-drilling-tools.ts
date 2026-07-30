import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import {
  pvDrillingToolCategory,
  pvDrillingTools,
  pvDrillingToolScope,
} from './pv-drilling-tool-data.js';

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const binds = Object.fromEntries(
      pvDrillingTools.map((tool, index) => [`code${index}`, tool.code]),
    );
    const placeholders = pvDrillingTools.map((_, index) => `:code${index}`).join(',');
    const result = await connection.execute<{
      TOOL_CODE: string;
      TOOL_NAME: string;
      DISPLAY_ORDER: number;
      SCOPE_TYPE: string;
      CATEGORY_CODE: string;
      SITE_ID?: string;
      RIG_ID?: string;
      DEPARTMENT_ID?: string;
    }>(
      `SELECT T.TOOL_CODE,T.TOOL_NAME,T.DISPLAY_ORDER,T.SCOPE_TYPE,
              C.CATEGORY_CODE,TO_CHAR(T.SITE_ID) SITE_ID,TO_CHAR(T.RIG_ID) RIG_ID,
              TO_CHAR(T.DEPARTMENT_ID) DEPARTMENT_ID
       FROM SYS_TOOL T
       JOIN SYS_TOOL_CATEGORY C ON C.TOOL_CATEGORY_ID=T.TOOL_CATEGORY_ID
       WHERE T.IS_ACTIVE='Y' AND C.IS_ACTIVE='Y'
         AND T.TOOL_CODE IN (${placeholders})
       ORDER BY T.DISPLAY_ORDER,T.TOOL_CODE`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const actual = result.rows ?? [];
    const expected = pvDrillingTools.map((tool, index) => ({
      TOOL_CODE: tool.code,
      TOOL_NAME: tool.name,
      DISPLAY_ORDER: index + 1,
      SCOPE_TYPE: pvDrillingToolScope,
      CATEGORY_CODE: pvDrillingToolCategory.code,
      SITE_ID: null,
      RIG_ID: null,
      DEPARTMENT_ID: null,
    }));
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('Global Tool catalogue does not match the confirmed list');

    console.log(
      JSON.stringify({
        status: 'PASS',
        scopeType: pvDrillingToolScope,
        categoryCode: pvDrillingToolCategory.code,
        globalTools: actual.length,
        firstTool: actual[0]?.TOOL_NAME,
        lastTool: actual.at(-1)?.TOOL_NAME,
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
