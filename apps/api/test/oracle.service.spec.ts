import oracledb from 'oracledb';
import { OracleService } from '../src/common/oracle/oracle.service';
import { resetOracleClientForTests } from '../src/common/oracle/oracle-client';

describe('OracleService transactions', () => {
  const connection = {
    execute: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    close: jest.fn(),
  };
  const pool = { getConnection: jest.fn().mockResolvedValue(connection), close: jest.fn() };
  const config = {
    get: jest.fn((key: string) => (key === 'oracle.clientLibDir' ? undefined : undefined)),
    getOrThrow: jest.fn(
      (key: string) =>
        ({
          'oracle.user': 'u',
          'oracle.clientMode': 'thin',
          'oracle.clientLibDir': undefined,
          'oracle.password': 'p',
          'oracle.connectString': 'c',
          'oracle.poolMin': 0,
          'oracle.poolMax': 2,
          'oracle.poolIncrement': 1,
          'oracle.poolTimeout': 60,
          'oracle.queueTimeout': 1000,
          'oracle.stmtCacheSize': 10,
          'oracle.enableEvents': false,
        })[key],
    ),
  };
  const logger = { log: jest.fn(), error: jest.fn() };
  let service: OracleService;
  beforeEach(async () => {
    jest.clearAllMocks();
    resetOracleClientForTests();
    jest.spyOn(oracledb, 'createPool').mockResolvedValue(pool as never);
    service = new OracleService(config as never, logger as never);
    await service.onModuleInit();
  });
  afterEach(() => jest.restoreAllMocks());

  it('commits and releases on success', async () => {
    await expect(service.withTransaction(async () => 'ok')).resolves.toBe('ok');
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });
  it('rolls back and releases on failure', async () => {
    await expect(
      service.withTransaction(async () => {
        throw new Error('failure');
      }),
    ).rejects.toThrow('failure');
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });
  it('retains the original transaction error when rollback also fails', async () => {
    connection.rollback.mockRejectedValueOnce(new Error('rollback failure'));
    await expect(
      service.withTransaction(async () => {
        throw new Error('original failure');
      }),
    ).rejects.toThrow('original failure');
    expect(connection.close).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
  it('releases after execute failure', async () => {
    connection.execute.mockRejectedValueOnce(new Error('failure'));
    await expect(service.execute('SELECT 1 AS RESULT FROM DUAL')).rejects.toThrow();
    expect(connection.close).toHaveBeenCalled();
  });
  it('closes the pool during shutdown', async () => {
    await service.onApplicationShutdown();
    expect(pool.close).toHaveBeenCalledWith(10);
  });
});
