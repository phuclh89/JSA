import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { correlationContext } from './correlation-context';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header('x-correlation-id')?.trim();
    const correlationId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    response.setHeader('X-Correlation-ID', correlationId);
    correlationContext.run({ correlationId }, next);
  }
}
