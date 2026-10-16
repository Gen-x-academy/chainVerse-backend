import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { CreateLearningEventDto } from './dto/create-learning-event.dto';
import { Public } from '../common/decorators/public.decorator';

/** Per-IP limit for the public ingestion endpoint: 60 events a minute. */
export const INGESTION_THROTTLE = { limit: 60, ttl: 60_000 } as const;

@Public()
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
  create(@Body() createLearningEventDto: CreateLearningEventDto) {
    return this.analyticsIngestionService.create(createLearningEventDto);
  }
}
