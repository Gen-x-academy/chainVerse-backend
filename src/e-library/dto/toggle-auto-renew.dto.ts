import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleAutoRenewDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  autoRenewEnabled: boolean;
}
