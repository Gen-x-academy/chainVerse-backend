import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseCategorizationFilteringController } from './course-categorization-filtering.controller';
import { CourseCategorizationFilteringService } from './course-categorization-filtering.service';
import {
  CourseCategorizationItem,
  CourseCategorizationItemSchema,
} from './schemas/course-categorization-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CourseCategorizationItem.name,
        schema: CourseCategorizationItemSchema,
      },
    ]),
  ],
  controllers: [CourseCategorizationFilteringController],
  providers: [CourseCategorizationFilteringService],
})
export class CourseCategorizationFilteringModule {}
