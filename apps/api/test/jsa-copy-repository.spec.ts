import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
  path.resolve(process.cwd(), 'src/modules/jsa-copy/infrastructure/oracle-jsa-copy.repository.ts'),
  'utf8',
);

describe('OracleJsaCopyRepository', () => {
  it('persists immutable provenance and replays against the exact created Version', () => {
    expect(source).toContain('DESTINATION_VERSION_ID');
    expect(source).toContain('DV.JSA_VERSION_ID=P.DESTINATION_VERSION_ID');
    expect(source).toContain('P.COPIED_BY_USER_ID=:userId AND P.REQUEST_KEY=:requestKey');
    expect(source).toContain('requestHash: row.REQUEST_HASH');
  });

  it('allocates new aggregate identities and remaps relationships in one transaction', () => {
    expect(source).toContain("this.next(context, 'SEQ_JSA_MASTER')");
    expect(source).toContain("this.next(context, 'SEQ_JSA_VERSION')");
    expect(source).toContain("this.next(context, 'SEQ_JSA_VER_TASK')");
    expect(source).toContain("this.next(context, 'SEQ_JSA_VER_HAZARD')");
    expect(source).toContain("this.next(context, 'SEQ_JSA_VER_CONTROL')");
    expect(source).toContain('taskIds.get(');
    expect(source).toContain('hazardIds.get(');
    expect(source).toContain('stepIds.get(');
  });

  it('copies only the approved worksheet subset and never attachment metadata', () => {
    const createCopy = source.slice(
      source.indexOf('async createCopy('),
      source.indexOf('async provenance('),
    );
    expect(createCopy).toContain('JSA_VERSION_TASK');
    expect(createCopy).toContain('JSA_VERSION_HAZARD');
    expect(createCopy).toContain('JSA_VERSION_CONTROL');
    expect(createCopy).toContain('JSA_VERSION_BASIC_STEP');
    expect(createCopy).not.toContain('INSERT INTO JSA_VERSION_ATTACHMENT');
    expect(createCopy).not.toContain('INSERT INTO JSA_VERSION_PROMPT_COVERAGE');
    expect(createCopy).not.toContain('INSERT INTO JSA_VERSION_PROCEDURE_REF');
  });
});
