import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCourseCategorizationFilteringDto } from './dto/create-course-categorization-filtering.dto';
import { UpdateCourseCategorizationFilteringDto } from './dto/update-course-categorization-filtering.dto';

@Injectable()
export class CourseCategorizationFilteringService {
  private readonly items: Array<
    { id: string } & CreateCourseCategorizationFilteringDto
  > = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException(
        'CourseCategorizationFiltering item not found',
      );
    }
    return item;
  }

  create(payload: CreateCourseCategorizationFilteringDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateCourseCategorizationFilteringDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException(
        'CourseCategorizationFiltering item not found',
      );
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
