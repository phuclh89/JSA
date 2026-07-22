import { createContext, useContext, type PropsWithChildren } from 'react';
import type { AuthenticatedUser } from '@jsams/shared-types';

const developmentUser: AuthenticatedUser = {
  userId: 'dev-admin',
  username: 'admin',
  displayName: 'Development Administrator',
  siteId: 'DEV',
  rigIds: [],
  departmentIds: [],
  roles: ['SYSTEM_ADMIN'],
  permissions: ['SYSTEM_HEALTH_VIEW', 'SYSTEM_ADMIN'],
};
const AuthContext = createContext<AuthenticatedUser | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  return (
    <AuthContext.Provider
      value={import.meta.env.VITE_AUTH_MODE === 'development' ? developmentUser : null}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useCurrentUser() {
  return useContext(AuthContext);
}
