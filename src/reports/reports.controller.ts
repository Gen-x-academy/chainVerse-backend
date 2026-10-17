import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { ExportRequest } from './dto/export-request.dto';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import {
  ErrorCode,
  ForbiddenDomainException,
} from '../common/errors';

interface ReportCaller {
  sub?: string;
  role?: string;
}

/**
 * A tutor may only read their own report; an admin may read any. The role guard has
 * already limited the route to those two roles, so this decides between them.
 */
function assertCanAccessTutorReport(caller: ReportCaller, tutorId: string) {
  if (caller.role === Role.ADMIN) return;
  if (caller.role === Role.TUTOR && caller.sub && caller.sub === tutorId) return;
  throw new ForbiddenDomainException(
    'You can only access your own tutor report.',
    ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
  );
}

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.TUTOR)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportService: ExportService,
  ) {}

  @Get('tutor/:id')
  @ApiOperation({ summary: 'Tutor report (the tutor themselves, or an admin)' })
  @ApiResponse({ status: 200, description: 'Tutor report returned' })
  @ApiResponse({ status: 403, description: 'Not allowed to read this report' })
  getTutorReport(@Param('id') id: string, @CurrentUser() caller: ReportCaller) {
    assertCanAccessTutorReport(caller, id);
    return this.reportsService.getTutorReport(id);
  }

  @Post('export')
  @ApiOperation({ summary: 'Export a report as CSV (the tutor themselves, or an admin)' })
  @ApiResponse({ status: 200, description: 'Report exported as CSV' })
  @ApiResponse({ status: 403, description: 'Not allowed to export this report' })
  async exportReport(
    @Body() exportRequest: ExportRequest,
    @Res() res: Response,
    @CurrentUser() caller: ReportCaller,
  ) {
    assertCanAccessTutorReport(caller, exportRequest.tutorId);

    const csv = await this.exportService.export(
      exportRequest.reportType,
      exportRequest.tutorId,
    );

    res.header('Content-Type', 'text/csv');
    res.attachment('report.csv');
    return res.send(csv);
  }
}
