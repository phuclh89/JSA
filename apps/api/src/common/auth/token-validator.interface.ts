import type { AuthenticatedUser } from '@jsams/shared-types';
export interface TokenValidator {
  validate(token: string): Promise<Record<string, unknown>>;
}
export interface ExternalIdentityMapper {
  map(claims: Record<string, unknown>): Promise<AuthenticatedUser>;
}
