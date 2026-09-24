import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { HoldPriority } from '../enums/hold-priority.enum';

export class ChangePriorityDto {
  @ApiProperty({ enum: HoldPriority, example: HoldPriority.HIGH })
  @IsEnum(HoldPriority)
  priority!: HoldPriority;

  @ApiProperty({
    description:
      'Justification for the manual priority override, recorded in the audit trail',
    example: 'Faculty request approved by department head',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
