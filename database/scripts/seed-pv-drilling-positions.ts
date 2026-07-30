import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { pvDrillingPositions, pvDrillingPositionScope } from './pv-drilling-position-data.js';

const actor = process.env.POSITION_SEED_ACTOR?.trim() || 'phuclh';

type IdRow = { ID_VALUE: string };
type ExistingRow = { POSITION_ID: string; SCOPE_TYPE: string };

async function nextId(connection: oracledb.Connection): Promise<string> {
  const result = await connection.execute<IdRow>(
    'SELECT TO_CHAR(SEQ_SYS_POSITION.NEXTVAL) ID_VALUE FROM DUAL',
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const id = result.rows?.[0]?.ID_VALUE;
  if (!id) throw new Error('Could not allocate a Position ID');
  return id;
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    let inserted = 0;
    let updated = 0;
    let consolidated = 0;

    for (const [index, position] of pvDrillingPositions.entries()) {
      const existing = await connection.execute<ExistingRow>(
        `SELECT TO_CHAR(POSITION_ID) POSITION_ID,SCOPE_TYPE
         FROM SYS_POSITION
         WHERE IS_ACTIVE='Y'
           AND (UPPER(POSITION_CODE)=UPPER(:code) OR UPPER(POSITION_NAME)=UPPER(:name))
         ORDER BY CASE WHEN SCOPE_TYPE='GLOBAL' THEN 0 ELSE 1 END,POSITION_ID
         FOR UPDATE`,
        { code: position.code, name: position.name },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const rows = existing.rows ?? [];
      const selected = rows[0];

      for (const duplicate of rows.slice(1)) {
        await connection.execute(
          `UPDATE SYS_POSITION
           SET IS_ACTIVE='N',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,
               ROW_VERSION=ROW_VERSION+1
           WHERE POSITION_ID=:positionId`,
          { actor, positionId: duplicate.POSITION_ID },
        );
        consolidated += 1;
      }

      if (selected) {
        await connection.execute(
          `UPDATE SYS_POSITION
           SET POSITION_CODE=:code,POSITION_NAME=:name,DESCRIPTION=:description,
               DISPLAY_ORDER=:displayOrder,SCOPE_TYPE=:scopeType,SITE_ID=NULL,RIG_ID=NULL,
               DEPARTMENT_ID=NULL,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,
               UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
           WHERE POSITION_ID=:positionId`,
          {
            code: position.code,
            name: position.name,
            description: position.name,
            displayOrder: index + 1,
            scopeType: pvDrillingPositionScope,
            actor,
            positionId: selected.POSITION_ID,
          },
        );
        updated += 1;
      } else {
        await connection.execute(
          `INSERT INTO SYS_POSITION
           (POSITION_ID,POSITION_CODE,POSITION_NAME,DESCRIPTION,DISPLAY_ORDER,SCOPE_TYPE,
            SITE_ID,RIG_ID,DEPARTMENT_ID,CREATED_BY,UPDATED_BY)
           VALUES
           (:positionId,:code,:name,:description,:displayOrder,:scopeType,
            NULL,NULL,NULL,:actor,:actor)`,
          {
            positionId: await nextId(connection),
            code: position.code,
            name: position.name,
            description: position.name,
            displayOrder: index + 1,
            scopeType: pvDrillingPositionScope,
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
        scopeType: pvDrillingPositionScope,
        expectedPositions: pvDrillingPositions.length,
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
