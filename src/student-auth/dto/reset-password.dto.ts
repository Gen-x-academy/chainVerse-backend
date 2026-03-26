import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'reset-token-from-email' })
  token: string;

  @ApiProperty({ example: 'NewSecurePass1!' })
  newPassword: string;
}
