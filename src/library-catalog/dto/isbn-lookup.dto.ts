import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class IsbnLookupDto {
  @ApiProperty({ example: '9780306406157', description: 'ISBN-10 or ISBN-13' })
  @IsString()
  @Matches(/^(?:\d{9}[\dX]|\d{13})$/, { message: 'isbn must be a valid ISBN-10 or ISBN-13' })
  isbn: string;
}