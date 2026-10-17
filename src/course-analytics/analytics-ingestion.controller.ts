import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import {
  CreateLearningEventDto,
  MAX_PAYLOAD_BYTES,
} from './dto/create-learning-event.dto';
import { Public } from '../common/decorators/public.decorator';

/** Per-IP limit for the public ingestion endpoint: 60 events a minute. */
export const INGESTION_THROTTLE = { limit: 60, ttl: 60_000 } as const;

@Public()
@ApiTags('Course Analytics')
@Controller('analytics-ingestion')
export class AnalyticsIngestionController {
  constructor(
    private readonly analyticsIngestionService: AnalyticsIngestionService,
  ) {}

  /**
   * Public, so it is rate limited per client IP. The app registers its throttlers by
   * name (guest, auth, premium, admin), and a route override only applies to a
   * throttler of the same name, so each one is overridden here. A burst past the
   * limit gets 429.
   */
  @Throttle({
    guest: INGESTION_THROTTLE,
    auth: INGESTION_THROTTLE,
    premium: INGESTION_THROTTLE,
    admin: INGESTION_THROTTLE,
  })
  @Post()
  @ApiOperation({
    summary: 'Ingest a single learning event (public, rate limited)',
    description:
      'Accepts an unauthenticated learning event. Every field is bounded ' +
      'because anyone can post here, and `payload` is capped at ' +
      `${MAX_PAYLOAD_BYTES} bytes of JSON.`,
  })
  @ApiBody({ type: CreateLearningEventDto })
  @ApiResponse({ status: 201, description: 'Event accepted and stored' })
  @ApiResponse({
    status: 400,
    description:
      'VAL_INVALID_EVENT — a field failed validation, an unknown top-level ' +
      'field was sent, or `payload` exceeded the size limit',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many events from this client — more than 60 per minute',
  })
  create(@Body() createLearningEventDto: CreateLearningEventDto) {
    return this.analyticsIngestionService.create(createLearningEventDto);
  }
}
