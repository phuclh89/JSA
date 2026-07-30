import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { pvDrillingDepartments } from './pv-drilling-department-data.js';
import { pvDrillingRigMatrixAssignments } from './pv-drilling-rig-matrix-assignment-data.js';

const actor = process.env.DEPARTMENT_SEED_ACTOR?.trim() || 'phuclh';

type IdRow = { ID_VALUE: string };
type RigRow = { RIG_ID: string; SITE_ID: string; RIG_CODE: string };
type DepartmentRow = { DEPARTMENT_ID: string; DEPARTMENT_CODE: string };
type CountRow = { ITEM_COUNT: number };

async function nextId(connection: oracledb.Connection): Promise<string> {
  const result = await connection.execute<IdRow>(
    'SELECT TO_CHAR(SEQ_SYS_DEPARTMENT.NEXTVAL) ID_VALUE FROM DUAL',
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const id = result.rows?.[0]?.ID_VALUE;
  if (!id) throw new Error('Could not allocate a Department ID');
  return id;
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const constraintResult = await connection.execute<CountRow>(
      `SELECT COUNT(*) ITEM_COUNT FROM USER_CONSTRAINTS
       WHERE TABLE_NAME='SYS_DEPARTMENT'
         AND CONSTRAINT_NAME='UK_SYS_DEPT_RIG_CODE'
         AND STATUS='ENABLED'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (constraintResult.rows?.[0]?.ITEM_COUNT !== 1)
      throw new Error('Migration 013 Department Rig-scope constraint is not enabled');

    const rigResult = await connection.execute<RigRow>(
      `SELECT TO_CHAR(R.RIG_ID) RIG_ID,TO_CHAR(R.SITE_ID) SITE_ID,R.RIG_CODE
       FROM SYS_RIG R JOIN SYS_SITE S ON S.SITE_ID=R.SITE_ID
       WHERE R.IS_ACTIVE='Y' AND S.IS_ACTIVE='Y'
       ORDER BY R.RIG_CODE
       FOR UPDATE OF R.RIG_ID`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const expectedRigCodes = new Set<string>(
      pvDrillingRigMatrixAssignments.map((item) => item.rigCode),
    );
    const rigs = rigResult.rows ?? [];
    if (
      rigs.length !== expectedRigCodes.size ||
      rigs.some((rig) => !expectedRigCodes.has(rig.RIG_CODE))
    )
      throw new Error('Active Rig set does not match the confirmed PV Drilling hierarchy');

    let created = 0;
    let updated = 0;
    for (const rig of rigs) {
      for (const department of pvDrillingDepartments) {
        const existingResult = await connection.execute<DepartmentRow>(
          `SELECT TO_CHAR(DEPARTMENT_ID) DEPARTMENT_ID,DEPARTMENT_CODE
           FROM SYS_DEPARTMENT
           WHERE SITE_ID=:siteId AND RIG_ID=:rigId
             AND DEPARTMENT_CODE IN (:code,:previousCode)
           FOR UPDATE`,
          {
            siteId: rig.SITE_ID,
            rigId: rig.RIG_ID,
            code: department.code,
            previousCode: department.previousCode,
          },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
        if ((existingResult.rows?.length ?? 0) > 1)
          throw new Error(
            `Both current and previous codes exist for ${rig.RIG_CODE}/${department.name}`,
          );
        const existingId = existingResult.rows?.[0]?.DEPARTMENT_ID;
        if (existingId) {
          await connection.execute(
            `UPDATE SYS_DEPARTMENT
             SET DEPARTMENT_CODE=:code,DEPARTMENT_NAME=:name,IS_ACTIVE='Y',UPDATED_SITE_ID=:siteId,
                 UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
             WHERE DEPARTMENT_ID=:departmentId`,
            {
              code: department.code,
              name: department.name,
              siteId: rig.SITE_ID,
              actor,
              departmentId: existingId,
            },
          );
          updated += 1;
          continue;
        }

        const departmentId = await nextId(connection);
        await connection.execute(
          `INSERT INTO SYS_DEPARTMENT
           (DEPARTMENT_ID,SITE_ID,RIG_ID,DEPARTMENT_CODE,DEPARTMENT_NAME,
            CREATED_SITE_ID,UPDATED_SITE_ID,CREATED_BY,UPDATED_BY)
           VALUES
           (:departmentId,:siteId,:rigId,:code,:name,:siteId,:siteId,:actor,:actor)`,
          {
            departmentId,
            siteId: rig.SITE_ID,
            rigId: rig.RIG_ID,
            code: department.code,
            name: department.name,
            actor,
          },
        );
        created += 1;
      }
    }

    const unexpectedResult = await connection.execute<CountRow>(
      `SELECT COUNT(*) ITEM_COUNT
       FROM SYS_DEPARTMENT D JOIN SYS_RIG R ON R.RIG_ID=D.RIG_ID
       WHERE D.IS_ACTIVE='Y' AND R.IS_ACTIVE='Y'
         AND D.DEPARTMENT_CODE NOT IN
           ('3P','DR','EL','ET','ME','MAR','MED','WE','CAT','STC')`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((unexpectedResult.rows?.[0]?.ITEM_COUNT ?? 0) !== 0)
      throw new Error('Unexpected active Departments remain on active Rigs');

    await connection.commit();
    console.log(
      JSON.stringify({
        status: 'PASS',
        rigs: rigs.length,
        departmentsPerRig: pvDrillingDepartments.length,
        expectedDepartments: rigs.length * pvDrillingDepartments.length,
        created,
        updated,
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
