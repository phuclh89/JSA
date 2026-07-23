import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JsaWorkflowService } from './application/jsa-workflow.service';
import {
  SaveWorkflowDefinitionDto,
  SaveWorkflowRoleAssignmentDto,
  WorkflowActionDto,
} from './dto/jsa-workflow.dto';
@Controller('jsa-workflow')
@UseGuards(EnterpriseAuthGuard)
export class JsaWorkflowController {
  constructor(private readonly service: JsaWorkflowService) {}
  @Get('capabilities') capabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.service.capabilityState(user);
  }
  @Get('queues/:kind') queue(
    @Param('kind') kind: 'approvals' | 'pending' | 'rejected' | 'published',
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.queue(kind, user);
  }
  @Get('notifications') notifications(@CurrentUser() user: AuthenticatedUser) {
    return this.service.notifications(user);
  }
  @Get('definitions') definitions(@CurrentUser() user: AuthenticatedUser) {
    return this.service.definitions(user);
  }
  @Get('role-assignments') roleAssignments(@CurrentUser() user: AuthenticatedUser) {
    return this.service.roleAssignments(user);
  }
  @Put('role-assignments') saveRoleAssignment(
    @Body() body: SaveWorkflowRoleAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.saveRoleAssignment(body, user);
  }
  @Put('definitions') saveDefinition(
    @Body() body: SaveWorkflowDefinitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.saveDefinition(body as any, user);
  }
  @Post('definitions/validate') validateDefinition(
    @Body() body: SaveWorkflowDefinitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.validateDefinitionConfig(body as any, user);
  }
  @Get(':id/preview') preview(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.preview(id, user);
  }
  @Post(':id/submit') submit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.submit(id, user);
  }
  @Get(':id') detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.detail(id, user);
  }
  @Post(':id/approve') approve(
    @Param('id') id: string,
    @Body() b: WorkflowActionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.perform(id, 'APPROVE', b.comment, u);
  }
  @Post(':id/return') returnJsa(
    @Param('id') id: string,
    @Body() b: WorkflowActionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.perform(id, 'RETURN', b.comment, u);
  }
  @Post(':id/reject') reject(
    @Param('id') id: string,
    @Body() b: WorkflowActionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.perform(id, 'REJECT', b.comment, u);
  }
  @Post(':id/comment') comment(
    @Param('id') id: string,
    @Body() b: WorkflowActionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.perform(id, 'COMMENT', b.comment, u);
  }
}
