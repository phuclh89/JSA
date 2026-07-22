import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApplicationError } from '../errors/application-errors';
import { correlationContext } from '../interceptors/correlation-context';
import { JsonLogger } from '../logging/json-logger.service';
import { oracleErrorCode } from '../oracle/oracle-client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const correlationId = correlationContext.getStore()?.correlationId ?? 'unknown';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown[] = [];

    if (exception instanceof ApplicationError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (isOracleConstraintError(exception)) {
      status = HttpStatus.CONFLICT;
      code = 'DATA_CONSTRAINT_VIOLATION';
      message = 'The operation violates a data constraint';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (status === HttpStatus.BAD_REQUEST) {
        code = 'VALIDATION_ERROR';
        message = 'Request data is invalid';
        details =
          typeof payload === 'object' && payload && 'message' in payload
            ? ([] as unknown[]).concat((payload as { message: unknown }).message)
            : [];
      } else if (status === HttpStatus.NOT_FOUND) {
        code = 'RESOURCE_NOT_FOUND';
        message = 'Resource was not found';
      } else {
        code =
          status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'UNAUTHORIZED' : 'REQUEST_ERROR';
        message = exception.message;
      }
    }

    this.logger.error(
      {
        correlationId,
        result: 'failure',
        errorCode: code,
        oracleErrorCode: oracleErrorCode(exception),
        message: code === 'INTERNAL_ERROR' ? 'Unhandled request failure' : message,
      },
      undefined,
      GlobalExceptionFilter.name,
    );
    response
      .status(status)
      .json({ success: false, error: { code, message, details }, correlationId });
  }
}

function isOracleConstraintError(error: unknown): boolean {
  return [1, 2290, 2291, 2292].includes((error as { errorNum?: number }).errorNum ?? -1);
}
