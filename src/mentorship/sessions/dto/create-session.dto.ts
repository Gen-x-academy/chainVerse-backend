import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, MinLength, MaxLength } from 'class-validator';

export class CreateMentorshipSessionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  agreementId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  mentorId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  menteeId!: string;

  @ApiProperty()
  @IsDateString()
  scheduledStart!: string;

  @ApiProperty()
  @IsDateString()
  scheduledEnd!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  idempotencyKey!: string;
}
