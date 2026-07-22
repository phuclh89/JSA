import {
  applyMigrations,
  rollbackLatest,
  splitStatements,
  type MigrationFile,
  type MigrationRecord,
} from './migration-core.js';
import { describe, expect, it, vi } from 'vitest';
describe('migration SQL parsing', () => {
  it('executes statements in source order', () => {
    expect(splitStatements('CREATE TABLE A (ID NUMBER);\nCREATE INDEX IX_A ON A(ID)')).toEqual([
      'CREATE TABLE A (ID NUMBER)',
      'CREATE INDEX IX_A ON A(ID)',
    ]);
  });
  it('ignores blank delimiters', () => {
    expect(splitStatements('SELECT 1 FROM DUAL;\n;')).toEqual(['SELECT 1 FROM DUAL']);
  });
  it('supports Windows line endings and semicolons inside string values', () => {
    expect(splitStatements("INSERT INTO X VALUES ('a;b');\r\nSELECT 1 FROM DUAL;")).toEqual([
      "INSERT INTO X VALUES ('a;b')",
      'SELECT 1 FROM DUAL',
    ]);
  });
  it('keeps a PL/SQL block intact until a slash delimiter', () => {
    const block = 'BEGIN\n  NULL;\n  NULL;\nEND;\n/\nSELECT 1 FROM DUAL;';
    expect(splitStatements(block)).toEqual(['BEGIN\n  NULL;\n  NULL;\nEND;', 'SELECT 1 FROM DUAL']);
  });
});

describe('migration runner', () => {
  const migration: MigrationFile = {
    id: '001',
    name: 'create_history',
    filename: '001_create_history.sql',
    sql: 'CREATE TABLE JSA_SCHEMA_VERSION (ID NUMBER)',
    checksum: 'abc',
  };
  const applied: MigrationRecord = {
    MIGRATION_ID: '001',
    MIGRATION_NAME: migration.name,
    CHECKSUM_VALUE: migration.checksum,
    STATUS_CODE: 'APPLIED',
    APPLIED_AT: new Date(),
    EXECUTION_MS: 1,
  };
  const connection = () => ({ execute: vi.fn().mockResolvedValue({}) });

  it('applies the first migration and records APPLIED status', async () => {
    const db = connection();
    await applyMigrations(db as never, [migration], []);
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ statusCode: 'APPLIED' }),
    );
  });
  it('does not repeat an applied migration', async () => {
    const db = connection();
    const results: Record<string, unknown>[] = [];
    await applyMigrations(db as never, [migration], [applied], (result) => results.push(result));
    expect(db.execute).not.toHaveBeenCalled();
    expect(results[0]).toEqual(expect.objectContaining({ status: 'skipped' }));
  });
  it('rejects a modified applied checksum', async () => {
    const db = connection();
    await expect(
      applyMigrations(db as never, [{ ...migration, checksum: 'changed' }], [applied]),
    ).rejects.toThrow('Checksum mismatch');
    expect(db.execute).not.toHaveBeenCalled();
  });
  it('propagates failure so the CLI returns nonzero', async () => {
    const db = { execute: vi.fn().mockRejectedValue(new Error('DDL failed')) };
    await expect(applyMigrations(db as never, [migration], [])).rejects.toThrow('DDL failed');
  });
  it('executes a controlled rollback', async () => {
    const db = connection();
    await expect(
      rollbackLatest(
        db as never,
        [applied],
        [{ ...migration, name: 'rollback', sql: 'DROP TABLE JSA_SCHEMA_VERSION' }],
      ),
    ).resolves.toBe('001');
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
