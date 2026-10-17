import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class SubmitApplicationDto {
  @ApiProperty({
    description:
      'Revision the mentee reviewed. Submission is rejected if the draft has ' +
      'changed since, so nobody submits content they have not seen.',
  })
  @IsInt()
  @Min(1)
  revision!: number;
}
