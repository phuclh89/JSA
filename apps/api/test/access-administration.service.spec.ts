import { AccessAdministrationService } from '../src/modules/access-administration/application/access-administration.service';

describe('AccessAdministrationService pending workflow protection', () => {
  const actor = {
    userId: '1',
    enterpriseIdentityKey: 'admin-oid',
    username: 'admin',
    displayName: 'Administrator',
    defaultSiteId: '10',
    roles: ['SYSTEM_ADMIN'],
    permissions: ['SYSTEM_ADMIN'],
    permissionOverrides: [],
    dataScopes: [],
    authentication: { mode: 'development' as const },
  };
  const create = (tasks: unknown[]) => {
    const repository = {
      pendingImpact: jest.fn().mockResolvedValue(tasks),
      setUserActive: jest.fn().mockResolvedValue(undefined),
    };
    const oracle = { withTransaction: (work: any) => work({ connection: {} }) };
    const service = new AccessAdministrationService(
      oracle as never,
      repository as never,
      {} as never,
      {} as never,
      { loadAssignments: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    return { service, repository };
  };

  it('blocks deactivation before mutation when a pending task would be stranded', async () => {
    const { service, repository } = create([
      { TASK_ID: '99', JSA_NUMBER: 'JSA-001', STEP_NAME: 'OIM Review' },
    ]);
    await expect(
      service.userLifecycle('2', false, { rowVersion: '1', reason: 'Deactivate' }, actor),
    ).rejects.toMatchObject({ code: 'PENDING_WORKFLOW_IMPACT' });
    expect(repository.setUserActive).not.toHaveBeenCalled();
  });

  it('allows deactivation when no pending task is impacted', async () => {
    const { service, repository } = create([]);
    await expect(
      service.userLifecycle('2', false, { rowVersion: '1', reason: 'Deactivate' }, actor),
    ).resolves.toEqual({ id: '2', active: false });
    expect(repository.setUserActive).toHaveBeenCalledTimes(1);
  });
});
