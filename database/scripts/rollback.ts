import oracledb from 'oracledb';
import { connectionConfig, history, loadSqlFiles, rollbackLatest } from './migration-core.js';
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_PRODUCTION_ROLLBACK !== 'YES')
    throw new Error('Production rollback requires explicit CONFIRM_PRODUCTION_ROLLBACK=YES');
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const started = Date.now();
    const migrationId = await rollbackLatest(
      connection,
      await history(connection),
      await loadSqlFiles('rollback'),
    );
    if (!migrationId) {
      console.log(JSON.stringify({ status: 'nothing_to_rollback' }));
      return;
    }
    console.log(
      JSON.stringify({
        migrationId,
        status: 'rolled_back',
        executionMs: Date.now() - started,
      }),
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
