import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SubmitFeedbackDto, UpdateFeedbackDto } from './dto/feedback.dto';
import { MentorshipFeedbackService } from './mentorship-feedback.service';

@ApiTags('Mentorship Feedback')
@ApiBearerAuth('access-token')
@Controller('mentorship/feedback')
@UseGuards(JwtAuthGuard)
export class MentorshipFeedbackController {
  constructor(private readonly service: MentorshipFeedbackService) {}

  private actor(userId: string, roles?: string[]) {
    return { userId, roles: roles ?? [] };
  }

  @Post()
  @ApiOperation({ summary: 'Submit session feedback (one per role)' })
  submit(
    @Body() dto: SubmitFeedbackDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.submit(dto, this.actor(userId, roles));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update feedback before reveal window closes' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.update(id, dto, this.actor(userId, roles));
  }

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'List session feedback (redacted by policy)' })
  list(
    @Param('sessionId') sessionId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.listForSession(sessionId, this.actor(userId, roles));
  }

  @Get('session/:sessionId/aggregate')
  @ApiOperation({ summary: 'Aggregate session feedback' })
  aggregate(@Param('sessionId') sessionId: string) {
    return this.service.aggregate(sessionId);
  }
}
