import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  MILESTONE_KEY_PATTERN,
  VerificationDecisionType,
  VerificationReasonCode,
} from '../scholarship.constants';

export class AssignVerifierDto {
  @ApiProperty({ description: 'User id of an organization member' })
  @IsMongoId()
  verifierId!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Restrict to these milestones; omit for every milestone',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(24)
  @Matches(MILESTONE_KEY_PATTERN, { each: true })
  milestoneKeys?: string[];
}

export class RecordVerificationDecisionDto {
  @ApiProperty({ enum: VerificationDecisionType })
  @IsEnum(VerificationDecisionType)
  decision!: VerificationDecisionType;

  @ApiProperty({
    enum: VerificationReasonCode,
    description: 'Must be a code permitted for the chosen decision',
  })
  @IsEnum(VerificationReasonCode)
  reasonCode!: VerificationReasonCode;

  @ApiPropertyOptional({
    description: 'Reviewer note. Do not copy evidence content here.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
