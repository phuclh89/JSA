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
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#163300',
          colorLink: '#163300',
          colorText: '#0e0f0c',
          colorTextSecondary: '#454745',
          colorBgLayout: '#f5f7f3',
          colorBorder: 'rgba(14, 15, 12, 0.12)',
          borderRadius: 16,
          fontFamily: 'Inter, Helvetica, Arial, sans-serif',
          fontWeightStrong: 600,
        },
        components: {
          Button: {
            borderRadius: 9999,
            colorPrimary: '#9fe870',
            primaryColor: '#163300',
          },
          Card: { borderRadiusLG: 30 },
          Menu: {
            itemBorderRadius: 16,
            itemSelectedBg: '#e2f6d5',
            itemSelectedColor: '#163300',
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>{children}</BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
