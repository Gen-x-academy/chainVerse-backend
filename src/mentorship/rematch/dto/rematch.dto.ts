import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  BlockerKind,
  BlockerStatus,
  RematchReasonCode,
} from '../schemas/rematch-request.schema';

export class BlockerRefDto {
  @ApiProperty({ enum: BlockerKind })
  @IsIn([BlockerKind.FINANCIAL, BlockerKind.SAFETY])
  kind!: BlockerKind;

  @ApiProperty({ maxLength: 128, description: 'Opaque reference to the open case' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  ref!: string;

  @ApiProperty({ enum: BlockerStatus })
  @IsIn([BlockerStatus.OPEN, BlockerStatus.CLOSED])
  status!: BlockerStatus;
}

/** Request a rematch. The private reason is never exposed to the counterpart. */
export class RequestRematchDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  mentorshipId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  counterpartId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  participantIds!: string[];

  @ApiProperty({ enum: RematchReasonCode })
  @IsIn([
    RematchReasonCode.INCOMPATIBILITY,
    RematchReasonCode.AVAILABILITY,
    RematchReasonCode.OTHER,
  ])
  reasonCode!: RematchReasonCode;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateReason?: string;

  @ApiPropertyOptional({ type: [BlockerRefDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlockerRefDto)
  blockers?: BlockerRefDto[];
}

export class ReviewRematchDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PlanClosureDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  continuityNotes!: string;
}

export class ProposeSuccessorDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  candidateId!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CloseRematchDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CancelRematchDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
