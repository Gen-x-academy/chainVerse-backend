
import { Controller, Post, Body } from '@nestjs/common';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { CreateLearningEventDto } from './dto/create-learning-event.dto';
import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('analytics-ingestion')
export class AnalyticsIngestionController {
  constructor(
    private readonly analyticsIngestionService: AnalyticsIngestionService,
  ) {}

  @Post()
  create(@Body() createLearningEventDto: CreateLearningEventDto) {
    return this.analyticsIngestionService.create(createLearningEventDto);
  }
}