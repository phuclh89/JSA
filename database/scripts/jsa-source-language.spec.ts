import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'migrations/010_default_jsa_source_to_english.sql'),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(root, 'rollback/010_rollback_default_jsa_source_to_english.sql'),
  'utf8',
);

describe('English source JSA and optional Job Type invariant', () => {
  it('fails closed unless exactly one active English language is configured', () => {
    expect(migration).toContain("UPPER(LANGUAGE_CODE)='EN'");
    expect(migration).toContain("IS_ACTIVE='Y'");
    expect(migration).toContain('IF V_ACTIVE_ENGLISH<>1');
    expect(migration).toContain('V_NON_ENGLISH_VERSIONS');
    expect(migration).toContain('V_PUBLISHED_WITHOUT_LANGUAGE');
  });

  it('makes Job Type optional, language mandatory, and enforces English', () => {
    expect(migration).toContain('ALTER TABLE JSA_VERSION MODIFY (JOB_TYPE_ID NULL)');
    expect(migration).toContain('ALTER TABLE JSA_VERSION MODIFY (LANGUAGE_ID NOT NULL)');
    expect(migration).toContain('TRG_JSA_VERSION_ENGLISH');
    expect(migration).toContain('Source JSA Version language must be the active English language');
  });

  it('blocks rollback while unclassified JSA Versions exist', () => {
    expect(rollback).toContain('WHERE JOB_TYPE_ID IS NULL');
    expect(rollback).toContain('IF V_WITHOUT_JOB_TYPE>0');
    expect(rollback).toContain('ALTER TABLE JSA_VERSION MODIFY (JOB_TYPE_ID NOT NULL)');
  });
});
