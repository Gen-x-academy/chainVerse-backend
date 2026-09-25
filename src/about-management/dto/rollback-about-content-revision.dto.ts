import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

export class RollbackAboutContentRevisionDto {
  @ApiPropertyOptional({
    description:
      'The revision ID to roll back to. If omitted, rolls back to the most recent published revision.',
  })
  @IsOptional()
  @IsMongoId()
  targetRevisionId?: string;
}
