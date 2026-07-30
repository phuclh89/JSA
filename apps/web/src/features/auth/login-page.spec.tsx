import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './auth-context';
import { LoginPage } from './login-page';

describe('LDAP login page', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('submits enterprise credentials without storing them in the browser', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({
          success: false,
          error: { code: 'UNAUTHENTICATED', message: 'Authentication is required', details: [] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userId: '1',
          enterpriseIdentityKey: 'ad-object-guid:abc',
          username: 'user',
          displayName: 'User',
          roles: [],
          permissions: [],
          permissionOverrides: [],
          dataScopes: [],
          authentication: { mode: 'ldap' },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    const tester = userEvent.setup();
    expect(await screen.findByRole('img', { name: 'PV Drilling logo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText(/JSAMS never stores your password/i)).toBeInTheDocument();
    await tester.type(screen.getByLabelText('Network username'), 'user');
    await tester.type(screen.getByLabelText('Password'), 'secret-password');
    await tester.click(screen.getByRole('button', { name: 'Sign in to JSAMS' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'user', password: 'secret-password' }),
        credentials: 'include',
      }),
    );
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });
});
