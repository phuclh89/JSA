import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  correlationId: string;
  userId?: string;
}
export const correlationContext = new AsyncLocalStorage<RequestContext>();
