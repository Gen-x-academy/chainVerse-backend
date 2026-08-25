import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NoteClassification } from '../schemas/patron-note.schema';

export class CreatePatronNoteDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  patronId: string;

  @ApiProperty({ example: 'Item returned with water damage.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;

  @ApiPropertyOptional({ enum: NoteClassification, default: NoteClassification.GENERAL })
  @IsEnum(NoteClassification)
  @IsOptional()
  classification?: NoteClassification;
}

export class UpdatePatronNoteDto {
  @ApiPropertyOptional({ example: 'Updated note content.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({ enum: NoteClassification })
  @IsEnum(NoteClassification)
  @IsOptional()
  classification?: NoteClassification;
}
