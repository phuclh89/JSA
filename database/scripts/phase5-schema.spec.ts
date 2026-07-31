import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/014_add_jsa_revision_lifecycle.sql', import.meta.url),
  'utf8',
);
const rollback = readFileSync(
  new URL('../rollback/014_rollback_add_jsa_revision_lifecycle.sql', import.meta.url),
  'utf8',
);
const hardening = readFileSync(
  new URL('../migrations/015_harden_jsa_revision_immutability.sql', import.meta.url),
  'utf8',
);

describe('Phase 5 schema migration', () => {
  it('adds governed checkout snapshots and Superseded immutability', () => {
    expect(migration).toContain('CHECKED_OUT_BY_USER_ID NUMBER(19)');
    expect(migration).toContain('CHECKED_OUT_BY_USERNAME');
    expect(migration).toContain("'SUPERSEDED'");
    expect(migration).toContain("V_STATUS IN ('PUBLISHED','SUPERSEDED')");
    expect(migration).toContain(":OLD.VERSION_STATUS='PUBLISHED'");
    expect(migration).toContain(":NEW.VERSION_STATUS<>'SUPERSEDED'");
  });

  it('adds lookup indexes and a guarded rollback', () => {
    expect(migration).toContain('IX_JSA_MASTER_CURRENT_WORKING');
    expect(migration).toContain('IX_JSA_VERSION_BASE');
    expect(rollback).toContain('Cannot roll back Phase 5 while Superseded versions exist');
    expect(rollback).toContain('DROP COLUMN CHECKED_OUT_BY_USER_ID');
  });

  it('hardens root audit evidence and recompiles procedure-dependent guards', () => {
    expect(hardening).toContain(':NEW.CREATED_AT<>:OLD.CREATED_AT');
    expect(hardening).toContain(':NEW.CREATED_BY<>:OLD.CREATED_BY');
    expect(hardening).toContain('ALTER TRIGGER TRG_JSA_ATTACH_IMMUTABLE COMPILE');
    expect(rollback).toContain('ALTER TRIGGER TRG_JSA_PROMPT_IMMUTABLE COMPILE');
  });
});
