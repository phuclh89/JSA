import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../components/layout/app-shell';
import { AccessDeniedPage, NotFoundPage } from '../../components/feedback/pages';
import { AuthenticatedRoute, PermissionRoute } from '../../features/auth/route-guards';
import { HealthPage } from '../../features/health/health-page';
import { BrowseHomePage, SecurityFoundationPage } from '../../components/feedback/phase-one-pages';
export function AppRouter() {
  return (
    <Routes>
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route
        element={
          <AuthenticatedRoute>
            <AppShell />
          </AuthenticatedRoute>
        }
      >
        <Route index element={<Navigate to="/browse" replace />} />
        <Route
          path="/browse"
          element={
            <PermissionRoute permission="SYSTEM_HEALTH_VIEW">
              <BrowseHomePage />
            </PermissionRoute>
          }
        />
        <Route
          path="/system/health"
          element={
            <PermissionRoute permission="SYSTEM_HEALTH_VIEW">
              <HealthPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/operations/security"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <SecurityFoundationPage />
            </PermissionRoute>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
