import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpdateStudentCartDto } from './dto/update-student-cart.dto';
import { CartItem, CartItemDocument } from './schemas/cart-item.schema';
import { Course } from '../admin-course/schemas/course.schema';

@Injectable()
export class StudentCartService {
  constructor(
    @InjectModel(CartItem.name)
    private readonly cartItemModel: Model<CartItemDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<Course>,
  ) {}

  async add(studentId: string, courseId: string): Promise<CartItem> {
    if (!courseId) {
      throw new BadRequestException('Invalid course ID');
    }

    // Validate course exists and is published
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (course.status !== 'published') {
      throw new BadRequestException('Course is not available for purchase');
    }

    const existing = await this.cartItemModel
      .findOne({ studentId, courseId })
      .exec();
    if (existing) {
      throw new ConflictException('Course already in cart');
    }

    // Update course cart count
    await this.courseModel
      .findByIdAndUpdate(courseId, {
        $inc: { totalCarts: 1 },
      })
      .exec();

    const cartItem = new this.cartItemModel({ studentId, courseId });
    return cartItem.save();
  }

  async getCart(
    studentId: string,
  ): Promise<{
    studentId: string;
    items: Array<{ cartItem: CartItem; course: unknown }>;
    totalItems: number;
    totalPrice: number;
  }> {
    const items = await this.cartItemModel.find({ studentId }).exec();

    // Fetch course details for each cart item
    const itemsWithDetails = await Promise.all(
      items.map(async (item) => {
        const course = await this.courseModel.findById(item.courseId).exec();
        return {
          cartItem: item,
          course: course
            ? {
                id: course.id,
                title: course.title,
                price: course.price,
                thumbnailUrl: course.thumbnailUrl,
                tutorName: course.tutorName,
              }
            : null,
        };
      }),
    );

    const validItems = itemsWithDetails.filter((i) => i.course !== null);
    const totalPrice = validItems.reduce((sum, item) => {
      return sum + (item.course as { price: number }).price;
    }, 0);

    return {
      studentId,
      items: validItems as Array<{ cartItem: CartItem; course: unknown }>,
      totalItems: validItems.length,
      totalPrice,
    };
  }

  async update(
    studentId: string,
    courseId: string,
    payload: UpdateStudentCartDto,
  ): Promise<CartItem> {
    const item = await this.cartItemModel
      .findOneAndUpdate({ studentId, courseId }, payload, { new: true })
      .exec();
    if (!item) {
      throw new NotFoundException('Cart item not found');
    }
    return item;
  }

  async remove(
    studentId: string,
    courseId: string,
  ): Promise<{
    studentId: string;
    courseId: string;
    message: string;
    deleted: boolean;
  }> {
    // Validate course exists
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const result = await this.cartItemModel
      .findOneAndDelete({ studentId, courseId })
      .exec();
    if (!result) {
      throw new NotFoundException('Cart item not found');
    }

    // Update course cart count
    await this.courseModel
      .findByIdAndUpdate(courseId, {
        $inc: { totalCarts: -1 },
      })
      .exec();

    return {
      studentId,
      courseId,
      message: 'Course removed from cart',
      deleted: true,
    };
  }

  async clearCart(
    studentId: string,
  ): Promise<{ studentId: string; message: string }> {
    const items = await this.cartItemModel.find({ studentId }).exec();

    // Update cart counts for all courses
    await Promise.all(
      items.map((item) =>
        this.courseModel
          .findByIdAndUpdate(item.courseId, {
            $inc: { totalCarts: -1 },
          })
          .exec(),
      ),
    );

    await this.cartItemModel.deleteMany({ studentId }).exec();

    return { studentId, message: 'Cart cleared' };
  }

  async getCount(studentId: string): Promise<number> {
    return this.cartItemModel.countDocuments({ studentId }).exec();
  }
}
