import { CorrelationIdMiddleware } from '../src/common/interceptors/correlation-id.middleware';
import { correlationContext } from '../src/common/interceptors/correlation-context';
describe('CorrelationIdMiddleware', () => {
  const middleware = new CorrelationIdMiddleware();
  function invoke(incoming?: string) {
    let header = '';
    let contextId = '';
    middleware.use(
      { header: () => incoming } as never,
      {
        setHeader: (_name: string, value: string) => {
          header = value;
        },
      } as never,
      () => {
        contextId = correlationContext.getStore()?.correlationId ?? '';
      },
    );
    return { header, contextId };
  }
  it('preserves an incoming ID', () => {
    expect(invoke('client-id')).toEqual({ header: 'client-id', contextId: 'client-id' });
  });
  it('generates and returns an ID', () => {
    const result = invoke();
    expect(result.header).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.contextId).toBe(result.header);
  });
});
