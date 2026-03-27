import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('Observability')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Returns application metrics as a JSON snapshot.
   * Includes uptime, request counters, and latency percentiles per route.
   */
  @Get()
  @ApiOperation({ summary: 'Get application metrics (JSON)' })
  getMetrics(): Record<string, unknown> {
    return this.metricsService.snapshot();
  }

  /**
   * Returns application metrics in Prometheus text exposition format.
   * Suitable for scraping by a Prometheus server.
   */
  @Get('prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Get application metrics (Prometheus format)' })
  getPrometheusMetrics(): string {
    return this.metricsService.prometheusText();
  }
}
