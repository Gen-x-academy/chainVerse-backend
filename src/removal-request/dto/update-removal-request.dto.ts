import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateRemovalRequestDto } from './create-removal-request.dto';

export class UpdateRemovalRequestDto extends PartialType(
  CreateRemovalRequestDto,
) {
  @ApiPropertyOptional({
    description: 'Moderation status',
    enum: ['pending', 'approved', 'rejected'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}
