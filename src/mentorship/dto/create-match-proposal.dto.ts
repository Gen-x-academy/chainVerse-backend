import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MatchTermsDto } from './match-terms.dto';

/** Proposal opened by a participant (the mentee or the mentor themself). */
export class CreateMatchProposalDto {
  @ApiProperty({ description: 'Mentor user id' })
  @IsMongoId()
  mentorId!: string;

  @ApiProperty({ description: 'Mentee user id' })
  @IsMongoId()
  menteeId!: string;

  @ApiProperty({ example: 'soroban-foundations', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  programId!: string;

  @ApiProperty({ type: MatchTermsDto })
  @ValidateNested()
  @Type(() => MatchTermsDto)
  terms!: MatchTermsDto;

  @ApiPropertyOptional({
    description: 'Hours until the proposal expires; defaults to MENTORSHIP_PROPOSAL_TTL_HOURS',
    minimum: 1,
    maximum: 720,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;

  @ApiPropertyOptional({ description: 'Message visible to both participants', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
