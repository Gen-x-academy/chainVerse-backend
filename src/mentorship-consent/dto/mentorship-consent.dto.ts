import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ConsentDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  sessionId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  participantId!: string;

  @ApiProperty({ enum: ['prohibited', 'optional', 'required'] })
  @IsIn(['prohibited', 'optional', 'required'])
  mode!: 'prohibited' | 'optional' | 'required';

  @ApiPropertyOptional({ enum: ['pending', 'granted', 'revoked'] })
  @IsOptional()
  @IsIn(['pending', 'granted', 'revoked'])
  status?: 'pending' | 'granted' | 'revoked';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  retentionPolicy?: string;
}

export class DisputeDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  sessionId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  complainantId!: string;

  @ApiProperty({ enum: ['attendance', 'completion', 'duration', 'outcome'] })
  @IsIn(['attendance', 'completion', 'duration', 'outcome'])
  type!: 'attendance' | 'completion' | 'duration' | 'outcome';

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceRefs?: string[];

  @ApiProperty()
  @IsDateString()
  dueAt!: string;
}
