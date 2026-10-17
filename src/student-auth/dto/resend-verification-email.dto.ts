import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationEmailDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    format: 'email',
    description: 'Email of the unverified account',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
