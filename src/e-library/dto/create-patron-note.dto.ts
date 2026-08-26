import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { NoteClassification } from '../schemas/patron-note.schema';

export class CreatePatronNoteDto {
  @ApiProperty({ description: 'ID of the patron the note is about' })
  @IsString()
  @IsNotEmpty()
  patronId: string;

  @ApiProperty({ enum: NoteClassification, example: NoteClassification.INTERNAL })
  @IsEnum(NoteClassification)
  classification: NoteClassification;

  @ApiProperty({ example: 'Patron requested extension for thesis research.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({
    description: 'Date when the note should be purged (ISO 8601)',
    example: '2027-01-01T00:00:00.000Z',
  })
  @IsDateString()
  retentionExpiry: string;
}
