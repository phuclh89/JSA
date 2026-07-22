export interface AuthenticatedUser {
  userId: string;
  username: string;
  displayName?: string;
  email?: string;
  siteId?: string;
  rigIds: string[];
  departmentIds: string[];
  roles: string[];
  permissions: string[];
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
