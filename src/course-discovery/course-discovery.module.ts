import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseDiscoveryController } from './course-discovery.controller';
import { CourseDiscoveryService } from './course-discovery.service';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Course.name, schema: CourseSchema }]),
  ],
  controllers: [CourseDiscoveryController],
  providers: [CourseDiscoveryService],
  exports: [CourseDiscoveryService],
})
export class CourseDiscoveryModule {}
