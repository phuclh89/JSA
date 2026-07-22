import { DevelopmentAuthGuard } from '../src/common/auth/development-auth.guard';
import { PermissionGuard } from '../src/common/auth/permission.guard';
describe('authorization foundation', () => {
  function context(userHeader = 'admin', user?: unknown) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ header: () => userHeader, user }) }),
      getHandler: () => 'handler',
      getClass: () => 'class',
    };
  }
  it('authenticates a configured development user', () => {
    const guard = new DevelopmentAuthGuard({
      get: (key: string) => (key === 'auth.mode' ? 'development' : 'development'),
    } as never);
    expect(guard.canActivate(context() as never)).toBe(true);
  });
  it('disables development authentication in production', () => {
    const guard = new DevelopmentAuthGuard({
      get: (key: string) => (key === 'auth.mode' ? 'development' : 'production'),
    } as never);
    expect(() => guard.canActivate(context() as never)).toThrow('Authentication');
  });
  it('allows a required permission', () => {
    const reflector = { getAllAndOverride: () => ['SYSTEM_HEALTH_VIEW'] };
    const guard = new PermissionGuard(reflector as never);
    expect(guard.canActivate(context('', { permissions: ['SYSTEM_HEALTH_VIEW'] }) as never)).toBe(
      true,
    );
  });
  it('rejects a missing permission', () => {
    const reflector = { getAllAndOverride: () => ['SYSTEM_ADMIN'] };
    const guard = new PermissionGuard(reflector as never);
    expect(() => guard.canActivate(context('', { permissions: [] }) as never)).toThrow(
      'Permission',
    );
  });
});
