import { DashboardOutlined, SafetyCertificateOutlined, SettingOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface NavigationItem {
  key: string;
  label: string;
  permission: string;
  area: 'browse' | 'operations';
  icon: ReactNode;
}

export const navigationItems: NavigationItem[] = [
  {
    key: '/browse',
    label: 'Browse Home',
    permission: 'SYSTEM_HEALTH_VIEW',
    area: 'browse',
    icon: <DashboardOutlined />,
  },
  {
    key: '/system/health',
    label: 'System Health',
    permission: 'SYSTEM_HEALTH_VIEW',
    area: 'browse',
    icon: <SafetyCertificateOutlined />,
  },
  {
    key: '/operations/security',
    label: 'Security Administration',
    permission: 'SYSTEM_ADMIN',
    area: 'operations',
    icon: <SettingOutlined />,
  },
];
