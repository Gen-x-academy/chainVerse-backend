import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum ImportSource {
  CSV = 'csv',
  JSON = 'json',
}

export class ImportCatalogDto {
  @ApiProperty({ enum: ImportSource, example: ImportSource.CSV })
  @IsEnum(ImportSource)
  source: ImportSource;

  @ApiPropertyOptional({
    description: 'Idempotency key to prevent duplicate imports.',
    example: 'import-2026-08-31-batch-1',
  })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
