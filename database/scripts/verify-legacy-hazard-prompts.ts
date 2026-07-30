import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { legacyHazardPrompts } from './legacy-hazard-prompt-data.js';

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const prompts = await connection.execute<{
      PROMPT_CODE: string;
      PROMPT_LABEL: string;
      DISPLAY_ORDER: number;
      SCOPE_TYPE: string;
    }>(
      `SELECT PROMPT_CODE,PROMPT_LABEL,DISPLAY_ORDER,SCOPE_TYPE
       FROM SYS_HAZARD_PROMPT
       WHERE IS_ACTIVE='Y' AND PROMPT_GROUP='HAZARD_ASSESSMENT'
       ORDER BY DISPLAY_ORDER,PROMPT_CODE`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const actual = prompts.rows ?? [];
    const expected = legacyHazardPrompts.map((prompt, index) => ({
      PROMPT_CODE: prompt.code,
      PROMPT_LABEL: prompt.label,
      DISPLAY_ORDER: index + 1,
      SCOPE_TYPE: 'GLOBAL',
    }));
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('Global Hazard Prompt terminology, order, or scope does not match the seed');

    const rigCount = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT
       FROM SYS_RIG R JOIN SYS_SITE S ON S.SITE_ID=R.SITE_ID
       WHERE R.IS_ACTIVE='Y' AND S.IS_ACTIVE='Y'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    console.log(
      JSON.stringify({
        status: 'PASS',
        scopeType: 'GLOBAL',
        activeRigsUsingSharedList: rigCount.rows?.[0]?.ITEM_COUNT ?? 0,
        globalPromptCount: actual.length,
        firstPrompt: actual[0]?.PROMPT_LABEL,
        lastPrompt: actual.at(-1)?.PROMPT_LABEL,
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
