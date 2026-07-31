import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/019_allow_governed_official_jsa_revision.sql', import.meta.url),
  'utf8',
);
const rollback = readFileSync(
  new URL('../rollback/019_rollback_allow_governed_official_jsa_revision.sql', import.meta.url),
  'utf8',
);

describe('governed Official JSA revision migration', () => {
  it('allows only the next suffix during the terminal replacement publication transaction', () => {
    expect(migration).toContain("REGEXP_LIKE(:OLD.JSA_NUMBER,'\\.[0-9]+$')");
    expect(migration).toContain("V_CURRENT_REVISION := 0");
    expect(migration).toContain('V_CURRENT_REVISION + 1');
    expect(migration).toContain("C.VERSION_STATUS='PUBLISHED'");
    expect(migration).toContain("I.INSTANCE_STATUS='ACTIVE'");
    expect(migration).toContain("T.TASK_STATUS='PENDING'");
    expect(migration).toContain('V_PUBLICATION_COUNT<>1');
    expect(migration).toContain(
      'Official JSA number is immutable outside governed replacement publication',
    );
  });

  it('keeps number scope and status immutable and restores strict immutability on rollback', () => {
    expect(migration).toContain(':NEW.NUMBER_SCOPE_KEY<>:OLD.NUMBER_SCOPE_KEY');
    expect(migration).toContain(':NEW.NUMBER_STATUS<>:OLD.NUMBER_STATUS');
    expect(rollback).toContain(':NEW.JSA_NUMBER<>:OLD.JSA_NUMBER');
    expect(rollback).toContain("RAISE_APPLICATION_ERROR(-20068,'Official JSA number is immutable')");
  });
});
