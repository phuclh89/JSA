import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse } from '@jsams/shared-types';
import { OracleService } from '../../common/oracle/oracle.service';
import { JsonLogger } from '../../common/logging/json-logger.service';
import { correlationContext } from '../../common/interceptors/correlation-context';
import { oracleErrorCode } from '../../common/oracle/oracle-client';

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService,
    private readonly oracle: OracleService,
    private readonly logger: JsonLogger,
  ) {}

  live(): HealthResponse {
    return this.response('ok', { application: { status: 'up' } });
  }

  async ready(): Promise<HealthResponse> {
    const started = Date.now();
    try {
      await this.oracle.execute<{ RESULT: number }>('SELECT 1 AS RESULT FROM DUAL');
      return this.response('ok', {
        application: { status: 'up' },
        oracle: { status: 'up', durationMs: Date.now() - started },
      });
    } catch (error) {
      const oracleError = error as { message?: string };
      this.logger.error(
        {
          correlationId: correlationContext.getStore()?.correlationId,
          result: 'oracle_readiness_failed',
          oracleErrorCode: oracleErrorCode(error),
          message: oracleError.message,
        },
        undefined,
        HealthService.name,
      );
      return this.response('degraded', {
        application: { status: 'up' },
        oracle: { status: 'down', durationMs: Date.now() - started },
      });
    }
  }

  private response(
    status: HealthResponse['status'],
    checks: HealthResponse['checks'],
  ): HealthResponse {
    return {
      status,
      service: 'jsams-api',
      environment: this.config.get<string>('app.environment') ?? 'unknown',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
