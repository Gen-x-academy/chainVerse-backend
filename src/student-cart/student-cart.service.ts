import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UpdateStudentCartDto } from './dto/update-student-cart.dto';

export interface CartItem {
  id: string;
  studentId: string;
  courseId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class StudentCartService {
  private readonly cartItems: CartItem[] = [];

  add(studentId: string, courseId: string): CartItem {
    if (!courseId) {
      throw new BadRequestException('Invalid course ID');
    }

    const existing = this.cartItems.find(
      (item) => item.studentId === studentId && item.courseId === courseId,
    );
    if (existing) {
      throw new ConflictException('Course already in cart');
    }

    const cartItem: CartItem = {
      id: crypto.randomUUID(),
      studentId,
      courseId,
      quantity: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.cartItems.push(cartItem);
    return cartItem;
  }

  getCart(
    studentId: string,
  ): { studentId: string; items: CartItem[]; totalItems: number } {
    const items = this.cartItems.filter(
      (item) => item.studentId === studentId,
    );
    return { studentId, items, totalItems: items.length };
  }

  update(
    studentId: string,
    courseId: string,
    payload: UpdateStudentCartDto,
  ): CartItem {
    const item = this.cartItems.find(
      (i) => i.studentId === studentId && i.courseId === courseId,
    );
    if (!item) {
      throw new NotFoundException('Cart item not found');
    }
    Object.assign(item, { ...payload, updatedAt: new Date() });
    return item;
  }

  remove(
    studentId: string,
    courseId: string,
  ): { studentId: string; courseId: string; message: string; deleted: boolean } {
    const index = this.cartItems.findIndex(
      (i) => i.studentId === studentId && i.courseId === courseId,
    );
    if (index === -1) {
      throw new NotFoundException('Cart item not found');
    }
    this.cartItems.splice(index, 1);
    return {
      studentId,
      courseId,
      message: 'Course removed from cart',
      deleted: true,
    };
  }
}
