import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { UnauthenticatedError } from '../errors/application-errors';
import { correlationContext } from '../interceptors/correlation-context';
import { DEVELOPMENT_USERS } from './auth.constants';

@Injectable()
export class DevelopmentAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    if (
      this.config.get<string>('auth.mode') !== 'development' ||
      this.config.get<string>('app.environment') === 'production'
    )
      throw new UnauthenticatedError();
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const username = request.header('x-dev-user') ?? '';
    const user = DEVELOPMENT_USERS[username as keyof typeof DEVELOPMENT_USERS];
    if (!user) throw new UnauthenticatedError();
    request.user = user;
    const store = correlationContext.getStore();
    if (store) store.userId = user.userId;
    return true;
  }
}
