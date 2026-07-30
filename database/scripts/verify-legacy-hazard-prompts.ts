import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { legacyHazardPrompts } from './legacy-hazard-prompt-data.js';

const configuredRigId = process.env.HAZARD_PROMPT_SEED_RIG_ID?.trim();

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const rigResult = configuredRigId
      ? await connection.execute<{ RIG_ID: string; SITE_ID: string; RIG_CODE: string }>(
          `SELECT TO_CHAR(RIG_ID) RIG_ID,TO_CHAR(SITE_ID) SITE_ID,RIG_CODE
           FROM SYS_RIG WHERE RIG_ID=:rigId AND IS_ACTIVE='Y'`,
          { rigId: configuredRigId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        )
      : await connection.execute<{ RIG_ID: string; SITE_ID: string; RIG_CODE: string }>(
          `SELECT TO_CHAR(RIG_ID) RIG_ID,TO_CHAR(SITE_ID) SITE_ID,RIG_CODE
           FROM SYS_RIG WHERE IS_ACTIVE='Y'
           ORDER BY CREATED_AT
           FETCH FIRST 2 ROWS ONLY`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
    if (!rigResult.rows?.length || (!configuredRigId && rigResult.rows.length !== 1))
      throw new Error('Could not resolve exactly one target Rig');
    const rig = rigResult.rows[0]!;

    const prompts = await connection.execute<{
      PROMPT_CODE: string;
      PROMPT_LABEL: string;
      DISPLAY_ORDER: number;
    }>(
      `SELECT PROMPT_CODE,PROMPT_LABEL,DISPLAY_ORDER
       FROM SYS_HAZARD_PROMPT
       WHERE IS_ACTIVE='Y'
         AND (
           SCOPE_TYPE='GLOBAL'
           OR (SCOPE_TYPE='SITE' AND SITE_ID=:siteId)
           OR (SCOPE_TYPE='RIG' AND SITE_ID=:siteId AND RIG_ID=:rigId)
         )
       ORDER BY DISPLAY_ORDER,PROMPT_CODE`,
      { siteId: rig.SITE_ID, rigId: rig.RIG_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const actual = prompts.rows ?? [];
    const expected = legacyHazardPrompts.map((prompt, index) => ({
      PROMPT_CODE: prompt.code,
      PROMPT_LABEL: prompt.label,
      DISPLAY_ORDER: index + 1,
    }));
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('Effective Hazard Prompt terminology or order does not match the seed');

    console.log(
      JSON.stringify({
        status: 'PASS',
        rigId: rig.RIG_ID,
        rigCode: rig.RIG_CODE,
        siteId: rig.SITE_ID,
        effectivePromptCount: actual.length,
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
