import type { ConfigService } from '@nestjs/config';
import type { OracleService } from '../src/common/oracle/oracle.service';
import type { SecurityAuditService } from '../src/modules/security/application/security-audit.service';
import { JsaBrowseCapabilityService } from '../src/modules/jsa-browse/application/jsa-browse-capability.service';
import { JsaBrowseService } from '../src/modules/jsa-browse/application/jsa-browse.service';
import type { JsaBrowseRepository } from '../src/modules/jsa-browse/domain/jsa-browse.repository';

const user = {
  userId: '100',
  username: 'tester',
  displayName: 'Tester',
  permissions: ['JSA_VIEW', 'WORKFLOW_VIEW', 'JSA_FAVORITE'],
} as any;

function setup(overrides: Record<string, string | undefined> = {}) {
  const values = {
    JSA_PERMISSION_VIEW: 'JSA_VIEW',
    JSA_PERMISSION_WORKFLOW_VIEW: 'WORKFLOW_VIEW',
    JSA_PERMISSION_FAVORITE: 'JSA_FAVORITE',
    'app.siteId': '1000000',
    ...overrides,
  };
  const config = { get: jest.fn((key: string) => values[key as keyof typeof values]) } as any;
  const repository = {
    browse: jest.fn(async (_context, query) => ({
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      total: 0,
    })),
    favoriteCount: jest.fn(async () => 0),
    allCount: jest.fn(async () => 0),
    facets: jest.fn(async () => ({ sites: [], departments: [], matrixVersions: [] })),
    setFavorite: jest.fn(async () => true),
  } as unknown as jest.Mocked<JsaBrowseRepository>;
  const oracle = {
    withTransaction: jest.fn(async (handler: (context: any) => unknown) => handler({})),
  } as unknown as OracleService;
  const audit = { recordRequired: jest.fn(async () => undefined) } as unknown as SecurityAuditService;
  const capability = new JsaBrowseCapabilityService(config as ConfigService);
  const service = new JsaBrowseService(oracle, config, capability, audit, repository);
  return { service, repository, audit };
}

describe('JsaBrowseService', () => {
  it('normalizes an allowlisted paged search and escapes LIKE metacharacters', async () => {
    const { service, repository } = setup();
    await service.browse(
      {
        kind: 'all',
        keyword: '10%_\\ pump',
        searchField: 'HAZARD',
        page: '2',
        pageSize: '50',
        sort: 'jsaNumber',
        direction: 'asc',
      },
      user,
    );
    expect(repository.browse).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        kind: 'all',
        searchField: 'HAZARD',
        searchPattern: '%10\\%\\_\\\\ PUMP%',
        page: 2,
        pageSize: 50,
        sort: 'jsaNumber',
        direction: 'asc',
      }),
    );
  });

  it('rejects short broad searches, unknown fields, unbounded page sizes, and invalid IDs', async () => {
    const { service } = setup();
    await expect(service.browse({ kind: 'published', keyword: 'x' }, user)).rejects.toThrow(
      'at least 2',
    );
    await expect(
      service.browse({ kind: 'published', searchField: 'SQL_FRAGMENT' }, user),
    ).rejects.toThrow('Unknown JSA search field');
    await expect(
      service.browse({ kind: 'published', pageSize: '1000' }, user),
    ).rejects.toThrow('out of range');
    await expect(service.browse({ kind: 'published', rigId: '1 OR 1=1' }, user)).rejects.toThrow();
  });

  it('fails closed for Favorite permission mapping and audits only a changed mutation', async () => {
    const missing = setup({ JSA_PERMISSION_FAVORITE: undefined });
    await expect(missing.service.favorite('20', true, user)).rejects.toThrow('not configured');

    const configured = setup();
    await expect(configured.service.favorite('20', true, user)).resolves.toMatchObject({
      favorite: true,
      changed: true,
    });
    expect(configured.audit.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: 'JSA_FAVORITE', targetId: '20' }),
    );
  });
});
