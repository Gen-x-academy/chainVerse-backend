import { PartialType } from '@nestjs/swagger';
import { CreateAdminModeratorAccountSettingsDto } from './create-admin-moderator-account-settings.dto';

/** All fields are optional; inherits every validator from the create DTO. */
export class UpdateAdminModeratorAccountSettingsDto extends PartialType(
  CreateAdminModeratorAccountSettingsDto,
) {}
