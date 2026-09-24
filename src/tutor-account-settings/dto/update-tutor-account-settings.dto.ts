import { PartialType } from '@nestjs/swagger';
import { CreateTutorAccountSettingsDto } from './create-tutor-account-settings.dto';

export class UpdateTutorAccountSettingsDto extends PartialType(
  CreateTutorAccountSettingsDto,
) {}
