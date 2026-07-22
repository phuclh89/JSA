import { Injectable, type LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JsonLogger implements LoggerService {
  constructor(private readonly config: ConfigService) {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }
  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  private write(level: string, message: unknown, context?: string, trace?: string): void {
    const entry =
      typeof message === 'object' && message !== null ? message : { message: String(message) };
    const output = {
      timestamp: new Date().toISOString(),
      level,
      service: 'jsams-api',
      environment: this.config.get('app.environment'),
      context,
      ...entry,
      ...(trace && this.config.get('app.environment') !== 'production' ? { trace } : {}),
    };
    const line = JSON.stringify(output);
    if (level === 'error') console.error(line);
    else console.log(line);
  }
}
