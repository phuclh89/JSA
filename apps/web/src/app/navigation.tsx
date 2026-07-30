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
  {
    key: '/operations/attachment-library',
    label: 'Attachment Library',
    permission: 'ATTACHMENT_LIBRARY_ADMIN',
    area: 'operations',
    icon: <SettingOutlined />,
  },
  ...(
    [
      ['/operations/job-types', 'Job Types'],
      ['/operations/rigs', 'Rigs'],
      ['/operations/departments', 'Departments'],
      ['/operations/hazard-prompts', 'Hazard Prompts'],
      ['/operations/positions', 'Positions'],
      ['/operations/tool-categories', 'Tool Categories'],
      ['/operations/tools', 'Tools'],
      ['/operations/languages', 'Languages'],
      ['/operations/procedure-references', 'Procedure References'],
      ['/operations/system-parameters', 'System Parameters'],
      ['/operations/risk-matrices', 'Risk Matrices'],
      ['/operations/rig-matrix-assignments', 'Rig Matrix Assignments'],
      ['/operations/access/users', 'User Access Administration'],
      ['/operations/access/roles', 'Roles and Permissions'],
      ['/operations/access/approver-resolution', 'Approver Resolution'],
      ['/operations/access/uat-readiness', 'Approval UAT Readiness'],
      ['/operations/access/audit', 'Access Audit'],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    permission: 'SYSTEM_ADMIN',
    area: 'operations' as const,
    icon: <SettingOutlined />,
  })),
];
