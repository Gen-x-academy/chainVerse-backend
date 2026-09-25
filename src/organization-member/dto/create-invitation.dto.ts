import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({ description: 'Organization to invite the user to' })
  @IsString()
  @IsNotEmpty()
  organizationId!: string;

  @ApiProperty({ description: 'Email address of the invitee' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
