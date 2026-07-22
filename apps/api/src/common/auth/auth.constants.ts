export const AUTHENTICATED_USER = Symbol('AUTHENTICATED_USER');
export const REQUIRED_PERMISSIONS = 'required_permissions';
export const DEVELOPMENT_USERS = {
  admin: {
    userId: 'dev-admin',
    username: 'admin',
    displayName: 'Development Administrator',
    siteId: 'DEV',
    rigIds: [],
    departmentIds: [],
    roles: ['SYSTEM_ADMIN'],
    permissions: ['SYSTEM_HEALTH_VIEW', 'SYSTEM_ADMIN'],
  },
  viewer: {
    userId: 'dev-viewer',
    username: 'viewer',
    displayName: 'Development Viewer',
    siteId: 'DEV',
    rigIds: [],
    departmentIds: [],
    roles: [],
    permissions: ['SYSTEM_HEALTH_VIEW'],
  },
} as const;
