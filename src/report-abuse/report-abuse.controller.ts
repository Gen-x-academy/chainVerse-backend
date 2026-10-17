import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReportAbuseService } from './report-abuse.service';
import { CreateReportAbuseDto } from './dto/create-report-abuse.dto';
import { UpdateReportAbuseDto } from './dto/update-report-abuse.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditActor } from '../common/audit/audit-context';
import type { AuditContext } from '../common/audit/audit-context';
import { FindReportsDto } from './dto/find-reports.dto';

@ApiTags('Report Abuse')
@ApiBearerAuth('access-token')
@Controller('report-abuse')
@UseGuards(JwtAuthGuard)
export class ReportAbuseController {
  constructor(private readonly service: ReportAbuseService) {}

  @Post()
  @ApiOperation({
    summary: 'Report abusive content (student/tutor/moderator)',
    description:
      'The report is attributed to the caller; `reporterId` is taken from the ' +
      'access token rather than the request body.',
  })
  @ApiResponse({ status: 201, description: 'Abuse report created' })
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT, Role.TUTOR, Role.MODERATOR)
  create(
    @Req() req: { user: { id: string } },
    @Body() payload: CreateReportAbuseDto,
  ) {
    return this.service.create(req.user.id, payload);
  }

  @Get()
  @ApiOperation({
    summary: 'List all abuse reports, newest first (admin/moderator)',
  })
  @ApiResponse({ status: 200, description: 'Paginated abuse-report page' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  findAll(@Query() paginationDto: FindReportsDto) {
    return this.service.findAll(paginationDto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List the caller’s own reports, newest first' })
  @ApiResponse({ status: 200, description: 'Paginated abuse-report page' })
  findMyReports(
    @Req() req: { user: { id: string } },
    @Query() paginationDto: FindReportsDto,
  ) {
    return this.service.findByReporter(req.user.id, paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one abuse report (admin/moderator)' })
  @ApiNotFoundResponse({ description: 'RES_ABUSE_REPORT_NOT_FOUND' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update moderation status or notes (admin/moderator)',
    description: 'The transition is written to the moderation audit log.',
  })
  @ApiNotFoundResponse({ description: 'RES_ABUSE_REPORT_NOT_FOUND' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateReportAbuseDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.update(id, payload, audit);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete an abuse report (admin only)',
    description:
      'The deletion and its prior state are written to the audit log.',
  })
  @ApiNotFoundResponse({ description: 'RES_ABUSE_REPORT_NOT_FOUND' })
  @ApiResponse({ status: 200, description: 'Abuse report deleted' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.remove(id, audit);
  }
}
