import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';
import {
  CourseSection,
  CourseSectionSchema,
} from './schemas/course-section.schema';
import { Lesson, LessonSchema } from './schemas/lesson.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: CourseSection.name, schema: CourseSectionSchema },
      { name: Lesson.name, schema: LessonSchema },
    ]),
  ],
  controllers: [CurriculumController],
  providers: [CurriculumService],
  exports: [CurriculumService],
})
export class CurriculumModule {}
