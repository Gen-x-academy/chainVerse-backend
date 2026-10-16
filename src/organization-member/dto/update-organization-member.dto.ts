import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { OrganizationRole } from '../../common/enums/organization-role.enum';

export class UpdateOrganizationMemberDto {
  @ApiProperty({
    enum: OrganizationRole,
    required: false,
    example: OrganizationRole.ADMIN,
  })
  @IsEnum(OrganizationRole)
  @IsOptional()
  role?: OrganizationRole;
}
