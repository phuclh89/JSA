import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/016_create_user_favorites_and_browse_indexes.sql', import.meta.url),
  'utf8',
);
const rollback = readFileSync(
  new URL('../rollback/016_rollback_user_favorites_and_browse_indexes.sql', import.meta.url),
  'utf8',
);
const bootstrap = readFileSync(new URL('./bootstrap-phase6.ts', import.meta.url), 'utf8');

describe('Phase 6 schema migration', () => {
  it('creates one soft-state favorite row per User and JSA Master', () => {
    expect(migration).toContain('CREATE TABLE JSA_USER_FAVORITE');
    expect(migration).toContain('FAVORITE_ID NUMBER(19)');
    expect(migration).toContain('CONSTRAINT UK_JSA_USER_FAVORITE UNIQUE (USER_ID,JSA_ID)');
    expect(migration).toContain("IS_ACTIVE='N' AND UNFAVORITED_AT IS NOT NULL");
    expect(migration).not.toContain('JSA_PERMISSION_FAVORITE');
  });

  it('uses an explicit sequence, governed indexes, rollback, and sequence-only bootstrap', () => {
    expect(migration).toContain('CREATE SEQUENCE SEQ_JSA_USER_FAVORITE');
    expect(migration).toContain('IX_JSA_FAVORITE_USER_ACTIVE');
    expect(migration).toContain('IX_JSA_VERSION_BROWSE_STATE');
    expect(rollback).toContain('DROP TABLE JSA_USER_FAVORITE');
    expect(rollback).toContain('DROP SEQUENCE SEQ_JSA_USER_FAVORITE');
    expect(bootstrap).toContain("const sequence = 'SEQ_JSA_USER_FAVORITE'");
    expect(bootstrap).toContain('SYS_SITE_SEQUENCE_RANGE');
  });
});
