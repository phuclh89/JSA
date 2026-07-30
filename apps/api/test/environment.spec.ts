import { validateEnvironment } from '../src/config/environment';

const valid = {
  ORACLE_USER: 'user',
  ORACLE_PASSWORD: 'password',
  ORACLE_CONNECT_STRING: 'db/service',
};
describe('environment validation', () => {
  it('accepts valid values and coerces pool settings', () => {
    expect(validateEnvironment({ ...valid, ORACLE_POOL_MAX: '4' }).ORACLE_POOL_MAX).toBe(4);
  });
  it('rejects missing Oracle configuration', () => {
    expect(() => validateEnvironment({})).toThrow('ORACLE_USER');
  });
  it('rejects development authentication in production', () => {
    expect(() =>
      validateEnvironment({ ...valid, NODE_ENV: 'production', AUTH_MODE: 'development' }),
    ).toThrow('forbidden');
  });
  it('requires a client directory in Thick mode', () => {
    expect(() => validateEnvironment({ ...valid, ORACLE_CLIENT_MODE: 'thick' })).toThrow(
      'ORACLE_CLIENT_LIB_DIR',
    );
  });
  it('requires encrypted LDAP and secure session cookies in production', () => {
    expect(() =>
      validateEnvironment({
        ...valid,
        NODE_ENV: 'production',
        AUTH_MODE: 'ldap',
        LDAP_HOST: 'directory.internal',
        LDAP_BIND_DN: 'CN=reader,DC=example,DC=test',
        LDAP_BIND_PASSWORD: 'secret',
        LDAP_SEARCH_BASE: 'DC=example,DC=test',
        LDAP_TLS_MODE: 'NONE',
        AUTH_SESSION_SECRET: 'a-secure-session-secret-with-32-characters',
        JSA_PERMISSION_SUBMIT: 'A',
        JSA_PERMISSION_APPROVE: 'B',
        JSA_PERMISSION_RETURN: 'C',
        JSA_PERMISSION_REJECT: 'D',
        JSA_PERMISSION_COMMENT: 'E',
        JSA_PERMISSION_WORKFLOW_VIEW: 'F',
        JSA_PERMISSION_WORKFLOW_ADMIN: 'G',
      }),
    ).toThrow('unencrypted LDAP is forbidden');
  });

  it('accepts complete LDAP configuration', () => {
    expect(
      validateEnvironment({
        ...valid,
        AUTH_MODE: 'ldap',
        LDAP_HOST: 'directory.internal',
        LDAP_BIND_DN: 'CN=reader,DC=example,DC=test',
        LDAP_BIND_PASSWORD: 'secret',
        LDAP_SEARCH_BASE: 'DC=example,DC=test',
        AUTH_SESSION_SECRET: 'a-secure-session-secret-with-32-characters',
      }).AUTH_MODE,
    ).toBe('ldap');
  });

  it('accepts direct bind without service-account credentials', () => {
    const environment = validateEnvironment({
      ...valid,
      AUTH_MODE: 'ldap',
      LDAP_AUTH_STRATEGY: 'DIRECT_BIND',
      LDAP_HOST: 'directory.internal',
      LDAP_SEARCH_BASE: 'DC=example,DC=test',
      AUTH_SESSION_SECRET: 'a-secure-session-secret-with-32-characters',
    });
    expect(environment.LDAP_AUTH_STRATEGY).toBe('DIRECT_BIND');
  });

  it('rejects legacy LDAP TLS compatibility in production', () => {
    expect(() =>
      validateEnvironment({
        ...valid,
        NODE_ENV: 'production',
        AUTH_MODE: 'ldap',
        LDAP_HOST: 'directory.internal',
        LDAP_BIND_DN: 'CN=reader,DC=example,DC=test',
        LDAP_BIND_PASSWORD: 'secret',
        LDAP_SEARCH_BASE: 'DC=example,DC=test',
        LDAP_TLS_MODE: 'LDAPS',
        LDAP_TLS_LEGACY_COMPATIBILITY: 'true',
        AUTH_SESSION_SECRET: 'a-secure-session-secret-with-32-characters',
        AUTH_SESSION_COOKIE_SECURE: 'true',
        JSA_PERMISSION_SUBMIT: 'A',
        JSA_PERMISSION_APPROVE: 'B',
        JSA_PERMISSION_RETURN: 'C',
        JSA_PERMISSION_REJECT: 'D',
        JSA_PERMISSION_COMMENT: 'E',
        JSA_PERMISSION_WORKFLOW_VIEW: 'F',
        JSA_PERMISSION_WORKFLOW_ADMIN: 'G',
      }),
    ).toThrow('legacy insecure LDAP TLS compatibility is forbidden');
  });
});
