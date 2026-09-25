import { PartialType } from '@nestjs/swagger';
import { CreateStudentAccountSettingsDto } from './create-student-account-settings.dto';

export class UpdateStudentAccountSettingsDto extends PartialType(
  CreateStudentAccountSettingsDto,
) {}
