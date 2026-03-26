import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

/**
 * GET /health       – liveness probe (always 200 while the process is running)
 * GET /health/ready – readiness probe (503 when a configured dependency is unreachable)
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  liveness() {
    return this.healthService.liveness();
  }

  @Get('ready')
  async readiness(@Res() res: Response) {
    const result = await this.healthService.readiness();
    const httpStatus =
      result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(httpStatus).json(result);
  }
}
