import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class DecideWaiverDto {
  @ApiProperty({ enum: ['approved', 'rejected'], example: 'approved' })
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @ApiProperty({
    required: false,
    example: 'Confirmed with patron, approved as goodwill gesture',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
