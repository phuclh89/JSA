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
  login(username: string, password: string): Promise<void>;
  refresh(): Promise<void>;
  logout(): Promise<void>;
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
  const login = useCallback(async (username: string, password: string) => {
    setStatus('loading');
    try {
      const authenticated = await apiClient.post<
        AuthenticatedUser,
        { username: string; password: string }
      >('/auth/login', { username, password });
      setUser(authenticated);
      setStatus('authenticated');
    } catch (error) {
      setUser(null);
      if (error instanceof ApiClientError) {
        if (error.code === 'APPLICATION_USER_NOT_REGISTERED') setStatus('unregistered');
        else if (error.code === 'APPLICATION_USER_INACTIVE') setStatus('inactive');
        else if (error.status === 401) setStatus('unauthenticated');
        else setStatus('error');
      } else setStatus('error');
      throw error;
    }
  }, []);
  const logout = useCallback(async () => {
    try {
      await apiClient.postEmpty<void>('/auth/logout');
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);
  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      login,
      refresh,
      logout,
    }),
    [login, logout, refresh, status, user],
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
