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

@Injectable()
export class StudentCartService {
  constructor(
    @InjectModel(CartItem.name)
    private readonly cartItemModel: Model<CartItemDocument>,
  ) {}

  async add(studentId: string, courseId: string): Promise<CartItem> {
    if (!courseId) {
      throw new BadRequestException('Invalid course ID');
    }

    const existing = await this.cartItemModel
      .findOne({ studentId, courseId })
      .exec();
    if (existing) {
      throw new ConflictException('Course already in cart');
    }

    const cartItem = new this.cartItemModel({ studentId, courseId });
    return cartItem.save();
  }

  async getCart(
    studentId: string,
  ): Promise<{ studentId: string; items: CartItem[]; totalItems: number }> {
    const items = await this.cartItemModel.find({ studentId }).exec();
    return { studentId, items, totalItems: items.length };
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
    const result = await this.cartItemModel
      .findOneAndDelete({ studentId, courseId })
      .exec();
    if (!result) {
      throw new NotFoundException('Cart item not found');
    }
    return {
      studentId,
      courseId,
      message: 'Course removed from cart',
      deleted: true,
    };
  }
}
