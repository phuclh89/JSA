import { EnterpriseAuthGuard } from '../src/common/auth/enterprise-auth.guard';
import { PermissionGuard } from '../src/common/auth/permission.guard';

describe('authorization foundation', () => {
  function context(userHeader = 'admin', user?: unknown) {
    const request = {
      header: (name: string) => (name === 'x-dev-user' ? userHeader : undefined),
      user,
    };
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => 'handler',
        getClass: () => 'class',
      },
    };
  }

  it('resolves a development enterprise identity through SYS_USER context', async () => {
    const resolved = { userId: '1', username: 'admin' };
    const users = { resolve: jest.fn().mockResolvedValue(resolved) };
    const guard = new EnterpriseAuthGuard(
      { getOrThrow: () => 'development', get: () => 'development' } as never,
      users as never,
      {} as never,
    );
    const target = context();
    await expect(guard.canActivate(target.context as never)).resolves.toBe(true);
    expect(users.resolve).toHaveBeenCalledWith({
      identityKey: 'admin',
      username: 'admin',
      mode: 'development',
    });
    expect(target.request.user).toBe(resolved);
  });

  it('disables development authentication in production', async () => {
    const guard = new EnterpriseAuthGuard(
      { getOrThrow: () => 'development', get: () => 'production' } as never,
      {} as never,
      {} as never,
    );
    await expect(guard.canActivate(context().context as never)).rejects.toThrow('Authentication');
  });

  it('validates OIDC claims and resolves the stable enterprise identity', async () => {
    const users = { resolve: jest.fn().mockResolvedValue({ userId: '2' }) };
    const tokens = {
      validate: jest.fn().mockResolvedValue({
        oid: 'stable-object-id',
        preferred_username: 'user@example.test',
        exp: 2_000_000_000,
      }),
    };
    const request = {
      header: (name: string) => (name === 'authorization' ? 'Bearer signed-token' : undefined),
    };
    const execution = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => 'handler',
      getClass: () => 'class',
    };
    const guard = new EnterpriseAuthGuard(
      { getOrThrow: () => 'oidc', get: () => 'production' } as never,
      users as never,
      tokens as never,
    );
    await expect(guard.canActivate(execution as never)).resolves.toBe(true);
    expect(tokens.validate).toHaveBeenCalledWith('signed-token');
    expect(users.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        identityKey: 'stable-object-id',
        username: 'user@example.test',
        mode: 'oidc',
      }),
    );
  });

  it('allows a required permission', async () => {
    const guard = new PermissionGuard({ getAllAndOverride: () => ['SYSTEM_HEALTH_VIEW'] } as never);
    await expect(
      guard.canActivate(context('', { permissions: ['SYSTEM_HEALTH_VIEW'] }).context as never),
    ).resolves.toBe(true);
  });

  it('rejects and audits a missing permission', async () => {
    const audit = { recordRequired: jest.fn().mockResolvedValue(undefined) };
    const guard = new PermissionGuard(
      { getAllAndOverride: () => ['SYSTEM_ADMIN'] } as never,
      audit as never,
    );
    await expect(
      guard.canActivate(
        context('', { userId: '1', username: 'user', permissions: [] }).context as never,
      ),
    ).rejects.toThrow('Access is denied');
    expect(audit.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: 'AUTHORIZATION_DENIED' }),
    );
  });
});
