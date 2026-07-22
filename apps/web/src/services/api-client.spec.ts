import { vi } from 'vitest';
import { ApiClient } from './api-client';
import type { ApiClientError } from './api-client';
it('maps standardized API errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid', details: ['x'] },
        correlationId: 'cid',
      }),
    }),
  );
  await expect(new ApiClient('http://api').get('/x')).rejects.toEqual(
    expect.objectContaining({
      status: 400,
      code: 'VALIDATION_ERROR',
      correlationId: 'cid',
    }) as Partial<ApiClientError>,
  );
});
