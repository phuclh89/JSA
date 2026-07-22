import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';
import { AppProviders } from './app/providers/app-providers';
it('renders the application shell', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          service: 'jsams-api',
          environment: 'test',
          timestamp: new Date().toISOString(),
          checks: { application: { status: 'up' }, oracle: { status: 'up', durationMs: 1 } },
        }),
      }),
  );
  history.pushState({}, '', '/system/health');
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText('System Health')).toBeInTheDocument());
  expect(screen.getByText('JSAMS')).toBeInTheDocument();
});
