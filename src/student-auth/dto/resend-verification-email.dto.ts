import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationEmailDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
