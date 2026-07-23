import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RiskMatrixService } from './application/risk-matrix.service';
import {
  ActiveMatrixDto,
  AssignmentMutationDto,
  ConfigurationMutationDto,
  EndAssignmentDto,
  MatrixMutationDto,
  VersionMutationDto,
} from './dto/risk-matrix.dto';

@Controller()
@UseGuards(EnterpriseAuthGuard, PermissionGuard)
@RequirePermissions('SYSTEM_ADMIN')
export class RiskMatrixController {
  constructor(private readonly service: RiskMatrixService) {}
  @Get('risk-matrices') list(@Query('keyword') keyword?: string, @Query('active') active?: string) {
    return this.service.listMatrices(keyword, active === undefined ? undefined : active === 'true');
  }
  @Post('risk-matrices') create(
    @Body() body: MatrixMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createMatrix(body, user);
  }
  @Get('risk-matrices/:id') detail(@Param('id') id: string) {
    return this.service.matrix(id);
  }
  @Put('risk-matrices/:id') update(
    @Param('id') id: string,
    @Body() body: MatrixMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateMatrix(id, body, user);
  }
  @Post('risk-matrices/:id/activate') activate(
    @Param('id') id: string,
    @Body() body: ActiveMatrixDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.setMatrixActive(id, true, body.rowVersion, user);
  }
  @Post('risk-matrices/:id/deactivate') deactivate(
    @Param('id') id: string,
    @Body() body: ActiveMatrixDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.setMatrixActive(id, false, body.rowVersion, user);
  }
  @Post('risk-matrices/:matrixId/versions') createVersion(
    @Param('matrixId') matrixId: string,
    @Body() body: VersionMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createVersion(matrixId, body, user);
  }
  @Get('risk-matrix-versions') versions(@Query('matrixId') matrixId?: string) {
    return this.service.listVersionOptions(matrixId);
  }
  @Get('risk-matrix-versions/:id') version(@Param('id') id: string) {
    return this.service.version(id);
  }
  @Put('risk-matrix-versions/:id') updateVersion(
    @Param('id') id: string,
    @Body() body: VersionMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateVersion(id, body, user);
  }
  @Put('risk-matrix-versions/:id/configuration') save(
    @Param('id') id: string,
    @Body() body: ConfigurationMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.saveConfiguration(id, body, user);
  }
  @Get('risk-matrix-versions/:id/validate') validate(@Param('id') id: string) {
    return this.service.validateVersionCompleteness(id);
  }
  @Get('risk-matrix-versions/:id/preview') preview(@Param('id') id: string) {
    return this.service.version(id);
  }
  @Get('rig-matrix-assignments') assignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('rigId') rigId?: string,
  ) {
    return this.service.listAssignments(user, rigId);
  }
  @Post('rig-matrix-assignments') assign(
    @Body() body: AssignmentMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createAssignment(body, user);
  }
  @Put('rig-matrix-assignments/:id') updateAssignment(
    @Param('id') id: string,
    @Body() body: AssignmentMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateAssignment(id, body, user);
  }
  @Post('rig-matrix-assignments/:id/end') end(
    @Param('id') id: string,
    @Body() body: EndAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.endAssignment(id, body.effectiveTo, body.reason, body.rowVersion, user);
  }
  @Get('rigs/:rigId/effective-matrix') effective(
    @Param('rigId') rigId: string,
    @Query('effectiveAt') effectiveAt: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.resolveEffectiveMatrixVersion(rigId, effectiveAt, user);
  }
}
