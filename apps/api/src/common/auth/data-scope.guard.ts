import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
@Injectable()
export abstract class DataScopeGuard implements CanActivate {
  abstract canActivate(context: ExecutionContext): boolean | Promise<boolean>;
}
