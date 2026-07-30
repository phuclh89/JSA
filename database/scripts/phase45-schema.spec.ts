import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'migrations/007_create_access_administration.sql'),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(root, 'rollback/007_rollback_create_access_administration.sql'),
  'utf8',
);

describe('Phase 4.5 access administration schema', () => {
  it('adds append-only audit and historical workflow snapshots', () => {
    expect(migration).toContain('CREATE TABLE SYS_ACCESS_ADMIN_AUDIT');
    expect(migration).toContain('CREATE SEQUENCE SEQ_SYS_ACCESS_ADMIN_AUDIT');
    expect(migration).toContain('TRG_SYS_ACCESS_AUDIT_IMMUTABLE');
    expect(migration).toContain('STEP_CODE_SNAPSHOT');
    expect(migration).toContain('ASSIGNEE_USERNAME_SNAPSHOT');
    expect(migration).toContain('ACTOR_DISPLAY_NAME_SNAPSHOT');
    expect(migration).not.toMatch(/MAX\s*\(/i);
    expect(migration).not.toMatch(/PASSWORD/i);
  });

  it('rolls back only Phase 4.5 additions', () => {
    expect(rollback).toContain('DROP TABLE SYS_ACCESS_ADMIN_AUDIT');
    expect(rollback).toContain('DROP SEQUENCE SEQ_SYS_ACCESS_ADMIN_AUDIT');
    expect(rollback).toContain('ALTER TABLE JSA_WORKFLOW_TASK DROP COLUMN STEP_CODE_SNAPSHOT');
    expect(rollback).not.toContain('DROP TABLE SYS_USER');
    expect(rollback).not.toContain('DROP TABLE JSA_WORKFLOW_TASK');
  });
});
