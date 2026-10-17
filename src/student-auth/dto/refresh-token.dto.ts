import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NjVmMWMyZThiM2E0ZDAwMTIzNDU2NzgiLCJqdGkiOiI5ZjJjM2E0YjVkNmU3ZjgwOTFhMmIzYzRkNWU2ZjcwOCIsImlhdCI6MTc2MDYwMDAwMCwiZXhwIjoxNzYxMjA0ODAwfQ.4l9cR2xT7mYb3qKz8vN1pWsE6hJdUoFgA0iLtBnCyXk',
    description: 'Refresh token (JWT) returned by /auth/student/login',
  })
  refreshToken: string;
}
