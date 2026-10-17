import { ApiProperty } from '@nestjs/swagger';

export class ForgetPasswordDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    format: 'email',
    description: 'Email of the account to send the reset link to',
  })
  email: string;
}
