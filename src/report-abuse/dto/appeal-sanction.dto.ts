import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AppealSanctionDto {
  @ApiProperty()
  @IsString()
  appealReason: string;
}
