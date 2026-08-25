import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({ description: 'Stellar transaction hash to verify' })
  @IsString()
  @IsNotEmpty()
  transactionHash: string;

  @ApiProperty({ description: 'Expected payment amount' })
  @IsString()
  @IsNotEmpty()
  expectedAmount: string;

  @ApiPropertyOptional({ description: 'Course ID for the payment' })
  @IsString()
  @IsOptional()
  courseId?: string;

  @ApiPropertyOptional({ description: 'Expected destination public key' })
  @IsString()
  @IsOptional()
  expectedDestination?: string;
}
