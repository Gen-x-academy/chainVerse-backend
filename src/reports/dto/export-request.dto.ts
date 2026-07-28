import { IsEnum, IsString } from 'class-validator';
import { ReportType } from './report-type.enum';

export class ExportRequest {
  @IsEnum(ReportType)
  reportType: ReportType;

  @IsString()
  tutorId: string;
}
