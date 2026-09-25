import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EligibilityRuleType, RuleOperator } from '../schemas/eligibility-rule.schema';
import { OrgScopedQueryDto } from './scholarship-program.dto';

export class AddEligibilityRuleDto {
  @ApiProperty({ enum: EligibilityRuleType, description: 'Type of eligibility requirement' })
  @IsEnum(EligibilityRuleType)
  ruleType: EligibilityRuleType;

  @ApiProperty({
    enum: RuleOperator,
    default: RuleOperator.AND,
    description: 'Logical operator relative to other rules',
  })
  @IsEnum(RuleOperator)
  operator: RuleOperator;

  @ApiProperty({
    type: Object,
    description:
      'Type-specific threshold/configuration values (privacy-minimized — no raw PII)',
  })
  @IsObject()
  parameters: Record<string, unknown>;

  @ApiProperty({
    default: true,
    description: 'Whether failing this rule hard-blocks the application',
  })
  @IsBoolean()
  isRequired: boolean;

  @ApiPropertyOptional({ description: 'Message shown when the applicant fails this rule', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  errorMessage?: string;
}

export class EligibilityQueryDto extends OrgScopedQueryDto {}
