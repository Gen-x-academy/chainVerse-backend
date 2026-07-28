import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { InternalOnlyGuard } from './internal-only.guard';
import { Public } from '../common/decorators/public.decorator';

@Public()
@ApiTags('Observability')
@Controller('metrics')
@UseGuards(InternalOnlyGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Returns application metrics in Prometheus text exposition format.
   * Suitable for scraping by a Prometheus server on the internal network.
   *
   * Restricted to internal/localhost callers only.
   */
  @Get('prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({
    summary: 'Get application metrics (Prometheus format) — internal only',
  })
  async getPrometheusMetrics(): Promise<string> {
    return this.metricsService.prometheusText();
  }
}
