import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'migrations/011_publish_official_jsa_number.sql'),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(root, 'rollback/011_rollback_publish_official_jsa_number.sql'),
  'utf8',
);

describe('Official JSA number invariant', () => {
  it('separates temporary and official numbers with a governed pair counter', () => {
    expect(migration).toContain("NUMBER_STATUS IN ('TEMPORARY','OFFICIAL')");
    expect(migration).toContain('CREATE TABLE JSA_NUMBER_COUNTER');
    expect(migration).toContain('PRIMARY KEY (RIG_ID,DEPARTMENT_ID)');
    expect(migration).toContain('LAST_NUMBER BETWEEN 0 AND 9999');
    expect(migration).not.toContain('MAX(');
  });

  it('makes an assigned official number immutable', () => {
    expect(migration).toContain('TRG_JSA_OFFICIAL_NUM_IMMUTABLE');
    expect(migration).toContain("IF :OLD.NUMBER_STATUS='OFFICIAL'");
    expect(migration).toContain(
      "RAISE_APPLICATION_ERROR(-20068,'Official JSA number is immutable')",
    );
  });

  it('rolls back only migration 011 objects', () => {
    expect(rollback).toContain('DROP TRIGGER TRG_JSA_OFFICIAL_NUM_IMMUTABLE');
    expect(rollback).toContain('DROP TABLE JSA_NUMBER_COUNTER');
    expect(rollback).toContain('DROP COLUMN NUMBER_STATUS');
  });
});
