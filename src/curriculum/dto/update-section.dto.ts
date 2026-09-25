import { PartialType } from '@nestjs/swagger';
import { CreateSectionDto } from './create-section.dto';

/**
 * Section metadata only — position is never taken from here. Reordering goes
 * through the dedicated transactional endpoint so concurrent edits cannot
 * produce duplicate or missing positions.
 */
export class UpdateSectionDto extends PartialType(CreateSectionDto) {}
