import { PartialType } from '@nestjs/swagger';
import { CreateCourseCategorizationFilteringDto } from './create-course-categorization-filtering.dto';

/**
 * All fields are optional; validation rules are inherited from the create
 * DTO so updates cannot bypass title/description/metadata constraints.
 */
export class UpdateCourseCategorizationFilteringDto extends PartialType(
  CreateCourseCategorizationFilteringDto,
) {}
