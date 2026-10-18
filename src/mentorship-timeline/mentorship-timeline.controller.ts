import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  AppendTimelineEventDto,
  TimelinePageDto,
} from './dto/mentorship-timeline.dto';
import { MentorshipTimelineService } from './mentorship-timeline.service';

@ApiTags('Mentorship Progress Timeline')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/timeline')
export class MentorshipTimelineController {
  constructor(private readonly service: MentorshipTimelineService) {}

  @Post('events')
  @ApiOperation({
    summary: 'Append a goal, session, milestone, deliverable or decision event',
  })
  @ApiResponse({
    status: 201,
    description: 'Event appended with a stable sequence number',
  })
  append(
    @CurrentUser('sub') actorId: string,
    @Body() dto: AppendTimelineEventDto,
  ) {
    return this.service.append(actorId, dto);
  }

  @Get('engagements/:engagementId')
  @ApiOperation({
    summary:
      'Ordered, permission-filtered timeline with gap-free cursor pagination',
  })
  list(
    @CurrentUser('sub') actorId: string,
    @Param('engagementId') engagementId: string,
    @Query() page: TimelinePageDto,
  ) {
    return this.service.list(actorId, engagementId, page);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Detail view for a single timeline entry' })
  @ApiResponse({ status: 404, description: 'TIMELINE_ENTRY_NOT_FOUND' })
  getEntry(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ParseObjectIdPipe()) id: string,
  ) {
    return this.service.getEntry(actorId, id);
  }
}
