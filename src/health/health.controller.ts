import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';
import { Public } from '../common/decorators/public.decorator';

/**
 * GET /health       – liveness probe (always 200 while the process is running)
 * GET /health/ready – readiness probe (503 when a configured dependency is unreachable)
 */
@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health liveness check' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  liveness() {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Health readiness check' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service not ready' })
  async readiness(@Res() res: Response) {
    const result = await this.healthService.readiness();
    const httpStatus =
      result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(httpStatus).json(result);
  }
}
