import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsISO8601, IsString, Length } from 'class-validator';
import { MentorshipFacilitatorRole } from '../mentorship-facilitator.schema';

export class AssignMentorshipFacilitatorDto {
  @ApiProperty({ description: 'JWT subject of the assignee; must be a distinct, authorized user.' })
  @IsString()
  userId: string;
  @ApiProperty({ enum: MentorshipFacilitatorRole })
  @IsEnum(MentorshipFacilitatorRole)
  role: MentorshipFacilitatorRole;
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  startsAt: string;
  @ApiProperty({ format: 'date-time', description: 'Access is automatically revoked at this instant.' })
  @IsISO8601()
  endsAt: string;
  @ApiProperty({ minLength: 8, maxLength: 64 })
  @IsString()
  @Length(8, 64)
  idempotencyKey: string;
}
