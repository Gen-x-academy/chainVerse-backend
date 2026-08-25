import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { LendableType } from '../enums/lendable-type.enum';

export class CreateBookDto {
  @ApiProperty({ example: 'Clean Code' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Robert C. Martin' })
  @IsString()
  @IsNotEmpty()
  author!: string;

  @ApiPropertyOptional({ example: '9780132350884' })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiProperty({ enum: LendableType, example: LendableType.PHYSICAL })
  @IsEnum(LendableType)
  type!: LendableType;

  @ApiProperty({
    description:
      'Number of lendable copies (physical) or license seats (ebook) to provision',
    example: 3,
  })
  @IsInt()
  @Min(0)
  totalCopies!: number;

  @ApiPropertyOptional({
    description:
      'Maximum number of concurrent active holds a single user may place on this title',
    example: 3,
    default: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxActiveHoldsPerUser?: number;

  @ApiPropertyOptional({
    description:
      'Days a ready physical hold is reserved for pickup before it expires',
    example: 3,
    default: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  pickupWindowDays?: number;
}
