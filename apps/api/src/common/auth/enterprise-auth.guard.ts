import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '@jsams/shared-types';
import type { Request } from 'express';
import { UnauthenticatedError } from '../errors/application-errors';
import { correlationContext } from '../interceptors/correlation-context';
import { UserContextService } from '../../modules/security/application/user-context.service';
import { OidcTokenValidator } from '../../modules/security/infrastructure/oidc-token-validator';
import type { EnterprisePrincipal } from '../../modules/security/domain/security.types';

@Injectable()
export class EnterpriseAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly users: UserContextService,
    private readonly tokens: OidcTokenValidator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const principal = await this.principal(request);
    const user = await this.users.resolve(principal);
    request.user = user;
    const store = correlationContext.getStore();
    if (store) store.userId = user.userId;
    return true;
  }

  private async principal(request: Request): Promise<EnterprisePrincipal> {
    const mode = this.config.getOrThrow<'development' | 'oidc'>('auth.mode');
    if (mode === 'development') {
      if (this.config.get<string>('app.environment') === 'production')
        throw new UnauthenticatedError();
      const username = request.header('x-dev-user')?.trim();
      if (!username) throw new UnauthenticatedError();
      return { identityKey: username, username, mode };
    }
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) throw new UnauthenticatedError();
    try {
      const claims = await this.tokens.validate(authorization.slice(7));
      const identityKey = stringClaim(claims, 'oid') ?? stringClaim(claims, 'sub');
      const username =
        stringClaim(claims, 'preferred_username') ??
        stringClaim(claims, 'upn') ??
        stringClaim(claims, 'email');
      if (!identityKey || !username) throw new UnauthenticatedError();
      const expires =
        typeof claims.exp === 'number' ? new Date(claims.exp * 1000).toISOString() : undefined;
      return {
        identityKey,
        username,
        displayName: stringClaim(claims, 'name'),
        mode,
        ...(expires ? { sessionExpiresAt: expires } : {}),
      };
    } catch {
      throw new UnauthenticatedError();
    }
  }
}

function stringClaim(claims: Record<string, unknown>, name: string): string | undefined {
  const value = claims[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
