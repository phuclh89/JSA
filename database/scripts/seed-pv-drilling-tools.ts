import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import {
  pvDrillingToolCategory,
  pvDrillingTools,
  pvDrillingToolScope,
} from './pv-drilling-tool-data.js';

const actor = process.env.TOOL_SEED_ACTOR?.trim() || 'phuclh';

type IdRow = { ID_VALUE: string };
type CategoryRow = { TOOL_CATEGORY_ID: string };
type ToolRow = { TOOL_ID: string };

async function nextId(connection: oracledb.Connection, sequence: string): Promise<string> {
  if (!['SEQ_SYS_TOOL_CATEGORY', 'SEQ_SYS_TOOL'].includes(sequence))
    throw new Error('Unexpected Tool seed sequence');
  const result = await connection.execute<IdRow>(
    `SELECT TO_CHAR(${sequence}.NEXTVAL) ID_VALUE FROM DUAL`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const id = result.rows?.[0]?.ID_VALUE;
  if (!id) throw new Error(`Could not allocate an ID from ${sequence}`);
  return id;
}

async function resolveCategory(connection: oracledb.Connection): Promise<string> {
  const existing = await connection.execute<CategoryRow>(
    `SELECT TO_CHAR(TOOL_CATEGORY_ID) TOOL_CATEGORY_ID
     FROM SYS_TOOL_CATEGORY
     WHERE IS_ACTIVE='Y'
       AND (UPPER(CATEGORY_CODE)=UPPER(:code) OR UPPER(CATEGORY_NAME)=UPPER(:name))
     ORDER BY CASE WHEN SCOPE_TYPE='GLOBAL' THEN 0 ELSE 1 END,TOOL_CATEGORY_ID
     FOR UPDATE`,
    { code: pvDrillingToolCategory.code, name: pvDrillingToolCategory.name },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if ((existing.rows?.length ?? 0) > 1)
    throw new Error('Multiple active JSA Tool categories exist; resolve them before seeding');
  const categoryId =
    existing.rows?.[0]?.TOOL_CATEGORY_ID ?? (await nextId(connection, 'SEQ_SYS_TOOL_CATEGORY'));

  if (existing.rows?.length) {
    await connection.execute(
      `UPDATE SYS_TOOL_CATEGORY
       SET CATEGORY_CODE=:code,CATEGORY_NAME=:name,DESCRIPTION=:description,
           DISPLAY_ORDER=1,SCOPE_TYPE=:scopeType,SITE_ID=NULL,RIG_ID=NULL,
           DEPARTMENT_ID=NULL,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,
           UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE TOOL_CATEGORY_ID=:categoryId`,
      {
        code: pvDrillingToolCategory.code,
        name: pvDrillingToolCategory.name,
        description: pvDrillingToolCategory.name,
        scopeType: pvDrillingToolScope,
        actor,
        categoryId,
      },
    );
  } else {
    await connection.execute(
      `INSERT INTO SYS_TOOL_CATEGORY
       (TOOL_CATEGORY_ID,CATEGORY_CODE,CATEGORY_NAME,DESCRIPTION,DISPLAY_ORDER,SCOPE_TYPE,
        SITE_ID,RIG_ID,DEPARTMENT_ID,CREATED_BY,UPDATED_BY)
       VALUES
       (:categoryId,:code,:name,:description,1,:scopeType,NULL,NULL,NULL,:actor,:actor)`,
      {
        categoryId,
        code: pvDrillingToolCategory.code,
        name: pvDrillingToolCategory.name,
        description: pvDrillingToolCategory.name,
        scopeType: pvDrillingToolScope,
        actor,
      },
    );
  }
  return categoryId;
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const categoryId = await resolveCategory(connection);
    let inserted = 0;
    let updated = 0;
    let consolidated = 0;

    for (const [index, tool] of pvDrillingTools.entries()) {
      const existing = await connection.execute<ToolRow>(
        `SELECT TO_CHAR(TOOL_ID) TOOL_ID
         FROM SYS_TOOL
         WHERE IS_ACTIVE='Y'
           AND (UPPER(TOOL_CODE)=UPPER(:code) OR UPPER(TOOL_NAME)=UPPER(:name))
         ORDER BY CASE WHEN SCOPE_TYPE='GLOBAL' THEN 0 ELSE 1 END,TOOL_ID
         FOR UPDATE`,
        { code: tool.code, name: tool.name },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const rows = existing.rows ?? [];
      const selected = rows[0];

      for (const duplicate of rows.slice(1)) {
        await connection.execute(
          `UPDATE SYS_TOOL
           SET IS_ACTIVE='N',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,
               ROW_VERSION=ROW_VERSION+1
           WHERE TOOL_ID=:toolId`,
          { actor, toolId: duplicate.TOOL_ID },
        );
        consolidated += 1;
      }

      if (selected) {
        await connection.execute(
          `UPDATE SYS_TOOL
           SET TOOL_CODE=:code,TOOL_NAME=:name,TOOL_CATEGORY_ID=:categoryId,
               DESCRIPTION=:description,DISPLAY_ORDER=:displayOrder,SCOPE_TYPE=:scopeType,
               SITE_ID=NULL,RIG_ID=NULL,DEPARTMENT_ID=NULL,IS_ACTIVE='Y',
               UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
           WHERE TOOL_ID=:toolId`,
          {
            code: tool.code,
            name: tool.name,
            categoryId,
            description: tool.name,
            displayOrder: index + 1,
            scopeType: pvDrillingToolScope,
            actor,
            toolId: selected.TOOL_ID,
          },
        );
        updated += 1;
      } else {
        await connection.execute(
          `INSERT INTO SYS_TOOL
           (TOOL_ID,TOOL_CODE,TOOL_NAME,TOOL_CATEGORY_ID,DESCRIPTION,DISPLAY_ORDER,
            SCOPE_TYPE,SITE_ID,RIG_ID,DEPARTMENT_ID,CREATED_BY,UPDATED_BY)
           VALUES
           (:toolId,:code,:name,:categoryId,:description,:displayOrder,
            :scopeType,NULL,NULL,NULL,:actor,:actor)`,
          {
            toolId: await nextId(connection, 'SEQ_SYS_TOOL'),
            code: tool.code,
            name: tool.name,
            categoryId,
            description: tool.name,
            displayOrder: index + 1,
            scopeType: pvDrillingToolScope,
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
        scopeType: pvDrillingToolScope,
        categoryId,
        categoryCode: pvDrillingToolCategory.code,
        expectedTools: pvDrillingTools.length,
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
