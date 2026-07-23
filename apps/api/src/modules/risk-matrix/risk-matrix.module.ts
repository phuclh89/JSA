import { Module } from '@nestjs/common';
import { RiskMatrixService } from './application/risk-matrix.service';
import { RISK_MATRIX_REPOSITORY } from './domain/risk-matrix.repository';
import { OracleRiskMatrixRepository } from './infrastructure/oracle-risk-matrix.repository';
import { RiskMatrixController } from './risk-matrix.controller';

@Module({
  controllers: [RiskMatrixController],
  providers: [
    RiskMatrixService,
    OracleRiskMatrixRepository,
    { provide: RISK_MATRIX_REPOSITORY, useExisting: OracleRiskMatrixRepository },
  ],
  exports: [RiskMatrixService],
})
export class RiskMatrixModule {}
