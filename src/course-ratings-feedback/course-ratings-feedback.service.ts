import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCourseRatingsFeedbackDto } from './dto/create-course-ratings-feedback.dto';
import { UpdateCourseRatingsFeedbackDto } from './dto/update-course-ratings-feedback.dto';

@Injectable()
export class CourseRatingsFeedbackService {
  private readonly items: Array<
    { id: string } & CreateCourseRatingsFeedbackDto
  > = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('CourseRatingsFeedback item not found');
    }
    return item;
  }

  create(payload: CreateCourseRatingsFeedbackDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateCourseRatingsFeedbackDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('CourseRatingsFeedback item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
