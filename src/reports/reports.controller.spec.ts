import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { ReportType } from './dto/report-type.enum';
import { createResponse } from 'node-mocks-http';

describe('ReportsController', () => {
  let controller: ReportsController;
  let exportService: ExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        ReportsService,
        {
          provide: ExportService,
          useValue: {
            export: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    exportService = module.get<ExportService>(ExportService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('exportReport', () => {
    it('should call the export service and return a CSV file', async () => {
      const res = createResponse();
      const exportRequest = {
        reportType: ReportType.TUTOR_REPORT,
        tutorId: '123',
      };
      const csv = 'header1,header2\ndata1,data2';
      (exportService.export as jest.Mock).mockResolvedValue(csv);

      await controller.exportReport(exportRequest, res);

      expect(exportService.export).toHaveBeenCalledWith(
        exportRequest.reportType,
        exportRequest.tutorId,
      );
      expect(res.getHeader('Content-Type')).toBe('text/csv');
      expect(res.getHeader('Content-Disposition')).toBe(
        'attachment; filename="report.csv"',
      );
      expect(res._getData()).toBe(csv);
    });
  });
});
