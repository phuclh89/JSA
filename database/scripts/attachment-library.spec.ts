import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'migrations/012_create_attachment_library.sql'),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(root, 'rollback/012_rollback_create_attachment_library.sql'),
  'utf8',
);

describe('Attachment Library schema', () => {
  it('stores folders, logical assets, and immutable file versions outside Oracle', () => {
    expect(migration).toContain('CREATE TABLE JSA_ATTACHMENT_FOLDER');
    expect(migration).toContain('CREATE TABLE JSA_ATTACHMENT_ASSET');
    expect(migration).toContain('CREATE TABLE JSA_ATTACHMENT_ASSET_VERSION');
    expect(migration).toContain('CONTENT_SHA256');
    expect(migration).toContain('STORAGE_KEY');
    expect(migration).not.toMatch(/\bBLOB\b/i);
  });

  it('links JSA version snapshots to exact library versions', () => {
    expect(migration).toContain('LIBRARY_ASSET_VERSION_ID');
    expect(migration).toContain('FK_JSA_VER_ATTACH_LIBRARY');
    expect(migration).toContain('ATTACHMENT_LIBRARY_ADMIN');
  });

  it('provides a complete rollback', () => {
    for (const name of [
      'JSA_ATTACHMENT_ASSET_VERSION',
      'JSA_ATTACHMENT_ASSET',
      'JSA_ATTACHMENT_FOLDER',
    ])
      expect(rollback).toContain(`DROP TABLE ${name}`);
    expect(rollback).toContain('DROP COLUMN LIBRARY_ASSET_VERSION_ID');
  });
});
