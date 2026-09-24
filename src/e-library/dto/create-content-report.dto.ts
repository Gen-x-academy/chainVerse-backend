import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ReportTargetType, ReportReasonType } from '../schemas/content-report.schema';

export class CreateContentReportDto {
  @ApiProperty({ enum: ReportTargetType, example: ReportTargetType.REVIEW })
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @ApiProperty({ description: 'ID of the reported item' })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiProperty({ enum: ReportReasonType, example: ReportReasonType.ABUSIVE_REVIEW })
  @IsEnum(ReportReasonType)
  reasonType: ReportReasonType;

  @ApiProperty({
    description: 'Detailed description of the issue',
    example: 'This review contains harassment.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;
}
