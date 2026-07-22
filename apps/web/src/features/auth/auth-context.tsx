import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { ApiClientError, apiClient } from '../../services/api-client';

export type AuthStatus =
  'loading' | 'authenticated' | 'unauthenticated' | 'unregistered' | 'inactive' | 'error';

interface AuthState {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  refresh(): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      setUser(await apiClient.get<AuthenticatedUser>('/auth/me'));
      setStatus('authenticated');
    } catch (error) {
      setUser(null);
      if (error instanceof ApiClientError) {
        if (error.status === 401) setStatus('unauthenticated');
        else if (error.code === 'APPLICATION_USER_NOT_REGISTERED') setStatus('unregistered');
        else if (error.code === 'APPLICATION_USER_INACTIVE') setStatus('inactive');
        else setStatus('error');
      } else setStatus('error');
    }
  }, []);

  useEffect(() => void refresh(), [refresh]);
  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      refresh,
      logout: () => {
        setUser(null);
        setStatus('unauthenticated');
      },
    }),
    [refresh, status, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

export function useCurrentUser(): AuthenticatedUser | null {
  return useAuth().user;
}
