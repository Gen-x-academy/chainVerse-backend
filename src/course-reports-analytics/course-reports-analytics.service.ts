import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCourseReportsAnalyticsDto } from './dto/create-course-reports-analytics.dto';
import { UpdateCourseReportsAnalyticsDto } from './dto/update-course-reports-analytics.dto';

@Injectable()
export class CourseReportsAnalyticsService {
  private readonly items: Array<
    { id: string } & CreateCourseReportsAnalyticsDto
  > = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('CourseReportsAnalytics item not found');
    }
    return item;
  }

  create(payload: CreateCourseReportsAnalyticsDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateCourseReportsAnalyticsDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('CourseReportsAnalytics item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
