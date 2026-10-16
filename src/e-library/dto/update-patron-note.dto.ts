import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NoteClassification } from '../schemas/patron-note.schema';

export class UpdatePatronNoteDto {
  @ApiPropertyOptional({ enum: NoteClassification })
  @IsOptional()
  @IsEnum(NoteClassification)
  classification?: NoteClassification;

  @ApiPropertyOptional({ example: 'Updated note content.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({
    description: 'Updated retention expiry (ISO 8601)',
    example: '2027-06-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  retentionExpiry?: string;
}
