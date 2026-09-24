import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelHoldDto {
  @ApiPropertyOptional({
    description:
      "Reason for cancellation. Required when staff cancel another user's hold.",
    example: 'Duplicate request from patron',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
