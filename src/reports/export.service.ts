import { Injectable } from '@nestjs/common';
import { ReportType } from './dto/report-type.enum';

@Injectable()
export class ExportService {
  async export(reportType: ReportType, tutorId: string) {
    // In a real application, you would fetch the data from a database
    // and format it as a CSV file. For this example, we'll just return
    // a dummy CSV file.
    const data = [
      ['header1', 'header2'],
      ['data1', 'data2'],
    ];

    return data.map((row) => row.join(',')).join('\n');
  }
}
