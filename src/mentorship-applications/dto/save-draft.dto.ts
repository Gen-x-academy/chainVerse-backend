import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApplicationFieldsDto } from './application-fields.dto';

export class SaveDraftDto extends ApplicationFieldsDto {
  @ApiProperty({
    description:
      'Revision the client last loaded or saved. Fields changed on the server ' +
      'after this revision are reported as conflicts instead of overwritten.',
  })
  @IsInt()
  @Min(1)
  baseRevision!: number;

  @ApiPropertyOptional({
    description:
      'Client-generated id (e.g. UUID) for this save. Retrying with the same ' +
      'saveId returns the original result without re-applying the change; use ' +
      'it when replaying queued offline saves.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{8,128}$/, { message: 'saveId is invalid' })
  saveId?: string;
}
