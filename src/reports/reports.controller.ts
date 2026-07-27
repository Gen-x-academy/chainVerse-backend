import { Controller, Get, Param, Post, Body, Res } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Public } from '../common/decorators/public.decorator';
import { ExportService } from './export.service';
import { ExportRequest } from './dto/export-request.dto';
import { Response } from 'express';

@Public()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportService: ExportService,
  ) {}

  @Get('tutor/:id')
  getTutorReport(@Param('id') id: string) {
    return this.reportsService.getTutorReport(id);
  }

  @Post('export')
  async exportReport(
    @Body() exportRequest: ExportRequest,
    @Res() res: Response,
  ) {
    const csv = await this.exportService.export(
      exportRequest.reportType,
      exportRequest.tutorId,
    );

    res.header('Content-Type', 'text/csv');
    res.attachment('report.csv');
    return res.send(csv);
  }
}
