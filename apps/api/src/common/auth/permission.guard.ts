import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { UnauthorizedError } from '../errors/application-errors';
import { REQUIRED_PERMISSIONS } from './auth.constants';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (required.every((permission) => user?.permissions.includes(permission))) return true;
    throw new UnauthorizedError();
  }
}
