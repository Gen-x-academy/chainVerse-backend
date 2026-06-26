import { Controller, Get, Param } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('tutor/:id')
  getTutorReport(@Param('id') id: string) {
    return this.reportsService.getTutorReport(id);
  }
}
