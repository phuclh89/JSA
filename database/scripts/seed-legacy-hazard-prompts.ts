import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import {
  legacyHazardPrompts,
  supersededDevelopmentPromptCodes,
} from './legacy-hazard-prompt-data.js';

const actor = process.env.HAZARD_PROMPT_SEED_ACTOR?.trim() || 'phuclh';
const configuredRigId = process.env.HAZARD_PROMPT_SEED_RIG_ID?.trim();

type RigRow = { RIG_ID: string; SITE_ID: string; RIG_CODE: string };
type IdRow = { ID_VALUE: string };
type ExistingRow = { PROMPT_ID: string };

async function nextId(connection: oracledb.Connection): Promise<string> {
  const result = await connection.execute<IdRow>(
    'SELECT TO_CHAR(SEQ_SYS_HAZARD_PROMPT.NEXTVAL) ID_VALUE FROM DUAL',
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const id = result.rows?.[0]?.ID_VALUE;
  if (!id) throw new Error('Could not allocate a Hazard Prompt ID');
  return id;
}

async function resolveRig(connection: oracledb.Connection): Promise<RigRow> {
  const result = configuredRigId
    ? await connection.execute<RigRow>(
        `SELECT TO_CHAR(RIG_ID) RIG_ID,TO_CHAR(SITE_ID) SITE_ID,RIG_CODE
         FROM SYS_RIG WHERE RIG_ID=:rigId AND IS_ACTIVE='Y'`,
        { rigId: configuredRigId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      )
    : await connection.execute<RigRow>(
        `SELECT TO_CHAR(RIG_ID) RIG_ID,TO_CHAR(SITE_ID) SITE_ID,RIG_CODE
         FROM SYS_RIG WHERE IS_ACTIVE='Y'
         ORDER BY CREATED_AT
         FETCH FIRST 2 ROWS ONLY`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
  if (!result.rows?.length) throw new Error('No active target Rig was found');
  if (!configuredRigId && result.rows.length !== 1)
    throw new Error('Multiple active Rigs exist; set HAZARD_PROMPT_SEED_RIG_ID explicitly');
  return result.rows[0]!;
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const rig = await resolveRig(connection);
    let inserted = 0;
    let updated = 0;

    for (const [index, prompt] of legacyHazardPrompts.entries()) {
      const existing = await connection.execute<ExistingRow>(
        `SELECT TO_CHAR(PROMPT_ID) PROMPT_ID
         FROM SYS_HAZARD_PROMPT
         WHERE UPPER(PROMPT_CODE)=UPPER(:code)
           AND SCOPE_TYPE='RIG' AND SITE_ID=:siteId AND RIG_ID=:rigId`,
        { code: prompt.code, siteId: rig.SITE_ID, rigId: rig.RIG_ID },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const promptId = existing.rows?.[0]?.PROMPT_ID;
      if (promptId) {
        await connection.execute(
          `UPDATE SYS_HAZARD_PROMPT
           SET PROMPT_LABEL=:label,DESCRIPTION=:description,PROMPT_GROUP='HAZARD_ASSESSMENT',
               DISPLAY_ORDER=:displayOrder,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,
               UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
           WHERE PROMPT_ID=:promptId`,
          {
            label: prompt.label,
            description: prompt.label,
            displayOrder: index + 1,
            actor,
            promptId,
          },
        );
        updated += 1;
      } else {
        await connection.execute(
          `INSERT INTO SYS_HAZARD_PROMPT
           (PROMPT_ID,PROMPT_CODE,PROMPT_LABEL,DESCRIPTION,PROMPT_GROUP,DISPLAY_ORDER,
            SCOPE_TYPE,SITE_ID,RIG_ID,CREATED_BY,UPDATED_BY)
           VALUES
           (:promptId,:code,:label,:description,'HAZARD_ASSESSMENT',:displayOrder,
            'RIG',:siteId,:rigId,:actor,:actor)`,
          {
            promptId: await nextId(connection),
            code: prompt.code,
            label: prompt.label,
            description: prompt.label,
            displayOrder: index + 1,
            siteId: rig.SITE_ID,
            rigId: rig.RIG_ID,
            actor,
          },
        );
        inserted += 1;
      }
    }

    const superseded = await connection.execute(
      `UPDATE SYS_HAZARD_PROMPT
       SET IS_ACTIVE='N',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE SCOPE_TYPE='GLOBAL' AND IS_ACTIVE='Y'
         AND PROMPT_CODE IN (${supersededDevelopmentPromptCodes.map((_, index) => `:old${index}`).join(',')})`,
      {
        actor,
        ...Object.fromEntries(
          supersededDevelopmentPromptCodes.map((code, index) => [`old${index}`, code]),
        ),
      },
    );

    const activeCount = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT
       FROM SYS_HAZARD_PROMPT
       WHERE IS_ACTIVE='Y'
         AND (
           SCOPE_TYPE='GLOBAL'
           OR (SCOPE_TYPE='SITE' AND SITE_ID=:siteId)
           OR (SCOPE_TYPE='RIG' AND SITE_ID=:siteId AND RIG_ID=:rigId)
         )`,
      { siteId: rig.SITE_ID, rigId: rig.RIG_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (activeCount.rows?.[0]?.ITEM_COUNT !== legacyHazardPrompts.length)
      throw new Error('Effective Hazard Prompt count does not match the confirmed 25-item list');

    await connection.commit();
    console.log(
      JSON.stringify({
        status: 'PASS',
        rigId: rig.RIG_ID,
        rigCode: rig.RIG_CODE,
        siteId: rig.SITE_ID,
        inserted,
        updated,
        deactivatedDevelopmentDefaults: superseded.rowsAffected ?? 0,
        effectivePromptCount: activeCount.rows[0].ITEM_COUNT,
      }),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
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
