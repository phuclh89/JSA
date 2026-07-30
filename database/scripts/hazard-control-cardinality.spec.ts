import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'migrations/008_enforce_hazard_control_one_to_one.sql'),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(root, 'rollback/008_rollback_enforce_hazard_control_one_to_one.sql'),
  'utf8',
);

describe('Hazard-Control one-to-one invariant', () => {
  it('fails closed for existing duplicates and prevents multiple active Controls', () => {
    expect(migration).toContain('HAVING COUNT(*)>1');
    expect(migration).toContain('RAISE_APPLICATION_ERROR');
    expect(migration).toContain('CREATE UNIQUE INDEX UX_JSA_VER_CTL_ACTIVE_HAZ');
    expect(migration).toContain("CASE WHEN IS_ACTIVE='Y' THEN VERSION_HAZARD_ID END");
  });

  it('has a scoped rollback', () => {
    expect(rollback.trim()).toBe('DROP INDEX UX_JSA_VER_CTL_ACTIVE_HAZ;');
  });
});
