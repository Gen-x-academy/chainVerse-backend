import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NjVmMWMyZThiM2E0ZDAwMTIzNDU2NzgiLCJlbWFpbCI6ImphbmUuZG9lQGV4YW1wbGUuY29tIiwicHVycG9zZSI6ImVtYWlsLXZlcmlmaWNhdGlvbiJ9.Qm2dV8sL0rT5yXc7kP3nH9wJ1aE4fG6bZuNoIqYeMtA',
    description:
      'Verification token (JWT) from the link in the verification email',
  })
  token: string;
}
