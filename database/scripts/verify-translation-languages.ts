import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { translationLanguages, translationLanguageScope } from './translation-language-data.js';

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const binds = Object.fromEntries(
      translationLanguages.map((language, index) => [`code${index}`, language.code]),
    );
    const placeholders = translationLanguages.map((_, index) => `:code${index}`).join(',');
    const result = await connection.execute<{
      LANGUAGE_CODE: string;
      LANGUAGE_NAME: string;
      LOCALE_CODE: string;
      DISPLAY_ORDER: number;
      SCOPE_TYPE: string;
      SITE_ID?: string;
      RIG_ID?: string;
      DEPARTMENT_ID?: string;
    }>(
      `SELECT LANGUAGE_CODE,LANGUAGE_NAME,LOCALE_CODE,DISPLAY_ORDER,SCOPE_TYPE,
              TO_CHAR(SITE_ID) SITE_ID,TO_CHAR(RIG_ID) RIG_ID,
              TO_CHAR(DEPARTMENT_ID) DEPARTMENT_ID
       FROM SYS_LANGUAGE
       WHERE IS_ACTIVE='Y' AND LANGUAGE_CODE IN (${placeholders})
       ORDER BY DISPLAY_ORDER,LANGUAGE_CODE`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const actual = result.rows ?? [];
    const expected = translationLanguages.map((language) => ({
      LANGUAGE_CODE: language.code,
      LANGUAGE_NAME: language.name,
      LOCALE_CODE: language.localeCode,
      DISPLAY_ORDER: language.displayOrder,
      SCOPE_TYPE: translationLanguageScope,
      SITE_ID: null,
      RIG_ID: null,
      DEPARTMENT_ID: null,
    }));
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('Translation target languages do not match the confirmed catalogue');

    console.log(
      JSON.stringify({
        status: 'PASS',
        scopeType: translationLanguageScope,
        activeTranslationLanguages: actual.length,
        languages: actual.map(({ LANGUAGE_NAME, LOCALE_CODE }) => ({
          name: LANGUAGE_NAME,
          localeCode: LOCALE_CODE,
        })),
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
