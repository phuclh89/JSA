import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './auth-context';

export function AuthenticatedRoute({ children }: PropsWithChildren) {
  const auth = useAuth();
  if (auth.status === 'loading')
    return (
      <div className="session-loading">
        <Spin size="large" />
        <span>Loading session</span>
      </div>
    );
  if (auth.status !== 'authenticated') return <Navigate to="/login" replace />;
  return children;
}
export function PermissionRoute({
  permission,
  children,
}: PropsWithChildren<{ permission: string }>) {
  const auth = useAuth();
  if (auth.status === 'loading')
    return (
      <div className="session-loading">
        <Spin size="large" />
        <span>Loading session</span>
      </div>
    );
  const user = auth.user;
  return user?.permissions.includes(permission) ? (
    children
  ) : (
    <Navigate to="/access-denied" replace />
  );
}
