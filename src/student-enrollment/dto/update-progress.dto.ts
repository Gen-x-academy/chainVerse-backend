import { IsBoolean, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class UpdateProgressDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  lessonIndex: number;

  @IsNotEmpty()
  @IsBoolean()
  completed: boolean;
}
