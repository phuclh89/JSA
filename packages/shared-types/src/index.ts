export interface AuthenticatedUser {
  userId: string;
  enterpriseIdentityKey: string;
  username: string;
  displayName: string;
  email?: string;
  defaultSiteId?: string;
  defaultRigId?: string;
  defaultDepartmentId?: string;
  roles: string[];
  permissions: string[];
  permissionOverrides: PermissionOverride[];
  dataScopes: DataScope[];
  authentication: {
    mode: 'development' | 'oidc';
    sessionExpiresAt?: string;
  };
}

export interface PermissionOverride {
  permissionCode: string;
  effect: 'ALLOW' | 'DENY';
}

export interface DataScope {
  scopeType: 'SITE' | 'RIG' | 'DEPARTMENT';
  siteId: string;
  rigId?: string;
  departmentId?: string;
  canView: boolean;
  canAct: boolean;
}

export interface SessionState {
  status: 'authenticated';
  user: AuthenticatedUser;
}

export interface DependencyCheck {
  status: 'up' | 'down';
  durationMs?: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  environment: string;
  timestamp: string;
  checks: { application: DependencyCheck; oracle?: DependencyCheck };
}

export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string; details: unknown[] };
  correlationId: string;
}
