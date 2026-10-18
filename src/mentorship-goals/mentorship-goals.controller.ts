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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  CheckinDto,
  CreateGoalDto,
  UpdateGoalDto,
} from './dto/mentorship-goal.dto';
import { MentorshipGoalsService } from './mentorship-goals.service';

@ApiTags('Mentorship Goals')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/goals')
export class MentorshipGoalsController {
  constructor(private readonly service: MentorshipGoalsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an engagement goal with success criteria' })
  create(@CurrentUser('sub') actorId: string, @Body() dto: CreateGoalDto) {
    return this.service.create(actorId, dto);
  }

  @Get(':id')
  get(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.service.update(actorId, id, dto);
  }

  @Patch(':id/complete')
  complete(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() body: { evidenceRefs?: string[] },
  ) {
    return this.service.complete(actorId, id, body.evidenceRefs ?? []);
  }

  @Post('checkins')
  @ApiOperation({ summary: 'Record a periodic check-in for an active goal' })
  checkin(@CurrentUser('sub') actorId: string, @Body() dto: CheckinDto) {
    return this.service.checkin(actorId, dto);
  }

  @Get(':id/checkins')
  history(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.history(id);
  }
}
