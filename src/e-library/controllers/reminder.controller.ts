import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReminderSchedulerService } from '../services/reminder-scheduler.service';
import { UpdateReminderPreferenceDto } from '../dto/update-reminder-preference.dto';
import {
  SendReminderDto,
  ReminderLogQueryDto,
} from '../dto/send-reminder.dto';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Reminders')
@Controller('e-library/reminders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReminderController {
  constructor(
    private readonly reminderSchedulerService: ReminderSchedulerService,
  ) {}

  @Get('preferences')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get reminder preferences for the current patron' })
  getPreferences(@CurrentUser('sub') patronId: string) {
    return this.reminderSchedulerService.getPreferences(patronId);
  }

  @Post('preferences')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Update reminder preferences for the current patron' })
  updatePreferences(
    @CurrentUser('sub') patronId: string,
    @Body() dto: UpdateReminderPreferenceDto,
  ) {
    return this.reminderSchedulerService.upsertPreference(patronId, dto);
  }

  @Get('logs')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Query reminder logs with optional filters' })
  getReminderLogs(@Query() query: ReminderLogQueryDto) {
    return this.reminderSchedulerService.getReminderLogs(query);
  }

  @Post('send')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Manually send a reminder for a specific loan' })
  sendReminder(@Body() dto: SendReminderDto) {
    return this.reminderSchedulerService.sendManualReminder(
      dto.loanId,
      dto.reminderType,
      dto.channel,
    );
  }

  @Post('run')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Manually trigger the reminder scheduler job' })
  runJob() {
    return this.reminderSchedulerService.runReminderJob('reminder-manual-trigger');
  }

  @Get('runs')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'View recent reminder scheduler job run history' })
  getRuns(
    @Query('jobName') jobName?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reminderSchedulerService.getRecentRuns(
      jobName,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
