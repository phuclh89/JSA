import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { splitStatements } from './migration-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tables = [
  'SYS_SITE',
  'SYS_RIG',
  'SYS_DEPARTMENT',
  'SYS_SITE_SEQUENCE_RANGE',
  'SYS_USER',
  'SYS_ROLE',
  'SYS_PERMISSION',
  'SYS_USER_ROLE',
  'SYS_ROLE_PERMISSION',
  'SYS_USER_PERMISSION_OVERRIDE',
  'SYS_USER_DATA_SCOPE',
];

describe('Phase 1 Oracle schema scripts', () => {
  it('creates every required table and sequence with NUMBER(19) primary IDs', async () => {
    const sql = await readFile(
      path.join(root, 'migrations/002_create_security_foundation.sql'),
      'utf8',
    );
    for (const table of tables) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE ${table} \\(`));
      expect(sql).toMatch(
        new RegExp(
          `CONSTRAINT PK_${table.replace('SYS_SITE_SEQUENCE_RANGE', 'SYS_SITE_SEQ_RANGE').replace('SYS_USER_PERMISSION_OVERRIDE', 'SYS_USER_PERM_OVERRIDE')} PRIMARY KEY`,
        ),
      );
    }
    expect(sql.match(/CREATE SEQUENCE SEQ_/g) ?? []).toHaveLength(11);
    expect(sql).not.toMatch(/MAX\s*\(\s*ID\s*\)\s*\+\s*1/i);
    expect(splitStatements(sql)).toHaveLength(34);
  });

  it('rolls back only Phase 1 objects in dependency order', async () => {
    const sql = await readFile(
      path.join(root, 'rollback/002_rollback_create_security_foundation.sql'),
      'utf8',
    );
    expect(sql).not.toContain('JSA_SCHEMA_VERSION');
    const statements = splitStatements(sql);
    const indexOf = (statement: string) =>
      statements.findIndex((item) => item.startsWith(statement));
    expect(indexOf('DROP TABLE SYS_USER_DATA_SCOPE ')).toBeLessThan(
      indexOf('DROP TABLE SYS_USER '),
    );
    expect(indexOf('DROP TABLE SYS_USER ')).toBeLessThan(indexOf('DROP TABLE SYS_SITE '));
    expect(sql.match(/DROP TABLE SYS_/g) ?? []).toHaveLength(11);
    expect(sql.match(/DROP SEQUENCE SEQ_/g) ?? []).toHaveLength(11);
  });

  it('contains active-assignment, override, hierarchy, and range constraints', async () => {
    const sql = await readFile(
      path.join(root, 'migrations/002_create_security_foundation.sql'),
      'utf8',
    );
    expect(sql).toContain("EFFECT_CODE IN ('ALLOW', 'DENY')");
    expect(sql).toContain('RANGE_START <= RANGE_END');
    expect(sql).toContain("SCOPE_TYPE IN ('SITE', 'RIG', 'DEPARTMENT')");
    expect(sql).toContain('UX_SYS_USER_ROLE_ACTIVE');
    expect(sql).toContain('FK_SYS_USER_SCOPE_RIG');
    expect(sql).toContain('FK_SYS_USER_SCOPE_DEPT');
    const namingSql = await readFile(
      path.join(root, 'migrations/003_align_security_index_names.sql'),
      'utf8',
    );
    expect(namingSql.match(/RENAME TO IX_/g)).toHaveLength(4);
  });
});
