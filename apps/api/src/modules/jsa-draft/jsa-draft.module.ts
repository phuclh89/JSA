import { Module } from '@nestjs/common';
import { RiskMatrixModule } from '../risk-matrix/risk-matrix.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { JsaCapabilityService } from './application/jsa-capability.service';
import { JsaDraftService } from './application/jsa-draft.service';
import { JsaDraftValidationService } from './application/jsa-draft-validation.service';
import { JsaNumberService } from './application/jsa-number.service';
import { OracleJsaDraftRepository } from './infrastructure/oracle-jsa-draft.repository';
import { JSA_DRAFT_REPOSITORY } from './domain/jsa-draft.repository';
import { JsaDraftController } from './jsa-draft.controller';
@Module({imports:[RiskMatrixModule,MasterDataModule],controllers:[JsaDraftController],providers:[JsaDraftService,JsaCapabilityService,JsaDraftValidationService,JsaNumberService,OracleJsaDraftRepository,{provide:JSA_DRAFT_REPOSITORY,useExisting:OracleJsaDraftRepository}]})
export class JsaDraftModule {}
