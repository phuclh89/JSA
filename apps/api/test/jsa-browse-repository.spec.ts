import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
  path.resolve(
    process.cwd(),
    'src/modules/jsa-browse/infrastructure/oracle-jsa-browse.repository.ts',
  ),
  'utf8',
);

describe('OracleJsaBrowseRepository search security', () => {
  it('binds user text, escapes wildcard input, allowlists ordering, and pages in Oracle', () => {
    expect(source).toContain('LIKE :searchPattern');
    expect(source).toContain("ESCAPE '\\\\'");
    expect(source).toContain("replace(/[\\\\%_]/g, '\\\\$&')");
    expect(source).toContain('OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY');
    expect(source).toContain('M.JSA_ID ${direction.toUpperCase()}');
    expect(source).not.toContain('ORDER BY ${query.sort}');
  });

  it('enforces data scope, current Published favorites, owner queues, and assignee queues', () => {
    expect(source).toContain('SYS_USER_DATA_SCOPE DS');
    expect(source).toContain("M.LIFECYCLE_STATUS='PUBLISHED'");
    expect(source).toContain("F.USER_ID=:userId AND F.JSA_ID=M.JSA_ID AND F.IS_ACTIVE='Y'");
    expect(source).toContain('NVL(M.CHECKED_OUT_BY_USER_ID,M.CREATOR_USER_ID)=:userId');
    expect(source).toContain("T.ASSIGNEE_USER_ID=:userId AND T.TASK_STATUS='PENDING'");
  });
});
