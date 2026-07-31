import { Module } from '@nestjs/common';
import { JsaVersionCompareService } from './application/jsa-version-compare.service';
import { JsaVersioningCapabilityService } from './application/jsa-versioning-capability.service';
import { JsaVersioningService } from './application/jsa-versioning.service';
import { JSA_VERSIONING_REPOSITORY } from './domain/jsa-versioning.repository';
import { OracleJsaVersioningRepository } from './infrastructure/oracle-jsa-versioning.repository';
import { JsaVersioningController } from './jsa-versioning.controller';

@Module({
  controllers: [JsaVersioningController],
  providers: [
    JsaVersioningService,
    JsaVersioningCapabilityService,
    JsaVersionCompareService,
    OracleJsaVersioningRepository,
    { provide: JSA_VERSIONING_REPOSITORY, useExisting: OracleJsaVersioningRepository },
  ],
  exports: [JsaVersioningService],
})
export class JsaVersioningModule {}
