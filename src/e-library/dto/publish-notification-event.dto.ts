import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { LibraryEventType } from '../schemas/notification-event.schema';

export class PublishNotificationEventDto {
  @ApiProperty({ enum: LibraryEventType, example: LibraryEventType.CHECKOUT })
  @IsEnum(LibraryEventType)
  eventType: LibraryEventType;

  @ApiProperty({
    description: 'Unique, stable event ID (client-supplied for idempotency)',
    example: 'evt-20260825-abc123',
  })
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @ApiPropertyOptional({
    description: 'Schema version of the payload',
    example: 1,
  })
  @IsOptional()
  schemaVersion?: number;

  @ApiPropertyOptional({
    description: 'Event payload data (no secrets)',
    example: { loanId: 'abc123', bookTitle: 'Dune' },
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
