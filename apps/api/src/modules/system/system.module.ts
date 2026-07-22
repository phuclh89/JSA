import { Module } from '@nestjs/common';
import { DevelopmentAuthGuard } from '../../common/auth/development-auth.guard';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { SystemController } from './system.controller';
@Module({ controllers: [SystemController], providers: [DevelopmentAuthGuard, PermissionGuard] })
export class SystemModule {}
