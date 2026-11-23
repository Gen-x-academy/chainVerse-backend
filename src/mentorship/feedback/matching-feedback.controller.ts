import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { MentorshipUser } from '../shared/mentorship-context';
import {
  FeedbackAggregateQueryDto,
  SubmitFeedbackDto,
} from './dto/matching-feedback.dto';
import { MatchingFeedbackService } from './matching-feedback.service';

@ApiTags('Mentorship Matching Feedback')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/feedback')
export class MatchingFeedbackController {
  constructor(private readonly service: MatchingFeedbackService) {}

  @Post()
  @ApiOperation({ summary: 'Submit optional, consent-gated feedback' })
  @ApiCreatedResponse({
    description: 'Write-once feedback receipt without free text.',
  })
  submit(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.service.submit(this.user(raw), dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List the caller’s own feedback receipts' })
  @ApiOkResponse({ description: 'Free text is omitted from list responses.' })
  mine(@CurrentUser() raw: Record<string, unknown> | undefined) {
    return this.service.mine(this.user(raw));
  }

  @Get('aggregate')
  @ApiOperation({ summary: 'Anonymized, k-anonymity-filtered rating metrics' })
  @ApiOkResponse({
    description: 'Ratings-only aggregates; no ids or free text are returned.',
  })
  aggregate(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Query() query: FeedbackAggregateQueryDto,
  ) {
    return this.service.aggregate(this.user(raw), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one feedback item (free text is protected)' })
  @ApiOkResponse({
    description:
      'Free text only for the author or an auditing admin with a reason, before retention expiry.',
  })
  detail(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Query('reason') reason?: string,
  ) {
    return this.service.detail(this.user(raw), id, reason);
  }

  private user(raw: Record<string, unknown> | undefined): MentorshipUser {
    if (!raw) throw new UnauthorizedException();
    return {
      id: String(raw['sub'] ?? raw['id'] ?? ''),
      email: String(raw['email'] ?? ''),
      role: String(raw['role'] ?? ''),
    };
  }
}
