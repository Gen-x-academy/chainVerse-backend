import { PartialType } from '@nestjs/swagger';
import { CreateLessonDto } from './create-lesson.dto';

/**
 * Lesson content only — neither position nor owning section is taken from
 * here. Both move through the transactional reorder endpoint.
 */
export class UpdateLessonDto extends PartialType(CreateLessonDto) {}
