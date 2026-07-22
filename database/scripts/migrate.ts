import oracledb from 'oracledb';
import { applyMigrations, connectionConfig, history, loadSqlFiles } from './migration-core.js';

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    await applyMigrations(
      connection,
      await loadSqlFiles('migrations'),
      await history(connection),
      (result) => console.log(JSON.stringify(result)),
    );
  } finally {
    await connection.close();
  }
}
main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      oracleErrorCode: (error as { errorNum?: number }).errorNum,
    }),
  );
  process.exitCode = 1;
});
