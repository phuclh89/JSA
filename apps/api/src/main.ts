import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { JsonLogger } from './common/logging/json-logger.service';
import { ConfigService } from '@nestjs/config';

async function bootstrap(): Promise<void> {
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
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.useGlobalInterceptors(new RequestLoggingInterceptor(logger));
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('JSAMS API').setVersion('0.1.0').build(),
  );
  SwaggerModule.setup('docs', app, document);
  await app.listen(config.getOrThrow<number>('app.port'));
  logger.log({ result: 'started', port: config.getOrThrow<number>('app.port') }, 'Bootstrap');
}

void bootstrap();
