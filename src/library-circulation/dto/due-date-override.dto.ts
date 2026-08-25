import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class DueDateOverrideDto {
  @IsNotEmpty()
  @IsDateString()
  newDueAt: string;

  @IsNotEmpty()
  @IsString()
  reason: string;
}
