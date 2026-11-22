import { PartialType } from '@nestjs/swagger';
import { CreateAdminFinancialAidManagementDto } from './create-admin-financial-aid-management.dto';

/** All fields are optional; inherits every validator from the create DTO. */
export class UpdateAdminFinancialAidManagementDto extends PartialType(
  CreateAdminFinancialAidManagementDto,
) {}
