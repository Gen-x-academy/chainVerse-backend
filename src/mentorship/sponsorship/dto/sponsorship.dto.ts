import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateSponsorshipDto {
  @ApiProperty() @IsString() @MinLength(1) sponsorId!: string;
  @ApiProperty() @IsString() @MinLength(1) programId!: string;
  @ApiProperty() @IsString() @MinLength(1) currency!: string;
  @ApiProperty() @IsNumber() @IsPositive() totalBudget!: number;
}

export class ReserveSponsorshipDto {
  @ApiProperty() @IsString() @MinLength(1) engagementId!: string;
  @ApiProperty() @IsNumber() @IsPositive() amount!: number;
  @ApiProperty() @IsString() @MinLength(8) idempotencyKey!: string;
}
