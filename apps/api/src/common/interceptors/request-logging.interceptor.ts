import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { JsonLogger } from '../logging/json-logger.service';
import { correlationContext } from './correlation-context';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: JsonLogger) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const request = context.switchToHttp().getRequest<{ method: string; url: string }>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    return next
      .handle()
      .pipe(
        tap({
          finalize: () =>
            this.logger.log(
              {
                correlationId: correlationContext.getStore()?.correlationId,
                method: request.method,
                route: request.url,
                statusCode: response.statusCode,
                durationMs: Date.now() - started,
                result: response.statusCode < 400 ? 'success' : 'failure',
              },
              'HttpRequest',
            ),
        }),
      );
  }
}
