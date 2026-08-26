import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DigitalReturnDto {
  @ApiProperty({ description: 'ID of the digital loan to return' })
  @IsString()
  @IsNotEmpty()
  loanId: string;

  @ApiProperty({ description: 'ID of the borrower (patron)' })
  @IsString()
  @IsNotEmpty()
  patronId: string;
}
