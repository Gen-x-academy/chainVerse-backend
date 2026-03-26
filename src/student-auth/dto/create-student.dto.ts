import { ApiProperty } from '@nestjs/swagger';

export class CreateStudentDto {
  @ApiProperty({ example: 'Jane' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email: string;

  @ApiProperty({ example: 'SecurePass1!' })
  password: string;
}
