import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/018_create_translation_management.sql', import.meta.url),
  'utf8',
);
const rollback = readFileSync(
  new URL('../rollback/018_rollback_translation_management.sql', import.meta.url),
  'utf8',
);
const publication = readFileSync(
  new URL(
    '../../apps/api/src/modules/jsa-workflow/infrastructure/oracle-jsa-workflow.repository.ts',
    import.meta.url,
  ),
  'utf8',
);

describe('Phase 7 Translation schema', () => {
  it('creates governed translation, segment, action, sequence, and immutable evidence objects', () => {
    expect(migration).toContain('CREATE TABLE JSA_TRANSLATION');
    expect(migration).toContain('CREATE TABLE JSA_TRANSLATION_SEGMENT');
    expect(migration).toContain('CREATE TABLE JSA_TRANSLATION_ACTION');
    expect(migration.match(/CREATE SEQUENCE SEQ_JSA_TRANSL/g)).toHaveLength(3);
    expect(migration).toContain('UK_JSA_TRANSL_SEG_IDENT');
    expect(migration).toContain('JSA_ASSERT_TRANSL_MUTABLE');
    expect(migration).toContain('TRG_JSA_TRANSL_ACTION_IMMUT');
    expect(migration).not.toMatch(/MAX\s*\(/i);
  });

  it('models the exact approved lifecycle without reject or cancel', () => {
    for (const status of [
      'ASSIGNED',
      'IN_TRANSLATION',
      'STC_REVIEW',
      'RETURNED',
      'PUBLISHED',
      'OUTDATED',
    ])
      expect(migration).toContain(`'${status}'`);
    expect(migration).not.toMatch(/TRANSLATION_STATUS[^;]+REJECTED/is);
    expect(migration).not.toMatch(/TRANSLATION_STATUS[^;]+CANCELLED/is);
  });

  it('integrates replacement publication and fails closed on rollback with history', () => {
    expect(publication).toContain('outdateTranslations');
    expect(publication).toContain("TRANSLATION_STATUS='OUTDATED'");
    expect(publication).toContain('REPLACEMENT_JSA_VERSION_ID');
    expect(rollback).toContain('Rollback 018 is blocked while Translation history exists');
  });
});
