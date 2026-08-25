import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { BookFormat } from '../schemas/book.schema';

export class CreateBookDto {
  @ApiProperty({ example: 'Dune' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Frank Herbert' })
  @IsString()
  @IsNotEmpty()
  author: string;

  @ApiProperty({
    description:
      'Identifier grouping every edition/format of the same underlying work.',
    example: 'dune-frank-herbert',
  })
  @IsString()
  @IsNotEmpty()
  workKey: string;

  @ApiProperty({ enum: BookFormat, example: BookFormat.PHYSICAL })
  @IsEnum(BookFormat)
  format: BookFormat;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(0)
  totalCopies: number;
}
