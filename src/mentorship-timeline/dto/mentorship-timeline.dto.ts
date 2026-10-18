import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  TimelineEventType,
  TimelineVisibility,
} from '../schemas/mentorship-timeline-event.schema';

export class AppendTimelineEventDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  engagementId!: string;

  @ApiProperty({ enum: TimelineEventType })
  @IsIn(Object.values(TimelineEventType))
  type!: TimelineEventType;

  @ApiProperty({
    description: 'Id of the goal/session/milestone/... this entry links to',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  subjectId!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({ enum: TimelineVisibility })
  @IsOptional()
  @IsIn(Object.values(TimelineVisibility))
  visibility?: TimelineVisibility;

  @ApiPropertyOptional({
    type: [String],
    description: 'Extra viewers for private entries',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reviewerIds?: string[];
}

export class TimelinePageDto {
  @ApiPropertyOptional({
    description: 'Return entries with sequence strictly below this cursor',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  before?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
