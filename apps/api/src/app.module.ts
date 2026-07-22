import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
      load: [appConfig, authConfig, loggingConfig, oracleConfig],
    }),
    LoggingModule,
    OracleModule,
    HealthModule,
    SystemModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
