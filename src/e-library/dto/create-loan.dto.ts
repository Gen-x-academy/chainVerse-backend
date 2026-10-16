import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateLoanDto {
  @ApiProperty({ example: '64f1c2b5e1b1c2a1b8e4a111' })
  @IsString()
  @IsNotEmpty()
  patronId: string;

  @ApiProperty({ example: '64f1c2b5e1b1c2a1b8e4a222' })
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ example: '2026-09-10T00:00:00.000Z' })
  @IsDateString()
  dueDate: string;
}
