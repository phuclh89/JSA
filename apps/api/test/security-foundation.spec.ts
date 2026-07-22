import {
  ApplicationUserInactiveError,
  ApplicationUserNotRegisteredError,
} from '../src/common/errors/application-errors';
import { DataScopeService } from '../src/modules/security/application/data-scope.service';
import { effectivePermissions } from '../src/modules/security/application/permission-evaluator';
import { UserContextService } from '../src/modules/security/application/user-context.service';
import { DataScopeGuard } from '../src/common/auth/data-scope.guard';
import { SequenceRangeValidatorService } from '../src/modules/security/infrastructure/sequence-range-validator.service';

describe('Phase 1 security foundation', () => {
  it('applies DENY, then ALLOW, then role grant, then default deny precedence', () => {
    expect(
      effectivePermissions(
        ['ROLE_ONLY', 'DENIED'],
        [
          { permissionCode: 'ALLOWED', effect: 'ALLOW' },
          { permissionCode: 'DENIED', effect: 'DENY' },
        ],
      ),
    ).toEqual(['ALLOWED', 'ROLE_ONLY']);
    expect(effectivePermissions([], [])).toEqual([]);
  });

  it('resolves an active application user with string IDs and active assignments', async () => {
    const repository = {
      findUser: jest.fn().mockResolvedValue({
        userId: '9007199254740993',
        enterpriseIdentityKey: 'oid-1',
        username: 'user',
        displayName: 'User',
        defaultSiteId: '10000000000000001',
        active: true,
      }),
      loadAssignments: jest.fn().mockResolvedValue({
        roles: ['ADMIN'],
        rolePermissions: ['SYSTEM_ADMIN', 'DENIED'],
        overrides: [{ permissionCode: 'DENIED', effect: 'DENY' }],
        dataScopes: [
          { scopeType: 'SITE', siteId: '10000000000000001', canView: true, canAct: false },
        ],
      }),
    };
    const oracle = {
      withTransaction: (handler: (value: unknown) => unknown) => handler({ connection: {} }),
    };
    const user = await new UserContextService(oracle as never, repository as never).resolve({
      identityKey: 'oid-1',
      username: 'user',
      mode: 'oidc',
    });
    expect(user.userId).toBe('9007199254740993');
    expect(user.permissions).toEqual(['SYSTEM_ADMIN']);
    expect(user.dataScopes[0]?.siteId).toBe('10000000000000001');
  });

  it('denies unregistered and inactive application users', async () => {
    const oracle = {
      withTransaction: (handler: (value: unknown) => unknown) => handler({ connection: {} }),
    };
    const missing = new UserContextService(
      oracle as never,
      { findUser: async () => undefined } as never,
    );
    await expect(
      missing.resolve({ identityKey: 'x', username: 'x', mode: 'oidc' }),
    ).rejects.toBeInstanceOf(ApplicationUserNotRegisteredError);
    const inactive = new UserContextService(
      oracle as never,
      { findUser: async () => ({ userId: '1', active: false }) } as never,
    );
    await expect(
      inactive.resolve({ identityKey: 'x', username: 'x', mode: 'oidc' }),
    ).rejects.toBeInstanceOf(ApplicationUserInactiveError);
  });

  it('keeps view and action scope independent and honors hierarchy', () => {
    const service = new DataScopeService();
    const user = {
      dataScopes: [
        { scopeType: 'SITE', siteId: '1', canView: true, canAct: false },
        { scopeType: 'RIG', siteId: '2', rigId: '20', canView: true, canAct: true },
        {
          scopeType: 'DEPARTMENT',
          siteId: '2',
          rigId: '20',
          departmentId: '200',
          canView: true,
          canAct: true,
        },
      ],
    } as never;
    expect(service.allows(user, { scopeType: 'RIG', siteId: '1', rigId: '10' }, 'VIEW')).toBe(true);
    expect(service.allows(user, { scopeType: 'RIG', siteId: '1', rigId: '10' }, 'ACT')).toBe(false);
    expect(
      service.allows(
        user,
        { scopeType: 'DEPARTMENT', siteId: '2', rigId: '20', departmentId: '200' },
        'ACT',
      ),
    ).toBe(true);
    expect(
      service.allows(
        user,
        { scopeType: 'DEPARTMENT', siteId: '2', rigId: '21', departmentId: '200' },
        'ACT',
      ),
    ).toBe(false);
  });

  it('enforces a required route data scope server-side', () => {
    const reflector = {
      getAllAndOverride: () => ({
        scopeType: 'RIG',
        access: 'ACT',
        siteParameter: 'siteId',
        rigParameter: 'rigId',
      }),
    };
    const scopes = new DataScopeService();
    const guard = new DataScopeGuard(reflector as never, scopes);
    const context = (rigId: string) => ({
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({
        getRequest: () => ({
          params: { siteId: '2', rigId },
          user: {
            dataScopes: [
              { scopeType: 'RIG', siteId: '2', rigId: '20', canView: true, canAct: true },
            ],
          },
        }),
      }),
    });
    expect(guard.canActivate(context('20') as never)).toBe(true);
    expect(() => guard.canActivate(context('21') as never)).toThrow('requested data scope');
  });

  it('fails closed for overlapping or missing local sequence ranges', async () => {
    const config = { get: () => '1' };
    const overlapOracle = { execute: jest.fn().mockResolvedValue({ rows: [{ ITEM_COUNT: 1 }] }) };
    await expect(
      new SequenceRangeValidatorService(config as never, overlapOracle as never).onModuleInit(),
    ).rejects.toThrow('overlap');
    const missingOracle = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ ITEM_COUNT: 0 }] })
        .mockResolvedValueOnce({ rows: [{ ITEM_COUNT: 1 }] }),
    };
    await expect(
      new SequenceRangeValidatorService(config as never, missingOracle as never).onModuleInit(),
    ).rejects.toThrow('missing a valid configured site range');
  });
});
