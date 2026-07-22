import oracledb from 'oracledb';
import { connectionConfig, history, loadSqlFiles } from './migration-core.js';
async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const [files, records] = await Promise.all([loadSqlFiles('migrations'), history(connection)]);
    for (const file of files) {
      const item = records.find((record) => record.MIGRATION_ID === file.id);
      console.log(
        JSON.stringify({
          migrationId: file.id,
          name: file.name,
          status: item?.STATUS_CODE ?? 'PENDING',
          checksumValid: item ? item.CHECKSUM_VALUE === file.checksum : undefined,
          appliedAt: item?.APPLIED_AT,
        }),
      );
    }
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
