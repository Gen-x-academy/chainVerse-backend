import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum CitationFormat {
  APA = 'apa',
  MLA = 'mla',
  CHICAGO = 'chicago',
  BIBTEX = 'bibtex',
  RIS = 'ris',
}

const OBJECT_ID_LIST_PATTERN = /^[0-9a-fA-F]{24}(,[0-9a-fA-F]{24})*$/;

export class CatalogCitationQueryDto {
  @ApiProperty({
    enum: CitationFormat,
    description: 'Citation output style.',
    example: CitationFormat.APA,
  })
  @IsEnum(CitationFormat)
  format: CitationFormat;

  @ApiProperty({
    description:
      'Comma-separated Book ObjectIds to cite. Order is preserved in the response.',
    example: '64b8f0a1c2d3e4f5a6b7c8d9,64b8f0a1c2d3e4f5a6b7c8e0',
  })
  @IsString()
  @Matches(OBJECT_ID_LIST_PATTERN, {
    message: 'ids must be a comma-separated list of valid 24-character ObjectIds',
  })
  ids: string;
}

export class ReadingListCitationQueryDto {
  @ApiProperty({
    enum: CitationFormat,
    description: 'Citation output style.',
    example: CitationFormat.BIBTEX,
  })
  @IsEnum(CitationFormat)
  format: CitationFormat;
}