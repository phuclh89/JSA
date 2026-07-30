import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '@jsams/shared-types';
import type { Request } from 'express';
import { UnauthenticatedError } from '../errors/application-errors';
import { correlationContext } from '../interceptors/correlation-context';
import { UserContextService } from '../../modules/security/application/user-context.service';
import type { EnterprisePrincipal } from '../../modules/security/domain/security.types';
import { AuthSessionService } from '../../modules/security/application/auth-session.service';

@Injectable()
export class EnterpriseAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly users: UserContextService,
    private readonly sessions: AuthSessionService,
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
    const mode = this.config.getOrThrow<'development' | 'ldap'>('auth.mode');
    if (mode === 'development') {
      if (this.config.get<string>('app.environment') === 'production')
        throw new UnauthenticatedError();
      const username = request.header('x-dev-user')?.trim();
      if (!username) throw new UnauthenticatedError();
      return {
        identityKey: username,
        username,
        mode,
        allowUsernameFallback: true,
      };
    }
    return this.sessions.verify(request.header('cookie'));
  }
}
