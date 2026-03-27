import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyTutorEmailDto {
  @ApiProperty({ example: 'jwt-verification-token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
