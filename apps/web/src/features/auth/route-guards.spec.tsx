import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth-context';
import { PermissionRoute } from './route-guards';
it('renders a permitted route', () => {
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
  expect(screen.getByText('Permitted content')).toBeInTheDocument();
});
