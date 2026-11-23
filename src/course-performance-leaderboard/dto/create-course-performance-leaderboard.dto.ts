import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateCoursePerformanceLeaderboardDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
