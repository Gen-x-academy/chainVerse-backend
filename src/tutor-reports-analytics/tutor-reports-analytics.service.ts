import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTutorReportsAnalyticsDto } from './dto/create-tutor-reports-analytics.dto';
import { UpdateTutorReportsAnalyticsDto } from './dto/update-tutor-reports-analytics.dto';

@Injectable()
export class TutorReportsAnalyticsService {
  private readonly items: Array<
    { id: string } & CreateTutorReportsAnalyticsDto
  > = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('TutorReportsAnalytics item not found');
    }
    return item;
  }

  create(payload: CreateTutorReportsAnalyticsDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateTutorReportsAnalyticsDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('TutorReportsAnalytics item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
