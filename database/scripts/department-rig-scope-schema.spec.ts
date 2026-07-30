import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('migration 013 Department code scope', () => {
  it('moves Department code uniqueness from Site scope to Rig scope', async () => {
    const sql = (
      await readFile(
        new URL('../migrations/013_scope_department_codes_by_rig.sql', import.meta.url),
        'utf8',
      )
    ).toUpperCase();
    expect(sql).toContain('DROP CONSTRAINT UK_SYS_DEPT_SITE_CODE');
    expect(sql).toContain('CONSTRAINT UK_SYS_DEPT_RIG_CODE');
    expect(sql).toContain('UNIQUE (SITE_ID, RIG_ID, DEPARTMENT_CODE)');
  });

  it('provides an explicit rollback to the prior constraint', async () => {
    const sql = (
      await readFile(
        new URL('../rollback/013_rollback_scope_department_codes_by_rig.sql', import.meta.url),
        'utf8',
      )
    ).toUpperCase();
    expect(sql).toContain('DROP CONSTRAINT UK_SYS_DEPT_RIG_CODE');
    expect(sql).toContain('CONSTRAINT UK_SYS_DEPT_SITE_CODE');
    expect(sql).toContain('UNIQUE (SITE_ID, DEPARTMENT_CODE)');
  });
});
