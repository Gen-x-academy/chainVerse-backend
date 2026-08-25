import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateLibraryConfigDto {
  @ApiPropertyOptional({ example: 5 })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  maxBorrowLimit?: number;

  @ApiPropertyOptional({ example: 14 })
  @IsInt()
  @Min(1)
  @IsOptional()
  loanPeriodDays?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsInt()
  @Min(0)
  @IsOptional()
  gracePeriodDays?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  dailyFineAmount?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @Min(1)
  @IsOptional()
  reminderDaysBeforeDue?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  borrowingEnabled?: boolean;

  @ApiPropertyOptional({ example: 'Closed for stocktake on 1 Sep' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  operationalNotes?: string;
}
