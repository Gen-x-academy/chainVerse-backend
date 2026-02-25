import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCoursePerformanceLeaderboardDto } from './dto/create-course-performance-leaderboard.dto';
import { UpdateCoursePerformanceLeaderboardDto } from './dto/update-course-performance-leaderboard.dto';

@Injectable()
export class CoursePerformanceLeaderboardService {
  private readonly items: Array<
    { id: string } & CreateCoursePerformanceLeaderboardDto
  > = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException(
        'CoursePerformanceLeaderboard item not found',
      );
    }
    return item;
  }

  create(payload: CreateCoursePerformanceLeaderboardDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateCoursePerformanceLeaderboardDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException(
        'CoursePerformanceLeaderboard item not found',
      );
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
