import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

function Probe() {
  const auth = useAuth();
  return (
    <div>
      {auth.status}:{auth.user?.username}
    </div>
  );
}

describe('session bootstrap', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('loads the authenticated application user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          userId: '1',
          enterpriseIdentityKey: 'oid',
          username: 'user',
          displayName: 'User',
          roles: [],
          permissions: [],
          permissionOverrides: [],
          dataScopes: [],
          authentication: { mode: 'oidc' },
        }),
      }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('loading:')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('authenticated:user')).toBeInTheDocument());
  });

  it.each([
    ['APPLICATION_USER_NOT_REGISTERED', 'unregistered'],
    ['APPLICATION_USER_INACTIVE', 'inactive'],
  ])('maps %s to %s', async (code, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({
          success: false,
          error: { code, message: 'Denied', details: [] },
          correlationId: 'c1',
        }),
      }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText(`${expected}:`)).toBeInTheDocument());
  });
});
