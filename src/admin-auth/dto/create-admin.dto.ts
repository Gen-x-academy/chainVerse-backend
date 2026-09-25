import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAdminDto {
  @ApiProperty({ example: 'John', description: 'Admin first name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Admin last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'admin@example.com', description: 'Admin email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'password123', description: 'Admin password (min 8 characters)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}