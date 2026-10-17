import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    example: '3f9a1c7e5b2d4086a1e9c3b7d5f20e8a6c4b2d0f9e7a5c3b1d9f7e5a3c1b9d7f',
    description:
      'Reset token from the password-reset email link (64 hex characters)',
  })
  token: string;

  @ApiProperty({
    example: 'NewSecurePass1!',
    format: 'password',
    minLength: 8,
    description: 'New password, at least 8 characters',
  })
  newPassword: string;
}
