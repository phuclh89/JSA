import oracledb from 'oracledb';
import {
  initializeOracleClient,
  maskOracleTarget,
  oracleDiagnosticHint,
  oracleErrorCode,
  resetOracleClientForTests,
} from '../src/common/oracle/oracle-client';

describe('Oracle client runtime', () => {
  beforeEach(() => resetOracleClientForTests());
  afterEach(() => jest.restoreAllMocks());

  it('initializes Thin mode only once', () => {
    const log = jest.fn();
    initializeOracleClient({ clientMode: 'thin' }, log);
    initializeOracleClient({ clientMode: 'thin' }, log);
    expect(log).toHaveBeenCalledTimes(1);
    expect(oracledb.thin).toBeDefined();
  });
  it('maps nested Oracle errors to safe guidance', () => {
    const error = new Error('NJS-503: connection failed', { cause: new Error('ORA-12541') });
    expect(oracleErrorCode(error)).toBe('NJS-503');
    expect(oracleDiagnosticHint(error)).toContain('underlying');
  });
  it('does not misclassify application error codes as Oracle diagnostics', () => {
    expect(oracleErrorCode({ code: 'APPLICATION_USER_NOT_REGISTERED' })).toBeUndefined();
  });
  it('masks the service name', () => {
    expect(maskOracleTarget('172.16.10.186:1521/PDBAPPS')).toBe('172.16.10.186:1521/***');
  });
});
