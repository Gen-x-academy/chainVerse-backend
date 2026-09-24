import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseDiscoveryController } from './course-discovery.controller';
import { CourseDiscoveryService } from './course-discovery.service';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';
import { PaginationModule } from '../common/pagination/pagination.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Course.name, schema: CourseSchema }]),
    PaginationModule,
  ],
  controllers: [CourseDiscoveryController],
  providers: [CourseDiscoveryService],
  exports: [CourseDiscoveryService],
})
export class CourseDiscoveryModule {}
