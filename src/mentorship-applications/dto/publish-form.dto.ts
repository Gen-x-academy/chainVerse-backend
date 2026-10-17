import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QUESTION_KEY_PATTERN } from '../mentorship-applications.constants';

export class FormQuestionDto {
  @ApiProperty({ example: 'experience' })
  @Matches(QUESTION_KEY_PATTERN, { message: 'question key is invalid' })
  key!: string;

  @ApiProperty({ example: 'Describe your smart-contract experience' })
  @IsString()
  @MaxLength(500)
  label!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: 2000, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxLength?: number;
}

export class PublishFormDto {
  @ApiProperty({ type: [FormQuestionDto] })
  @ValidateNested({ each: true })
  @Type(() => FormQuestionDto)
  @ArrayMinSize(0)
  @ArrayMaxSize(50)
  questions!: FormQuestionDto[];

  @ApiProperty({ example: '2026-10' })
  @IsString()
  @MaxLength(32)
  consentVersion!: string;
}
