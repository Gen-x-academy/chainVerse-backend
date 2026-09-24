import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
} from 'class-validator';

export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

export class ExportCatalogQueryDto {
  @ApiProperty({ enum: ExportFormat, example: ExportFormat.CSV })
  @IsEnum(ExportFormat)
  format: ExportFormat;

  @ApiPropertyOptional({
    description: 'Fields to include in export. If omitted, all fields are exported.',
    example: ['title', 'author', 'workKey', 'format'],
  })
  @IsArray()
  @IsOptional()
  fieldsToInclude?: string[];

  @ApiPropertyOptional({
    description: 'Exclude internal notes from the export.',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  excludeInternalNotes?: boolean = true;
}
