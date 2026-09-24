import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PatronStatus } from '../schemas/patron-profile.schema';

export class CreatePatronProfileDto {
  @ApiProperty({ description: 'Platform user ID' })
  @IsString()
  @IsNotEmpty()
  platformUserId: string;

  @ApiProperty({ description: 'Patron role', enum: ['student', 'tutor'] })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiPropertyOptional({ description: 'Display name' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  @IsString()
  @IsOptional()
  email?: string;
}

export class UpdatePatronStatusDto {
  @ApiProperty({ enum: PatronStatus, description: 'New patron status' })
  @IsEnum(PatronStatus)
  @IsNotEmpty()
  status: PatronStatus;

  @ApiProperty({ description: 'Reason for the status change' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Date when the status should expire' })
  @IsString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Appeal notes from the patron' })
  @IsString()
  @IsOptional()
  appealNote?: string;
}
