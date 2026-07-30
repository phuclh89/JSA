import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { pvDrillingDepartments } from './pv-drilling-department-data.js';
import { pvDrillingRigMatrixAssignments } from './pv-drilling-rig-matrix-assignment-data.js';

function same(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${label} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const constraintResult = await connection.execute<{
      CONSTRAINT_NAME: string;
      STATUS: string;
    }>(
      `SELECT CONSTRAINT_NAME,STATUS FROM USER_CONSTRAINTS
       WHERE TABLE_NAME='SYS_DEPARTMENT'
         AND CONSTRAINT_NAME IN ('UK_SYS_DEPT_SITE_CODE','UK_SYS_DEPT_RIG_CODE')`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      constraintResult.rows,
      [{ CONSTRAINT_NAME: 'UK_SYS_DEPT_RIG_CODE', STATUS: 'ENABLED' }],
      'Department Rig-scope constraint',
    );

    const result = await connection.execute<{
      RIG_CODE: string;
      DEPARTMENT_CODE: string;
      DEPARTMENT_NAME: string;
    }>(
      `SELECT R.RIG_CODE,D.DEPARTMENT_CODE,D.DEPARTMENT_NAME
       FROM SYS_RIG R
       JOIN SYS_DEPARTMENT D ON D.RIG_ID=R.RIG_ID AND D.SITE_ID=R.SITE_ID
       WHERE R.IS_ACTIVE='Y' AND D.IS_ACTIVE='Y'
       ORDER BY R.RIG_CODE,D.DEPARTMENT_CODE`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    same(
      result.rows,
      pvDrillingRigMatrixAssignments
        .flatMap((rig) =>
          pvDrillingDepartments.map((department) => ({
            RIG_CODE: rig.rigCode,
            DEPARTMENT_CODE: department.code,
            DEPARTMENT_NAME: department.name,
          })),
        )
        .sort(
          (a, b) =>
            a.RIG_CODE.localeCompare(b.RIG_CODE) ||
            a.DEPARTMENT_CODE.localeCompare(b.DEPARTMENT_CODE),
        ),
      'Rig Departments',
    );

    console.log(
      JSON.stringify({
        status: 'PASS',
        rigs: pvDrillingRigMatrixAssignments.length,
        departmentsPerRig: pvDrillingDepartments.length,
        activeDepartments: result.rows?.length,
        constraint: 'UK_SYS_DEPT_RIG_CODE',
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
