import { AuthSessionService } from '../src/modules/security/application/auth-session.service';

const settings = {
  secret: 'test-session-secret-that-is-long-enough',
  ttlMinutes: 30,
  cookieName: 'jsams_session',
  secure: false,
};

describe('LDAP application session', () => {
  it('round-trips a signed HttpOnly session cookie', async () => {
    const config = {
      getOrThrow: () => settings,
      get: (key: string) => (key === 'auth.ldap.allowUsernameFallback' ? false : undefined),
    };
    const service = new AuthSessionService(config as never);
    const issued = await service.issue({
      identityKey: 'ad-object-guid:abc',
      username: 'user',
      displayName: 'User',
      email: 'user@example.test',
      mode: 'ldap',
    });
    expect(issued.cookie).toContain('HttpOnly');
    expect(issued.cookie).toContain('SameSite=Strict');
    await expect(service.verify(issued.cookie)).resolves.toEqual(
      expect.objectContaining({
        identityKey: 'ad-object-guid:abc',
        username: 'user',
        mode: 'ldap',
      }),
    );
  });

  it('rejects a missing or invalid session', async () => {
    const service = new AuthSessionService({
      getOrThrow: () => settings,
      get: () => false,
    } as never);
    await expect(service.verify(undefined)).rejects.toThrow('Authentication is required');
    await expect(service.verify('jsams_session=invalid')).rejects.toThrow(
      'Authentication is required',
    );
  });
});
