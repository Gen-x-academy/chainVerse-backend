import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CreateCoursePerformanceLeaderboardDto } from './dto/create-course-performance-leaderboard.dto';
import { UpdateCoursePerformanceLeaderboardDto } from './dto/update-course-performance-leaderboard.dto';

export const LEADERBOARD_CACHE_KEY = '/courses/performance-leaderboard';

@Injectable()
export class CoursePerformanceLeaderboardService {
  private readonly items: Array<
    { id: string } & CreateCoursePerformanceLeaderboardDto
  > = [];

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

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

  async create(payload: CreateCoursePerformanceLeaderboardDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    await this.cache.del(LEADERBOARD_CACHE_KEY);
    return created;
  }

  async update(id: string, payload: UpdateCoursePerformanceLeaderboardDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    await this.cache.del(LEADERBOARD_CACHE_KEY);
    await this.cache.del(`${LEADERBOARD_CACHE_KEY}/${id}`);
    return item;
  }

  async remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException(
        'CoursePerformanceLeaderboard item not found',
      );
    }
    this.items.splice(index, 1);
    await this.cache.del(LEADERBOARD_CACHE_KEY);
    await this.cache.del(`${LEADERBOARD_CACHE_KEY}/${id}`);
    return { id, deleted: true };
  }
}
