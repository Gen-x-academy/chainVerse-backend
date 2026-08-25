import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AppealDecision {
  OVERTURN = 'overturned',
  UPHOLD = 'upheld',
}

export class ReviewAppealDto {
  @ApiProperty({ enum: AppealDecision })
  @IsEnum(AppealDecision)
  decision: AppealDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
