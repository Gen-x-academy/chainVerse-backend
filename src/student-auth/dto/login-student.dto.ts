import { ApiProperty } from '@nestjs/swagger';

export class LoginStudentDto {
  @ApiProperty({ example: 'jane.doe@example.com' })
  email: string;

  @ApiProperty({ example: 'SecurePass1!' })
  password: string;
}
