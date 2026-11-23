import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CancelSessionDto } from './dto/cancel-session.dto';
import { CreateMentorshipSessionDto } from './dto/create-session.dto';
import { MentorshipSessionsService } from './mentorship-sessions.service';

@ApiTags('Mentorship Sessions')
@ApiBearerAuth('access-token')
@Controller('mentorship/sessions')
@UseGuards(JwtAuthGuard)
export class MentorshipSessionsController {
  constructor(private readonly service: MentorshipSessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a mentorship session (idempotent)' })
  create(@Body() dto: CreateMentorshipSessionDto) {
    return this.service.create(dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a mentorship session' })
  cancel(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: CancelSessionDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.cancel(id, { ...dto, actorId: userId });
  }
}
