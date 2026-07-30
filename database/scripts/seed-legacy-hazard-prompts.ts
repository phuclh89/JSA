import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import {
  legacyHazardPrompts,
  supersededDevelopmentPromptCodes,
} from './legacy-hazard-prompt-data.js';

const actor = process.env.HAZARD_PROMPT_SEED_ACTOR?.trim() || 'phuclh';

type IdRow = { ID_VALUE: string };
type ExistingRow = { PROMPT_ID: string; SCOPE_TYPE: string };

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

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    let inserted = 0;
    let updated = 0;
    let consolidated = 0;

    for (const [index, prompt] of legacyHazardPrompts.entries()) {
      const existing = await connection.execute<ExistingRow>(
        `SELECT TO_CHAR(PROMPT_ID) PROMPT_ID,SCOPE_TYPE
         FROM SYS_HAZARD_PROMPT
         WHERE UPPER(PROMPT_CODE)=UPPER(:code) AND IS_ACTIVE='Y'
         ORDER BY CASE WHEN SCOPE_TYPE='GLOBAL' THEN 0 ELSE 1 END,PROMPT_ID
         FOR UPDATE`,
        { code: prompt.code },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const rows = existing.rows ?? [];
      const selected = rows[0];

      for (const duplicate of rows.slice(1)) {
        await connection.execute(
          `UPDATE SYS_HAZARD_PROMPT
           SET IS_ACTIVE='N',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,
               ROW_VERSION=ROW_VERSION+1
           WHERE PROMPT_ID=:promptId`,
          { actor, promptId: duplicate.PROMPT_ID },
        );
        consolidated += 1;
      }

      if (selected) {
        await connection.execute(
          `UPDATE SYS_HAZARD_PROMPT
           SET PROMPT_LABEL=:label,DESCRIPTION=:description,PROMPT_GROUP='HAZARD_ASSESSMENT',
               DISPLAY_ORDER=:displayOrder,SCOPE_TYPE='GLOBAL',SITE_ID=NULL,RIG_ID=NULL,
               DEPARTMENT_ID=NULL,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,
               UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
           WHERE PROMPT_ID=:promptId`,
          {
            label: prompt.label,
            description: prompt.label,
            displayOrder: index + 1,
            actor,
            promptId: selected.PROMPT_ID,
          },
        );
        updated += 1;
      } else {
        await connection.execute(
          `INSERT INTO SYS_HAZARD_PROMPT
           (PROMPT_ID,PROMPT_CODE,PROMPT_LABEL,DESCRIPTION,PROMPT_GROUP,DISPLAY_ORDER,
            SCOPE_TYPE,SITE_ID,RIG_ID,DEPARTMENT_ID,CREATED_BY,UPDATED_BY)
           VALUES
           (:promptId,:code,:label,:description,'HAZARD_ASSESSMENT',:displayOrder,
            'GLOBAL',NULL,NULL,NULL,:actor,:actor)`,
          {
            promptId: await nextId(connection),
            code: prompt.code,
            label: prompt.label,
            description: prompt.label,
            displayOrder: index + 1,
            actor,
          },
        );
        inserted += 1;
      }
    }

    const superseded = await connection.execute(
      `UPDATE SYS_HAZARD_PROMPT
       SET IS_ACTIVE='N',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE IS_ACTIVE='Y'
         AND PROMPT_CODE IN (${supersededDevelopmentPromptCodes.map((_, index) => `:old${index}`).join(',')})`,
      {
        actor,
        ...Object.fromEntries(
          supersededDevelopmentPromptCodes.map((code, index) => [`old${index}`, code]),
        ),
      },
    );

    const globalCount = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT
       FROM SYS_HAZARD_PROMPT
       WHERE IS_ACTIVE='Y' AND SCOPE_TYPE='GLOBAL'
         AND PROMPT_GROUP='HAZARD_ASSESSMENT'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (globalCount.rows?.[0]?.ITEM_COUNT !== legacyHazardPrompts.length)
      throw new Error('Global Hazard Prompt count does not match the confirmed 25-item list');

    await connection.commit();
    console.log(
      JSON.stringify({
        status: 'PASS',
        scopeType: 'GLOBAL',
        inserted,
        updated,
        consolidated,
        deactivatedDevelopmentDefaults: superseded.rowsAffected ?? 0,
        globalPromptCount: globalCount.rows[0].ITEM_COUNT,
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
