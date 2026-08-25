import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { OrganizationRole } from '../../common/enums/organization-role.enum';

export class CreateOrganizationMemberDto {
  @ApiProperty({ description: 'Organization the membership belongs to' })
  @IsString()
  @IsNotEmpty()
  organizationId!: string;

  @ApiProperty({ description: 'User being granted membership' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: OrganizationRole, example: OrganizationRole.MEMBER })
  @IsEnum(OrganizationRole)
  role!: OrganizationRole;
}
