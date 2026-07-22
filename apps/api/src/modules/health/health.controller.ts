import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Combined application readiness' })
  async healthCheck(@Res() response: Response): Promise<void> {
    await this.sendReady(response);
  }

  @Get('live')
  @ApiOperation({ summary: 'Process liveness independent of dependencies' })
  live() {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness including Oracle connectivity' })
  async ready(@Res() response: Response): Promise<void> {
    await this.sendReady(response);
  }

  private async sendReady(response: Response): Promise<void> {
    const result = await this.health.ready();
    response
      .status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(result);
  }
}
