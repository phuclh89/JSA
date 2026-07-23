import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import path from 'node:path';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import loggingConfig from './config/logging.config';
import oracleConfig from './config/oracle.config';
import { validateEnvironment } from './config/environment';
import { CorrelationIdMiddleware } from './common/interceptors/correlation-id.middleware';
import { LoggingModule } from './common/logging/logging.module';
import { OracleModule } from './common/oracle/oracle.module';
import { HealthModule } from './modules/health/health.module';
import { SystemModule } from './modules/system/system.module';
import { SecurityModule } from './modules/security/security.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { RiskMatrixModule } from './modules/risk-matrix/risk-matrix.module';
import { JsaDraftModule } from './modules/jsa-draft/jsa-draft.module';
import { JsaWorkflowModule } from './modules/jsa-workflow/jsa-workflow.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: path.resolve(__dirname, '../../../.env'),
      validate: validateEnvironment,
      load: [appConfig, authConfig, loggingConfig, oracleConfig],
    }),
    LoggingModule,
    OracleModule,
    SecurityModule,
    MasterDataModule,
    RiskMatrixModule,
    JsaDraftModule,
    JsaWorkflowModule,
    HealthModule,
    SystemModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
