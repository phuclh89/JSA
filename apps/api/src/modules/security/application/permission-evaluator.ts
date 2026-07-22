import type { PermissionOverride } from '@jsams/shared-types';

export function effectivePermissions(
  rolePermissions: readonly string[],
  overrides: readonly PermissionOverride[],
): string[] {
  const effective = new Set(rolePermissions);
  for (const override of overrides)
    if (override.effect === 'ALLOW') effective.add(override.permissionCode);
  for (const override of overrides)
    if (override.effect === 'DENY') effective.delete(override.permissionCode);
  return [...effective].sort();
}
