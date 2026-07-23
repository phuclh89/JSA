import { Module } from '@nestjs/common';
import { JsaWorkflowCapabilityService } from './application/jsa-workflow-capability.service';
import { JsaWorkflowService } from './application/jsa-workflow.service';
import { JSA_WORKFLOW_REPOSITORY } from './domain/jsa-workflow.repository';
import { OracleJsaWorkflowRepository } from './infrastructure/oracle-jsa-workflow.repository';
import { JsaWorkflowController } from './jsa-workflow.controller';
@Module({
  controllers: [JsaWorkflowController],
  providers: [
    JsaWorkflowService,
    JsaWorkflowCapabilityService,
    OracleJsaWorkflowRepository,
    { provide: JSA_WORKFLOW_REPOSITORY, useExisting: OracleJsaWorkflowRepository },
  ],
})
export class JsaWorkflowModule {}
