import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { ApplicationFieldsDto } from './application-fields.dto';

export class CreateApplicationDto extends ApplicationFieldsDto {
  @ApiProperty({ description: 'Mentorship program being applied to' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/, { message: 'programId is invalid' })
  programId!: string;
}
