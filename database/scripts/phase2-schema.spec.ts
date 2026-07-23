import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tables = [
  'SYS_JOB_TYPE',
  'SYS_HAZARD_PROMPT',
  'SYS_POSITION',
  'SYS_TOOL_CATEGORY',
  'SYS_TOOL',
  'SYS_LANGUAGE',
  'SYS_PROCEDURE_REFERENCE',
  'SYS_SYSTEM_PARAMETER',
  'JSA_RISK_MATRIX',
  'JSA_RISK_MATRIX_VERSION',
  'JSA_RISK_LIKELIHOOD',
  'JSA_RISK_SEVERITY',
  'JSA_RISK_RESULT',
  'JSA_RISK_MATRIX_CELL',
  'JSA_RIG_MATRIX_ASSIGNMENT',
];

describe('Phase 2 Oracle schema scripts', () => {
  it('creates all master-data and Risk Matrix tables with table-specific sequences', async () => {
    const sql = await readFile(
      path.join(root, 'migrations/004_create_master_data_risk_matrix.sql'),
      'utf8',
    );
    for (const table of tables) expect(sql).toContain(`CREATE TABLE ${table} (`);
    expect(sql.match(/CREATE SEQUENCE SEQ_/g) ?? []).toHaveLength(15);
    expect(sql).not.toMatch(/MAX\s*\(/i);
    expect(sql).not.toContain('INSERT INTO');
  });
  it('keeps mixed codes textual and numeric values separate', async () => {
    const sql = await readFile(
      path.join(root, 'migrations/004_create_master_data_risk_matrix.sql'),
      'utf8',
    );
    expect(sql).toMatch(/LIKELIHOOD_CODE VARCHAR2/);
    expect(sql).toMatch(/SEVERITY_CODE VARCHAR2/);
    expect(sql).toMatch(/RATING_CODE VARCHAR2/);
    expect(sql).toMatch(/RESULT_CODE VARCHAR2/);
    expect(sql).toMatch(/NUMERIC_VALUE NUMBER/);
    expect(sql).toMatch(/RATING_VALUE NUMBER/);
    expect(sql).toContain('UK_JSA_RISK_CELL_PAIR');
    expect(sql).toContain('FK_JSA_RISK_CELL_LIK');
    expect(sql).toContain('FK_JSA_RISK_CELL_SEV');
    expect(sql).toContain('FK_JSA_RISK_CELL_RESULT');
    expect(sql).not.toMatch(/LIKELIHOOD.*\*.*SEVERITY/i);
  });
  it('defines scoped active uniqueness, hierarchy, dimensions, and effective periods', async () => {
    const sql = await readFile(
      path.join(root, 'migrations/004_create_master_data_risk_matrix.sql'),
      'utf8',
    );
    expect(sql).toContain('IX_SYS_POSITION_ACTIVE_CODE');
    expect(sql).toContain("SCOPE_TYPE='DEPARTMENT'");
    expect(sql).toContain('DIMENSION_SIZE IN (3,5)');
    expect(sql).toContain('EFFECTIVE_TO > EFFECTIVE_FROM');
    expect(sql).toContain('IX_JSA_RIG_MATRIX_PERIOD');
  });
  it('rolls back only Phase 2 objects in dependency order', async () => {
    const sql = await readFile(
      path.join(root, 'rollback/004_rollback_create_master_data_risk_matrix.sql'),
      'utf8',
    );
    expect(sql.match(/DROP TABLE /g) ?? []).toHaveLength(15);
    expect(sql.match(/DROP SEQUENCE /g) ?? []).toHaveLength(15);
    expect(sql).not.toContain('SYS_SITE CASCADE');
    expect(sql).not.toContain('JSA_SCHEMA_VERSION');
    expect(sql.indexOf('DROP TABLE JSA_RISK_MATRIX_CELL')).toBeLessThan(
      sql.indexOf('DROP TABLE JSA_RISK_MATRIX_VERSION'),
    );
    expect(sql.indexOf('DROP TABLE SYS_TOOL ')).toBeLessThan(
      sql.indexOf('DROP TABLE SYS_TOOL_CATEGORY'),
    );
  });
});
