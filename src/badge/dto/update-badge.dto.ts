import { PartialType } from '@nestjs/swagger';
import { CreateBadgeDto } from './create-badge.dto';

/** All badge fields are optional on update; create-time rules still apply. */
export class UpdateBadgeDto extends PartialType(CreateBadgeDto) {}
