import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/017_create_jsa_copy_provenance.sql', import.meta.url),
  'utf8',
);
const rollback = readFileSync(
  new URL('../rollback/017_rollback_jsa_copy_provenance.sql', import.meta.url),
  'utf8',
);
const bootstrap = readFileSync(new URL('./bootstrap-phase6c.ts', import.meta.url), 'utf8');

describe('Phase 6C schema migration', () => {
  it('creates immutable, one-to-one copy provenance with persisted idempotency', () => {
    expect(migration).toContain('CREATE TABLE JSA_COPY_PROVENANCE');
    expect(migration).toContain('COPY_PROVENANCE_ID NUMBER(19)');
    expect(migration).toContain('CONSTRAINT UK_JSA_COPY_DESTINATION UNIQUE (DESTINATION_JSA_ID)');
    expect(migration).toContain(
      'CONSTRAINT UK_JSA_COPY_REQUEST UNIQUE (COPIED_BY_USER_ID,REQUEST_KEY)',
    );
    expect(migration).toContain('FOREIGN KEY (SOURCE_VERSION_ID,SOURCE_JSA_ID)');
    expect(migration).toContain('FOREIGN KEY (DESTINATION_VERSION_ID,DESTINATION_JSA_ID)');
    expect(migration).toContain('TRG_JSA_COPY_PROV_IMMUTABLE');
    expect(migration).not.toMatch(/MAX\s*\(/i);
  });

  it('uses a Site-ranged sequence and a fail-closed rollback', () => {
    expect(migration).toContain('CREATE SEQUENCE SEQ_JSA_COPY_PROVENANCE');
    expect(bootstrap).toContain("const sequence = 'SEQ_JSA_COPY_PROVENANCE'");
    expect(bootstrap).toContain('SYS_SITE_SEQUENCE_RANGE');
    expect(rollback).toContain('Rollback 017 refused');
    expect(rollback).toContain("SEQUENCE_CODE='SEQ_JSA_COPY_PROVENANCE'");
    expect(rollback).toContain('DROP TABLE JSA_COPY_PROVENANCE');
  });
});
