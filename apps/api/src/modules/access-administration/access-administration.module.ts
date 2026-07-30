import { Module } from '@nestjs/common';
import { JsaWorkflowModule } from '../jsa-workflow/jsa-workflow.module';
import { AccessAdministrationController } from './access-administration.controller';
import { AccessAdministrationService } from './application/access-administration.service';
import { ACCESS_ADMINISTRATION_REPOSITORY } from './domain/access-administration.repository';
import { OracleAccessAdministrationRepository } from './infrastructure/oracle-access-administration.repository';

@Module({
  imports: [JsaWorkflowModule],
  controllers: [AccessAdministrationController],
  providers: [
    AccessAdministrationService,
    OracleAccessAdministrationRepository,
    {
      provide: ACCESS_ADMINISTRATION_REPOSITORY,
      useExisting: OracleAccessAdministrationRepository,
    },
  ],
})
export class AccessAdministrationModule {}
