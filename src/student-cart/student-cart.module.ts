import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentCartController } from './student-cart.controller';
import { StudentCartService } from './student-cart.service';
import { CartItem, CartItemSchema } from './schemas/cart-item.schema';
import { Course, CourseSchema } from '../admin-course/schemas/course.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CartItem.name, schema: CartItemSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
  ],
  controllers: [StudentCartController],
  providers: [StudentCartService],
})
export class StudentCartModule {}
