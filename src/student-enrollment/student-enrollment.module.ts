import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { StudentEnrollmentController } from './student-enrollment.controller';
import { StudentEnrollmentService } from './student-enrollment.service';
import { Enrollment, EnrollmentSchema } from './schemas/enrollment.schema';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';
import {
  CartItem,
  CartItemSchema,
} from '../student-cart/schemas/cart-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CartItem.name, schema: CartItemSchema },
    ]),
  ],
  controllers: [StudentEnrollmentController],
  providers: [StudentEnrollmentService],
  exports: [StudentEnrollmentService],
})
export class StudentEnrollmentModule {}
