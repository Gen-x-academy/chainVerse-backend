import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({ description: 'Stellar transaction hash to verify' })
  @IsString()
  @IsNotEmpty()
  transactionHash: string;

  @ApiProperty({ description: 'Expected payment amount' })
  @IsString()
  @IsNotEmpty()
  expectedAmount: string;

  @ApiProperty({ description: 'Course ID for the payment' })
  @IsString()
  @IsNotEmpty()
  courseId: string;
}
