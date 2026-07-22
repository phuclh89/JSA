import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../components/layout/app-shell';
import { AccessDeniedPage, NotFoundPage } from '../../components/feedback/pages';
import { AuthenticatedRoute, PermissionRoute } from '../../features/auth/route-guards';
import { HealthPage } from '../../features/health/health-page';
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
        <Route index element={<Navigate to="/system/health" replace />} />
        <Route
          path="/system/health"
          element={
            <PermissionRoute permission="SYSTEM_HEALTH_VIEW">
              <HealthPage />
            </PermissionRoute>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
