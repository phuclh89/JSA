import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AccessAdministrationService } from './application/access-administration.service';
import {
  ApproverPreviewDto,
  AssignmentDto,
  CreateRoleDto,
  LifecycleDto,
  PageDto,
  RegisterUserDto,
  RevokeAssignmentDto,
  UpdateRoleDto,
  UpdateUserDto,
} from './dto/access-administration.dto';

@Controller('access-administration')
@UseGuards(EnterpriseAuthGuard, PermissionGuard)
@RequirePermissions('SYSTEM_ADMIN')
export class AccessAdministrationController {
  constructor(private readonly service: AccessAdministrationService) {}

  @Get('users') users(@Query() q: PageDto) {
    return this.service.users(q);
  }
  @Get('users/:id') user(@Param('id') id: string) {
    return this.service.user(id);
  }
  @Post('users') register(@Body() body: RegisterUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.register(body, actor);
  }
  @Patch('users/:id') updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.updateUser(id, body, actor);
  }
  @Post('users/:id/activate') activateUser(
    @Param('id') id: string,
    @Body() body: LifecycleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.userLifecycle(id, true, body, actor);
  }
  @Post('users/:id/deactivate') deactivateUser(
    @Param('id') id: string,
    @Body() body: LifecycleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.userLifecycle(id, false, body, actor);
  }
  @Get('users/:id/roles') userRoles(@Param('id') id: string) {
    return this.service.userAssignments(id, 'roles');
  }
  @Get('users/:id/overrides') userOverrides(@Param('id') id: string) {
    return this.service.userAssignments(id, 'overrides');
  }
  @Get('users/:id/scopes') userScopes(@Param('id') id: string) {
    return this.service.userAssignments(id, 'scopes');
  }
  @Get('users/:id/workflow-roles') userWorkflow(@Param('id') id: string) {
    return this.service.userAssignments(id, 'workflow');
  }
  @Get('users/:id/pending-impact') impact(@Param('id') id: string) {
    return this.service.impact(id);
  }
  @Get('users/:id/effective-access') effective(
    @Param('id') id: string,
    @Query('effectiveAt') at?: string,
  ) {
    return this.service.effective(id, at);
  }

  @Get('roles') roles(@Query() q: PageDto) {
    return this.service.roles(q);
  }
  @Get('roles/:id') role(@Param('id') id: string) {
    return this.service.role(id);
  }
  @Post('roles') createRole(@Body() body: CreateRoleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.createRole(body, actor);
  }
  @Patch('roles/:id') updateRole(
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.updateRole(id, body, actor);
  }
  @Post('roles/:id/activate') activateRole(
    @Param('id') id: string,
    @Body() body: LifecycleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.roleLifecycle(id, true, body, actor);
  }
  @Post('roles/:id/deactivate') deactivateRole(
    @Param('id') id: string,
    @Body() body: LifecycleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.roleLifecycle(id, false, body, actor);
  }
  @Get('roles/:id/permissions') rolePermissions(@Param('id') id: string) {
    return this.service.roleAssignments(id, 'permissions');
  }
  @Get('roles/:id/users') roleUsers(@Param('id') id: string) {
    return this.service.roleAssignments(id, 'users');
  }
  @Get('permissions') permissions(@Query('group') group?: string) {
    return this.service.permissions(group);
  }

  @Post('assignments/:kind') assign(
    @Param('kind') kind: string,
    @Body() body: AssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.assign(kind, body, actor);
  }
  @Post('assignments/:kind/:id/revoke') revoke(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: RevokeAssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.revoke(kind, id, body, actor);
  }
  @Patch('assignments/:kind/:id') updateAssignment(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: AssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.updateAssignment(kind, id, body, actor);
  }
  @Post('previews/approvers') approvers(
    @Body() body: ApproverPreviewDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.approvers(body, actor);
  }
  @Post('uat-readiness') readiness(
    @Body() body: ApproverPreviewDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.readiness(body, actor);
  }
  @Get('identity-configuration') identity() {
    return this.service.identityStatus();
  }
  @Get('audit-events') audits(@Query() q: PageDto) {
    return this.service.audits(q);
  }
  @Get('audit-events/:id') audit(@Param('id') id: string) {
    return this.service.audit(id);
  }
}
