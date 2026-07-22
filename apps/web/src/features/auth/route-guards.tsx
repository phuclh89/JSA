import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { useCurrentUser } from './auth-context';

export function AuthenticatedRoute({ children }: PropsWithChildren) {
  return useCurrentUser() ? children : <Navigate to="/access-denied" replace />;
}
export function PermissionRoute({
  permission,
  children,
}: PropsWithChildren<{ permission: string }>) {
  const user = useCurrentUser();
  return user?.permissions.includes(permission) ? (
    children
  ) : (
    <Navigate to="/access-denied" replace />
  );
}
