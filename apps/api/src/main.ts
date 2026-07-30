import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { JsonLogger } from './common/logging/json-logger.service';
import { ConfigService } from '@nestjs/config';
import { oracleDiagnosticHint, oracleErrorCode } from './common/oracle/oracle-client';
import type { INestApplication } from '@nestjs/common';

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(JsonLogger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  app.enableCors({
    origin: config.getOrThrow<string[]>('app.corsOrigins'),
    credentials: true,
    exposedHeaders: ['X-Correlation-ID'],
  });
  app.setGlobalPrefix(
    `${config.getOrThrow<string>('app.prefix').replace(/^\//, '')}/${config.getOrThrow<string>('app.version')}`,
  );
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(
    new GlobalExceptionFilter(logger, config.getOrThrow<string>('app.environment')),
  );
  app.useGlobalInterceptors(new RequestLoggingInterceptor(logger));
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('JSAMS API').setVersion('0.1.0').build(),
  );
  SwaggerModule.setup('docs', app, document);
  return app;
}

export async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get(ConfigService);
  const logger = app.get(JsonLogger);
  await app.listen(config.getOrThrow<number>('app.port'));
  logger.log({ result: 'started', port: config.getOrThrow<number>('app.port') }, 'Bootstrap');
}

if (require.main === module) {
  bootstrap().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'jsams-api',
        result: 'startup_failed',
        oracleErrorCode: oracleErrorCode(error),
        message: startupErrorMessage(error),
        diagnosticHint: startupDiagnosticHint(error),
      }),
    );
    process.exitCode = 1;
  });
}

export function startupErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'An unknown startup error occurred';
}

export function startupDiagnosticHint(error: unknown): string {
  const code = (error as { code?: string }).code;
  if (code === 'EADDRINUSE')
    return 'The API port is already in use. Keep the existing API instance, stop it before restarting, or configure a different PORT.';
  if (code === 'EACCES')
    return 'The API cannot bind to the configured port. Review operating-system permissions or configure a different PORT.';
  return oracleDiagnosticHint(error);
}
