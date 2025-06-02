import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ReportService } from './reports.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'academic-manager')
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('tutor/:tutorId')
  async getTutorReport(@Param('tutorId') tutorId: string) {
    return this.reportService.getTutorReport(tutorId);
  }

  @Get('tutors')
  async getAllTutorSummaries() {
    return this.reportService.getAllTutorSummaries();
  }
}
