import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tables=['JSA_MASTER','JSA_VERSION','JSA_VERSION_PROMPT','JSA_VERSION_PROMPT_COVERAGE','JSA_VERSION_TASK','JSA_VERSION_HAZARD','JSA_VERSION_CONTROL','JSA_VERSION_BASIC_STEP','JSA_VER_BASIC_STEP_PERFORMER','JSA_VER_BASIC_STEP_SUPERVISOR','JSA_VER_BASIC_STEP_TOOL','JSA_VERSION_PROCEDURE_REF','JSA_VERSION_ATTACHMENT'];
describe('Phase 3 Oracle draft schema',()=>{
  it('creates all version-owned tables and explicit sequences',async()=>{const sql=await readFile(path.join(root,'migrations/005_create_jsa_draft_core.sql'),'utf8');for(const table of tables)expect(sql).toContain(`CREATE TABLE ${table} (`);expect(sql.match(/CREATE SEQUENCE SEQ_/g)??[]).toHaveLength(14);expect(sql).not.toMatch(/MAX\s*\(/i);expect(sql).not.toContain('INSERT INTO SYS_PERMISSION');});
  it('enforces pointer, same-version, logical-key and snapshot rules',async()=>{const sql=await readFile(path.join(root,'migrations/005_create_jsa_draft_core.sql'),'utf8');expect(sql).toContain('FK_JSA_MASTER_WORKING_VER');expect(sql).toContain('UK_JSA_VER_HAZARD_LOG');expect(sql).toContain('FK_JSA_VER_CONTROL_HAZ');expect(sql).toContain('POSITION_CODE_SNAPSHOT');expect(sql).toContain('TOOL_CODE_SNAPSHOT');expect(sql).toContain('INITIAL_RATING_CODE VARCHAR2');expect(sql).toContain('RESIDUAL_RATING_CODE VARCHAR2');});
  it('has a dependency-ordered rollback for only Phase 3 objects',async()=>{const sql=await readFile(path.join(root,'rollback/005_rollback_create_jsa_draft_core.sql'),'utf8');expect(sql.match(/DROP TABLE /g)??[]).toHaveLength(13);expect(sql.match(/DROP SEQUENCE /g)??[]).toHaveLength(14);expect(sql.indexOf('DROP TABLE JSA_VERSION_CONTROL')).toBeLessThan(sql.indexOf('DROP TABLE JSA_VERSION_HAZARD'));expect(sql).not.toContain('DROP TABLE SYS_SITE');});
});
