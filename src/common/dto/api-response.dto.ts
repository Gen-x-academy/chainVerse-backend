import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard API response wrapper used across all endpoints.
 * Every successful response is shaped as:
 * { success: true, data: T, timestamp: string }
 *
 * The `message` field is optional and can carry a human-readable
 * status message (e.g. "Course created successfully.").
 */
export class ApiResponse<T = unknown> {
  @ApiProperty({
    description: 'Indicates whether the request was successful',
    example: true,
  })
  success: boolean;

  @ApiPropertyOptional({
    description: 'Response payload',
  })
  data?: T;

  @ApiPropertyOptional({
    description: 'Human-readable status message',
    example: 'Operation completed successfully.',
  })
  message?: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp of when the response was generated',
    example: '2024-01-01T00:00:00.000Z',
  })
  timestamp: string;

  constructor(partial: Partial<ApiResponse<T>> = {}) {
    this.success = partial.success ?? true;
    this.data = partial.data;
    this.message = partial.message;
    this.timestamp = partial.timestamp ?? new Date().toISOString();
  }
}
