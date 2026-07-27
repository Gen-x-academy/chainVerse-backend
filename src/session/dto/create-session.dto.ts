import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({
    description: 'JWT or session token identifier',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({
    description: 'IP address of the client initiating the session',
    example: '192.168.1.42',
  })
  @IsString()
  @IsNotEmpty()
  ipAddress!: string;

  @ApiProperty({
    description: 'User agent string from the client browser/application',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })
  @IsString()
  @IsNotEmpty()
  userAgent!: string;
}
