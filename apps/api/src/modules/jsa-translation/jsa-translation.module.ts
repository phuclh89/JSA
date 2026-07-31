import { Module } from '@nestjs/common';
import { JsaTranslationCapabilityService } from './application/jsa-translation-capability.service';
import { JsaTranslationService } from './application/jsa-translation.service';
import { JSA_TRANSLATION_REPOSITORY } from './domain/jsa-translation.repository';
import { OracleJsaTranslationRepository } from './infrastructure/oracle-jsa-translation.repository';
import { JsaTranslationController } from './jsa-translation.controller';

@Module({
  controllers: [JsaTranslationController],
  providers: [
    JsaTranslationService,
    JsaTranslationCapabilityService,
    OracleJsaTranslationRepository,
    { provide: JSA_TRANSLATION_REPOSITORY, useExisting: OracleJsaTranslationRepository },
  ],
})
export class JsaTranslationModule {}
