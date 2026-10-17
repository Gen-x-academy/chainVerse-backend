import { ApiProperty } from '@nestjs/swagger';

export class LoginStudentDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    format: 'email',
    description: 'Email used at registration (must be verified)',
  })
  email: string;

  @ApiProperty({
    example: 'SecurePass1!',
    format: 'password',
    description: 'Account password',
  })
  password: string;
}
