import { ApiProperty } from '@nestjs/swagger';

export class CreateStudentDto {
  @ApiProperty({
    example: 'Jane',
    description: "Student's first name",
  })
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: "Student's last name",
  })
  lastName: string;

  @ApiProperty({
    example: 'jane.doe@example.com',
    format: 'email',
    description: 'Login email; a verification link is sent here',
  })
  email: string;

  @ApiProperty({
    example: 'SecurePass1!',
    format: 'password',
    minLength: 8,
    description: 'At least 8 characters',
  })
  password: string;
}
