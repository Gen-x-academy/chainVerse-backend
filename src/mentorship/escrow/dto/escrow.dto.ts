import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateEscrowIntentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  agreementId!: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  expectedAmount!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  currency!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}

export class ConfirmEscrowFundingDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  agreementId!: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  providerRef!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
