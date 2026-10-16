import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { ReadingListReportService } from '../services/reading-list-report.service';
import { ReadingListReportQueryDto } from '../dto/reading-list-report-query.dto';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Analytics')
@Controller('e-library/analytics/reading-lists')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReadingListReportController {
  constructor(
    private readonly readingListReportService: ReadingListReportService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN, Role.TUTOR)
  @ApiOperation({
    summary:
      'Get reading-list impact reports: availability, borrowing engagement, and tutor summaries',
  })
  getReport(@Query() query: ReadingListReportQueryDto) {
    return this.readingListReportService.getReadingListReport(query);
  }

  @Get('availability')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN, Role.TUTOR)
  @ApiOperation({
    summary: 'Get availability status for a specific course reading list',
  })
  getAvailability(@Query('courseId') courseId: string) {
    return this.readingListReportService.getAvailabilityReport(
      courseId,
      new Date(),
    );
  }

  @Get('borrowing')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN, Role.TUTOR)
  @ApiOperation({
    summary: 'Get borrowing engagement for a specific course reading list',
  })
  getBorrowing(
    @Query('courseId') courseId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    return this.readingListReportService.getBorrowingReport(
      courseId,
      from ? new Date(from) : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      to ? new Date(to) : now,
    );
  }

  @Get('tutor')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN, Role.TUTOR)
  @ApiOperation({
    summary:
      'Get aggregated reading-list summary for a specific tutor (only owned courses)',
  })
  getTutorSummary(
    @Query('tutorId') tutorId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    return this.readingListReportService.getTutorSummary(
      tutorId,
      from ? new Date(from) : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      to ? new Date(to) : now,
      now,
    );
  }
}
