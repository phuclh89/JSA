import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { HealthPage } from './health-page';
import { TestWrapper } from '../../test/test-wrapper';
describe('HealthPage', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('shows loading then successful statuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          service: 'jsams-api',
          environment: 'test',
          timestamp: new Date().toISOString(),
          checks: { application: { status: 'up' }, oracle: { status: 'up', durationMs: 8 } },
        }),
      }),
    );
    render(<HealthPage />, { wrapper: TestWrapper });
    expect(screen.getByLabelText('Loading health status')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('8 ms')).toBeInTheDocument());
  });
  it('shows API failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Unavailable', details: [] },
          correlationId: 'c1',
        }),
      }),
    );
    render(<HealthPage />, { wrapper: TestWrapper });
    await waitFor(() => expect(screen.getByText('API health check failed')).toBeInTheDocument());
  });
  it('shows Oracle failure in a partial response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          status: 'degraded',
          service: 'jsams-api',
          environment: 'test',
          timestamp: new Date().toISOString(),
          checks: { application: { status: 'up' }, oracle: { status: 'down', durationMs: 2 } },
        }),
      }),
    );
    render(<HealthPage />, { wrapper: TestWrapper });
    await waitFor(() =>
      expect(screen.getByText('Some dependencies are unavailable')).toBeInTheDocument(),
    );
  });
});
