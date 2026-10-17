import { PartialType } from '@nestjs/swagger';
import { CreateAdminAuthDto } from './create-admin-auth.dto';

export class UpdateAdminAuthDto extends PartialType(CreateAdminAuthDto) {}
