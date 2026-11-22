import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Request body for creating a block. The block always applies both ways. */
export class CreateMentorshipBlockDto {
  @ApiProperty({
    description: 'User to block from all mentorship matching with you',
  })
  @IsMongoId()
  blockedUserId!: string;

  @ApiPropertyOptional({
    description: 'Private to you; never shown to the blocked user',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}

/**
 * View of a block owned by the caller. It deliberately omits `blockerId`:
 * the caller is always the blocker, and the blocked user must never learn
 * that a block exists or who created it.
 */
export class MentorshipBlockViewDto {
  @ApiProperty({ description: 'The blocked user id' })
  blockedUserId!: string;

  @ApiPropertyOptional({
    description: 'Private reason, visible only to the blocker',
    nullable: true,
  })
  reason?: string | null;

  @ApiProperty({ description: 'ISO-8601 creation timestamp' })
  createdAt!: string;
}
