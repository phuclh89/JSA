import { Module } from '@nestjs/common';
import { JsaBrowseCapabilityService } from './application/jsa-browse-capability.service';
import { JsaBrowseService } from './application/jsa-browse.service';
import {
  JSA_BROWSE_REPOSITORY,
} from './domain/jsa-browse.repository';
import { OracleJsaBrowseRepository } from './infrastructure/oracle-jsa-browse.repository';
import { JsaBrowseController } from './jsa-browse.controller';

@Module({
  controllers: [JsaBrowseController],
  providers: [
    JsaBrowseService,
    JsaBrowseCapabilityService,
    OracleJsaBrowseRepository,
    { provide: JSA_BROWSE_REPOSITORY, useExisting: OracleJsaBrowseRepository },
  ],
})
export class JsaBrowseModule {}
