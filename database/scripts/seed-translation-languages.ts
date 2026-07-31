import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { translationLanguages, translationLanguageScope } from './translation-language-data.js';

const actor = process.env.LANGUAGE_SEED_ACTOR?.trim() || 'phuclh';

type IdRow = { LANGUAGE_ID: string };

async function nextId(connection: oracledb.Connection): Promise<string> {
  const result = await connection.execute<{ ID_VALUE: string }>(
    'SELECT TO_CHAR(SEQ_SYS_LANGUAGE.NEXTVAL) ID_VALUE FROM DUAL',
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const id = result.rows?.[0]?.ID_VALUE;
  if (!id) throw new Error('Could not allocate an ID from SEQ_SYS_LANGUAGE');
  return id;
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    let inserted = 0;
    let updated = 0;
    let consolidated = 0;

    for (const language of translationLanguages) {
      const existing = await connection.execute<IdRow>(
        `SELECT TO_CHAR(LANGUAGE_ID) LANGUAGE_ID
         FROM SYS_LANGUAGE
         WHERE IS_ACTIVE='Y'
           AND (UPPER(LANGUAGE_CODE)=UPPER(:code)
             OR UPPER(LOCALE_CODE)=UPPER(:localeCode))
         ORDER BY CASE WHEN SCOPE_TYPE='GLOBAL' THEN 0 ELSE 1 END,LANGUAGE_ID
         FOR UPDATE`,
        { code: language.code, localeCode: language.localeCode },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const rows = existing.rows ?? [];
      const selected = rows[0];

      for (const duplicate of rows.slice(1)) {
        await connection.execute(
          `UPDATE SYS_LANGUAGE
           SET IS_ACTIVE='N',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,
               ROW_VERSION=ROW_VERSION+1
           WHERE LANGUAGE_ID=:languageId`,
          { actor, languageId: duplicate.LANGUAGE_ID },
        );
        consolidated += 1;
      }

      if (selected) {
        await connection.execute(
          `UPDATE SYS_LANGUAGE
           SET LANGUAGE_CODE=:code,LANGUAGE_NAME=:name,LOCALE_CODE=:localeCode,
               DISPLAY_ORDER=:displayOrder,SCOPE_TYPE=:scopeType,SITE_ID=NULL,
               RIG_ID=NULL,DEPARTMENT_ID=NULL,IS_ACTIVE='Y',
               UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
           WHERE LANGUAGE_ID=:languageId`,
          {
            ...language,
            scopeType: translationLanguageScope,
            actor,
            languageId: selected.LANGUAGE_ID,
          },
        );
        updated += 1;
      } else {
        await connection.execute(
          `INSERT INTO SYS_LANGUAGE
           (LANGUAGE_ID,LANGUAGE_CODE,LANGUAGE_NAME,LOCALE_CODE,DISPLAY_ORDER,
            SCOPE_TYPE,SITE_ID,RIG_ID,DEPARTMENT_ID,CREATED_BY,UPDATED_BY)
           VALUES
           (:languageId,:code,:name,:localeCode,:displayOrder,
            :scopeType,NULL,NULL,NULL,:actor,:actor)`,
          {
            languageId: await nextId(connection),
            ...language,
            scopeType: translationLanguageScope,
            actor,
          },
        );
        inserted += 1;
      }
    }

    await connection.commit();
    console.log(
      JSON.stringify({
        status: 'PASS',
        scopeType: translationLanguageScope,
        expectedLanguages: translationLanguages.length,
        inserted,
        updated,
        consolidated,
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
