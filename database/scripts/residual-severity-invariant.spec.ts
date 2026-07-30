import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'migrations/009_enforce_matching_residual_severity.sql'),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(root, 'rollback/009_rollback_enforce_matching_residual_severity.sql'),
  'utf8',
);

describe('Initial and Residual Severity invariant', () => {
  it('fails closed for mismatched data and adds a matching-Severity constraint', () => {
    expect(migration).toContain('V_MISMATCHED_HAZARDS');
    expect(migration).toContain('RAISE_APPLICATION_ERROR');
    expect(migration).toContain('CHK_JSA_HAZ_RES_SEV_MATCH');
    expect(migration).toContain('INITIAL_SEVERITY_ID=RESIDUAL_SEVERITY_ID');
  });

  it('has a scoped rollback', () => {
    expect(rollback.trim()).toBe(
      'ALTER TABLE JSA_VERSION_HAZARD DROP CONSTRAINT CHK_JSA_HAZ_RES_SEV_MATCH;',
    );
  });
});
