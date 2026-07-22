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
});
