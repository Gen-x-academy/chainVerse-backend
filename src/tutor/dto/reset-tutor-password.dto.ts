import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetTutorPasswordDto {
  @ApiProperty({ example: 'reset-token-here' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'NewSecurePassword123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
