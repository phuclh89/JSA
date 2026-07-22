import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';
import { AppProviders } from './app/providers/app-providers';

const user = (permissions: string[]) => ({
  userId: '1',
  enterpriseIdentityKey: 'admin',
  username: 'admin',
  displayName: 'Administrator',
  roles: [],
  permissions,
  permissionOverrides: [],
  dataScopes: [],
  authentication: { mode: 'development' },
});

it('renders the application shell', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          input.includes('/auth/me')
            ? user(['SYSTEM_HEALTH_VIEW', 'SYSTEM_ADMIN'])
            : {
                status: 'ok',
                service: 'jsams-api',
                environment: 'test',
                timestamp: new Date().toISOString(),
                checks: { application: { status: 'up' }, oracle: { status: 'up', durationMs: 1 } },
              },
      }),
    ),
  );
  history.pushState({}, '', '/system/health');
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'System Health' })).toBeInTheDocument(),
  );
  expect(screen.getByText('JSAMS')).toBeInTheDocument();
});

it('hides forbidden navigation and denies a direct route', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => user(['SYSTEM_HEALTH_VIEW']),
    }),
  );
  history.pushState({}, '', '/operations/security');
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
  await waitFor(() => expect(screen.getByText('Access Denied')).toBeInTheDocument());
  expect(screen.queryByText('Security Administration')).not.toBeInTheDocument();
});
