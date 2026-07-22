export const PERMISSIONS = {
  SYSTEM_HEALTH_VIEW: 'SYSTEM_HEALTH_VIEW',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
