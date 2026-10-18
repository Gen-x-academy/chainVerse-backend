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
  CreateActionItemDto,
  CreateMilestoneDto,
  UpdateActionItemDto,
} from './dto/mentorship-action.dto';
import { MentorshipActionsService } from './mentorship-actions.service';

@ApiTags('Mentorship Actions & Milestones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship')
export class MentorshipActionsController {
  constructor(private readonly service: MentorshipActionsService) {}

  @Post('action-items')
  @ApiOperation({
    summary: 'Assign an action item with due date and reminders',
  })
  create(
    @CurrentUser('sub') assignerId: string,
    @Body() dto: CreateActionItemDto,
  ) {
    return this.service.createItem(assignerId, dto);
  }

  @Patch('action-items/:id')
  update(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: UpdateActionItemDto,
  ) {
    return this.service.updateItem(actorId, id, dto);
  }

  @Get('action-items/overdue')
  overdue() {
    return this.service.getOverdue();
  }

  @Post('milestones')
  @ApiOperation({
    summary: 'Create a milestone with dependencies and reviewer',
  })
  createMilestone(@Body() dto: CreateMilestoneDto) {
    return this.service.createMilestone(dto);
  }

  @Patch('milestones/:id/complete')
  complete(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.completeMilestone(id);
  }
}
