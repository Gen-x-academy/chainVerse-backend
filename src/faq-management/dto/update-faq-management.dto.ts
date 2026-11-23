import { PartialType } from '@nestjs/swagger';
import { CreateFaqManagementDto } from './create-faq-management.dto';

export class UpdateFaqManagementDto extends PartialType(
  CreateFaqManagementDto,
) {}
