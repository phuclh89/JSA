import type { DataScope, PermissionOverride } from '@jsams/shared-types';

export interface EnterprisePrincipal {
  identityKey: string;
  username: string;
  displayName?: string;
  mode: 'development' | 'oidc';
  sessionExpiresAt?: string;
}

export interface ApplicationUserRecord {
  userId: string;
  enterpriseIdentityKey: string;
  username: string;
  displayName: string;
  email?: string;
  defaultSiteId?: string;
  defaultRigId?: string;
  defaultDepartmentId?: string;
  active: boolean;
}

export interface SecurityAssignments {
  roles: string[];
  rolePermissions: string[];
  overrides: PermissionOverride[];
  dataScopes: DataScope[];
}

export interface AuditEvent {
  actorUserId?: string;
  enterpriseUsername?: string;
  actionCode: string;
  targetType: string;
  targetId?: string;
  siteId?: string;
  rigId?: string;
  clientContext?: string;
  previousState?: unknown;
  nextState?: unknown;
  comment?: string;
  timestamp: string;
  correlationId: string;
}
