import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import oracledb from 'oracledb';

export interface MigrationFile {
  id: string;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}
export interface MigrationRecord {
  MIGRATION_ID: string;
  MIGRATION_NAME: string;
  CHECKSUM_VALUE: string;
  STATUS_CODE: 'APPLIED' | 'FAILED' | 'ROLLED_BACK';
  APPLIED_AT: Date;
  EXECUTION_MS: number;
}
const databaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function connectionConfig(): oracledb.ConnectionAttributes {
  const required = ['ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING'] as const;
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length)
    throw new Error(`Missing required database configuration: ${missing.join(', ')}`);
  return {
    user: process.env.ORACLE_USER!,
    password: process.env.ORACLE_PASSWORD!,
    connectString: process.env.ORACLE_CONNECT_STRING!,
  };
}

export async function loadSqlFiles(folder: 'migrations' | 'rollback'): Promise<MigrationFile[]> {
  const directory = path.join(databaseRoot, folder);
  const filenames = (await readdir(directory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort((a, b) => Number(a.split('_')[0]) - Number(b.split('_')[0]));
  return Promise.all(
    filenames.map(async (filename) => {
      const sql = await readFile(path.join(directory, filename), 'utf8');
      const id = filename.split('_')[0]!;
      return {
        id,
        name: filename.replace(/^\d+_/, '').replace(/\.sql$/, ''),
        filename,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
}

export function splitStatements(sql: string): string[] {
  return sql
    .split(/^\s*\/\s*$|;/m)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function history(connection: oracledb.Connection): Promise<MigrationRecord[]> {
  try {
    const result = await connection.execute<MigrationRecord>(
      'SELECT MIGRATION_ID, MIGRATION_NAME, CHECKSUM_VALUE, STATUS_CODE, APPLIED_AT, EXECUTION_MS FROM JSA_SCHEMA_VERSION ORDER BY MIGRATION_ID',
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return result.rows ?? [];
  } catch (error) {
    if ((error as { errorNum?: number }).errorNum === 942) return [];
    throw error;
  }
}

export async function executeStatements(
  connection: oracledb.Connection,
  sql: string,
): Promise<void> {
  for (const statement of splitStatements(sql))
    await connection.execute(statement, {}, { autoCommit: false });
}

export async function record(
  connection: oracledb.Connection,
  migration: MigrationFile,
  status: MigrationRecord['STATUS_CODE'],
  executionMs: number,
): Promise<void> {
  await connection.execute(
    `MERGE INTO JSA_SCHEMA_VERSION target
     USING (SELECT :migrationId AS MIGRATION_ID FROM DUAL) source
     ON (target.MIGRATION_ID = source.MIGRATION_ID)
     WHEN MATCHED THEN UPDATE SET MIGRATION_NAME=:migrationName, CHECKSUM_VALUE=:checksumValue, APPLIED_AT=SYSTIMESTAMP, APPLIED_BY=:appliedBy, EXECUTION_MS=:executionMs, STATUS_CODE=:statusCode
     WHEN NOT MATCHED THEN INSERT (MIGRATION_ID, MIGRATION_NAME, CHECKSUM_VALUE, APPLIED_BY, EXECUTION_MS, STATUS_CODE)
     VALUES (:migrationId, :migrationName, :checksumValue, :appliedBy, :executionMs, :statusCode)`,
    {
      migrationId: migration.id,
      migrationName: migration.name,
      checksumValue: migration.checksum,
      appliedBy: process.env.USERNAME ?? process.env.USER ?? 'jsams-migration',
      executionMs,
      statusCode: status,
    },
    { autoCommit: true },
  );
}

export async function applyMigrations(
  connection: oracledb.Connection,
  migrations: MigrationFile[],
  existing: MigrationRecord[],
  emit: (result: Record<string, unknown>) => void = () => undefined,
): Promise<void> {
  for (const migration of migrations) {
    const applied = existing.find(
      (item) => item.MIGRATION_ID === migration.id && item.STATUS_CODE === 'APPLIED',
    );
    if (applied) {
      if (applied.CHECKSUM_VALUE !== migration.checksum)
        throw new Error(`Checksum mismatch for applied migration ${migration.filename}`);
      emit({ migrationId: migration.id, status: 'skipped' });
      continue;
    }
    const started = Date.now();
    try {
      await executeStatements(connection, migration.sql);
      await record(connection, migration, 'APPLIED', Date.now() - started);
      emit({ migrationId: migration.id, status: 'applied', executionMs: Date.now() - started });
    } catch (error) {
      try {
        await record(connection, migration, 'FAILED', Date.now() - started);
      } catch {
        // Migration 001 may fail before the history table exists.
      }
      throw error;
    }
  }
}

export async function rollbackLatest(
  connection: oracledb.Connection,
  existing: MigrationRecord[],
  rollbacks: MigrationFile[],
): Promise<string | undefined> {
  const applied = existing
    .filter((item) => item.STATUS_CODE === 'APPLIED')
    .sort((a, b) => b.MIGRATION_ID.localeCompare(a.MIGRATION_ID))[0];
  if (!applied) return undefined;
  const rollback = rollbacks.find((file) => file.id === applied.MIGRATION_ID);
  if (!rollback) throw new Error(`Missing rollback script for migration ${applied.MIGRATION_ID}`);
  const started = Date.now();
  await executeStatements(connection, rollback.sql);
  if (applied.MIGRATION_ID !== '001')
    await record(
      connection,
      { ...rollback, name: applied.MIGRATION_NAME, checksum: applied.CHECKSUM_VALUE },
      'ROLLED_BACK',
      Date.now() - started,
    );
  return applied.MIGRATION_ID;
}
