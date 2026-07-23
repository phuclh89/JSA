import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tables = [
  'JSA_WORKFLOW_DEFINITION',
  'JSA_WORKFLOW_STEP',
  'JSA_WORKFLOW_BINDING',
  'JSA_WF_ROLE_ASSIGNMENT',
  'JSA_WORKFLOW_INSTANCE',
  'JSA_WORKFLOW_TASK',
  'JSA_WORKFLOW_ACTION',
  'SYS_NOTIFICATION',
  'SYS_NOTIFICATION_OUTBOX',
];
describe('Phase 4 approval workflow schema', () => {
  it('creates governed workflow, audit and outbox objects without speculative seeds', async () => {
    const sql = await readFile(
      path.join(root, 'migrations/006_create_approval_workflow.sql'),
      'utf8',
    );
    for (const table of tables) expect(sql).toContain(`CREATE TABLE ${table} (`);
    expect(sql.match(/CREATE SEQUENCE SEQ_/g) ?? []).toHaveLength(9);
    expect(sql).not.toMatch(/MAX\s*\(/i);
    expect(sql).not.toContain('INSERT INTO');
  });
  it('supports lifecycle states and immutable publication metadata', async () => {
    const sql = await readFile(
      path.join(root, 'migrations/006_create_approval_workflow.sql'),
      'utf8',
    );
    for (const state of [
      'DEPARTMENT_HEAD_REVIEW',
      'STC_REVIEW',
      'OIM_REVIEW',
      'RIG_MANAGER_REVIEW',
      'RETURNED',
      'REJECTED',
      'PUBLISHED',
    ])
      expect(sql).toContain(`'${state}'`);
    expect(sql).toContain('CHK_JSA_VER_PUBLISHED');
    expect(sql).toContain('UK_JSA_WF_INST_VERSION');
  });
  it('hard-blocks Published parent and snapshot child mutations', async () => {
    const sql = await readFile(
      path.join(root, 'migrations/006_create_approval_workflow.sql'),
      'utf8',
    );
    expect(sql).toContain('JSA_ASSERT_VERSION_MUTABLE');
    expect(sql.match(/CREATE OR REPLACE TRIGGER TRG_JSA_/g) ?? []).toHaveLength(12);
    expect(sql).toContain('Published JSA Version is immutable');
  });
  it('has a dependency-ordered Phase 4-only rollback', async () => {
    const sql = await readFile(
      path.join(root, 'rollback/006_rollback_create_approval_workflow.sql'),
      'utf8',
    );
    expect(sql.match(/DROP TABLE /g) ?? []).toHaveLength(9);
    expect(sql.match(/DROP SEQUENCE /g) ?? []).toHaveLength(9);
    expect(sql.indexOf('DROP TABLE JSA_WORKFLOW_TASK')).toBeLessThan(
      sql.indexOf('DROP TABLE JSA_WORKFLOW_INSTANCE'),
    );
    expect(sql).not.toContain('DROP TABLE JSA_VERSION');
  });
});
