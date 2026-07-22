import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import type { PropsWithChildren } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../features/auth/auth-context';
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1565c0', borderRadius: 4 } }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>{children}</BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
