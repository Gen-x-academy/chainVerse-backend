import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateStudentReportsAnalyticsDto } from './dto/create-student-reports-analytics.dto';
import { UpdateStudentReportsAnalyticsDto } from './dto/update-student-reports-analytics.dto';

@Injectable()
export class StudentReportsAnalyticsService {
  private readonly items: Array<
    { id: string } & CreateStudentReportsAnalyticsDto
  > = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('StudentReportsAnalytics item not found');
    }
    return item;
  }

  create(payload: CreateStudentReportsAnalyticsDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateStudentReportsAnalyticsDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('StudentReportsAnalytics item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
