import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum CancelSessionActorType {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
  STAFF = 'staff',
}

export class CancelSessionDto {
  @ApiProperty({ enum: CancelSessionActorType })
  @IsEnum(CancelSessionActorType)
  actorType!: CancelSessionActorType;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Policy version used to evaluate cancellation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  policyVersion?: string;

  @ApiProperty({ description: 'Idempotency key for safe retries' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  idempotencyKey!: string;
}
