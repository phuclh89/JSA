import { Injectable } from '@nestjs/common';
import { correlationContext } from '../../../common/interceptors/correlation-context';
import { JsonLogger } from '../../../common/logging/json-logger.service';
import type { AuditEvent } from '../domain/security.types';

@Injectable()
export class SecurityAuditService {
  constructor(private readonly logger: JsonLogger) {}

  async recordRequired(event: Omit<AuditEvent, 'timestamp' | 'correlationId'>): Promise<void> {
    const auditEvent: AuditEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      correlationId: correlationContext.getStore()?.correlationId ?? 'unknown',
    };
    this.logger.log({ result: 'security_audit', audit: auditEvent }, SecurityAuditService.name);
  }
}
