import { Module } from '@nestjs/common';
import { JsaDraftModule } from '../jsa-draft/jsa-draft.module';
import { JsaCopyCapabilityService } from './application/jsa-copy-capability.service';
import { JsaCopyService } from './application/jsa-copy.service';
import { JSA_COPY_REPOSITORY } from './domain/jsa-copy.repository';
import { OracleJsaCopyRepository } from './infrastructure/oracle-jsa-copy.repository';
import { JsaCopyController } from './jsa-copy.controller';

@Module({
  imports: [JsaDraftModule],
  controllers: [JsaCopyController],
  providers: [
    JsaCopyService,
    JsaCopyCapabilityService,
    OracleJsaCopyRepository,
    { provide: JSA_COPY_REPOSITORY, useExisting: OracleJsaCopyRepository },
  ],
})
export class JsaCopyModule {}
