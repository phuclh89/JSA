import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth-context';
import { PermissionRoute } from './route-guards';
it('renders a permitted route', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: '1',
        enterpriseIdentityKey: 'dev',
        username: 'admin',
        displayName: 'Admin',
        roles: ['SYSTEM_ADMIN'],
        permissions: ['SYSTEM_HEALTH_VIEW'],
        permissionOverrides: [],
        dataScopes: [],
        authentication: { mode: 'development' },
      }),
    }),
  );
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <PermissionRoute permission="SYSTEM_HEALTH_VIEW">
                <div>Permitted content</div>
              </PermissionRoute>
            }
          />
          <Route path="/access-denied" element={<div>Denied</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('Permitted content')).toBeInTheDocument());
});
