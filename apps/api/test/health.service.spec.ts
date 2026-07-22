import { HealthService } from '../src/modules/health/health.service';
describe('HealthService', () => {
  const config = { get: jest.fn().mockReturnValue('test') };
  const logger = { error: jest.fn() };
  it('returns successful liveness without querying Oracle', () => {
    const oracle = { execute: jest.fn() };
    const result = new HealthService(config as never, oracle as never, logger as never).live();
    expect(result.checks.application.status).toBe('up');
    expect(oracle.execute).not.toHaveBeenCalled();
  });
  it('returns successful Oracle readiness', async () => {
    const oracle = { execute: jest.fn().mockResolvedValue({ rows: [{ RESULT: 1 }] }) };
    const result = await new HealthService(
      config as never,
      oracle as never,
      logger as never,
    ).ready();
    expect(result.status).toBe('ok');
    expect(oracle.execute).toHaveBeenCalledWith('SELECT 1 AS RESULT FROM DUAL');
  });
  it('reports and logs Oracle readiness failure', async () => {
    const oracle = { execute: jest.fn().mockRejectedValue(new Error('ORA-12541')) };
    const result = await new HealthService(
      config as never,
      oracle as never,
      logger as never,
    ).ready();
    expect(result.status).toBe('degraded');
    expect(result.checks.oracle?.status).toBe('down');
    expect(logger.error).toHaveBeenCalled();
  });
});
