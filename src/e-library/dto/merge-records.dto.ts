import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MergeRecordsDto {
  @ApiProperty({ description: 'ID of the book to keep (primary)' })
  @IsString()
  @IsNotEmpty()
  primaryBookId: string;

  @ApiProperty({ description: 'ID of the duplicate book to merge into primary and remove' })
  @IsString()
  @IsNotEmpty()
  duplicateBookId: string;
}
