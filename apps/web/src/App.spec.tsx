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
        json: async () => {
          if (input.includes('/auth/me')) return user(['SYSTEM_HEALTH_VIEW', 'SYSTEM_ADMIN']);
          if (input.includes('/jsa-drafts/capabilities')) {
            return { configured: true, view: true, create: true, edit: true, cancel: true };
          }
          if (input.includes('/jsa-drafts/options/rigs')) {
            return [
              {
                id: '2',
                code: 'DEV-RIG',
                name: 'Development Rig',
                siteId: '1',
              },
            ];
          }
          if (input.includes('/jsa-workflow/capabilities')) {
            return {
              configured: true,
              submit: true,
              approve: true,
              return: true,
              reject: true,
              comment: true,
              view: true,
              admin: true,
            };
          }
          if (input.includes('/jsa-workflow/navigation-counts')) {
            return { drafts: 2, approvals: 3, pending: 4, rejected: 0, published: 1 };
          }
          return {
            status: 'ok',
            service: 'jsams-api',
            environment: 'test',
            timestamp: new Date().toISOString(),
            checks: { application: { status: 'up' }, oracle: { status: 'up', durationMs: 1 } },
          };
        },
      }),
    ),
  );
  history.pushState({}, '', '/operations/system-health');
  render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'System Health' })).toBeInTheDocument(),
  );
  expect(screen.getByText('JSAMS')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'PV Drilling logo' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'JSA' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Administration' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await waitFor(() => expect(screen.getByText('Published JSA (1)')).toBeInTheDocument());
  expect(screen.queryByText('Browse Home')).not.toBeInTheDocument();
});

it('hides forbidden navigation and denies a direct route', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          input.includes('/jsa-drafts/options/rigs') ? [] : user(['SYSTEM_HEALTH_VIEW']),
      }),
    ),
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
