import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReviewCourseDto {
  @ApiProperty({ example: 'approved', enum: ['approved', 'rejected'] })
  @IsEnum(['approved', 'rejected'])
  @IsNotEmpty()
  decision: 'approved' | 'rejected';

  @ApiProperty({ example: 'Great course content!', required: false })
  @IsString()
  @IsOptional()
  reason?: string;
}
