import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CreateCourseCategorizationFilteringDto } from './dto/create-course-categorization-filtering.dto';
import { UpdateCourseCategorizationFilteringDto } from './dto/update-course-categorization-filtering.dto';
import { SearchCourseDto } from './dto/search-course.dto';

export const COURSE_DISCOVERY_CACHE_KEY = '/courses/categorization-filtering';

export type CourseItem = {
  id: string;
} & CreateCourseCategorizationFilteringDto;

@Injectable()
export class CourseCategorizationFilteringService {
  private readonly items: CourseItem[] = [];

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

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

  /**
   * Full-text search across course title, description and metadata.
   *
   * Scoring:
   *   +3  – query found in title
   *   +2  – query found in description
   *   +1  – query found anywhere in JSON-serialised metadata
   *
   * Filters (all optional, combined with AND logic):
   *   category – must match item.metadata.category (case-insensitive)
   *   level    – must match item.metadata.level    (case-insensitive)
   *   tags     – item.metadata.tags (array) must include every supplied tag
   *
   * Results with score > 0 are returned ordered by descending relevance.
   * When no query is provided every item passes the text-match step (score 0)
   * and results are ordered by insertion order after filters are applied.
   */
  search(dto: SearchCourseDto): Array<CourseItem & { score: number }> {
    const q = dto.query?.toLowerCase().trim() ?? '';

    const scored = this.items
      .map((item) => {
        // --- text matching ---
        let score = 0;
        if (q) {
          if (item.title.toLowerCase().includes(q)) score += 3;
          if (item.description?.toLowerCase().includes(q)) score += 2;
          if (
            item.metadata &&
            JSON.stringify(item.metadata).toLowerCase().includes(q)
          )
            score += 1;
        }

        // --- filter matching ---
        const meta = item.metadata ?? {};

        if (dto.category) {
          const cat = String(meta['category'] ?? '').toLowerCase();
          if (cat !== dto.category.toLowerCase()) return null;
        }

        if (dto.level) {
          const lvl = String(meta['level'] ?? '').toLowerCase();
          if (lvl !== dto.level.toLowerCase()) return null;
        }

        if (dto.tags?.length) {
          const itemTags: string[] = Array.isArray(meta['tags'])
            ? (meta['tags'] as string[]).map((t) => String(t).toLowerCase())
            : [];
          const allMatch = dto.tags.every((tag) =>
            itemTags.includes(tag.toLowerCase()),
          );
          if (!allMatch) return null;
        }

        // drop text-search misses only when a query was provided
        if (q && score === 0) return null;

        return { ...item, score };
      })
      .filter((x): x is CourseItem & { score: number } => x !== null);

    // sort by descending relevance score, preserve insertion order for ties
    return scored.sort((a, b) => b.score - a.score);
  }

  async create(payload: CreateCourseCategorizationFilteringDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    await this.cache.del(COURSE_DISCOVERY_CACHE_KEY);
    return created;
  }

  async update(id: string, payload: UpdateCourseCategorizationFilteringDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    await this.cache.del(COURSE_DISCOVERY_CACHE_KEY);
    await this.cache.del(`${COURSE_DISCOVERY_CACHE_KEY}/${id}`);
    return item;
  }

  async remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException(
        'CourseCategorizationFiltering item not found',
      );
    }
    this.items.splice(index, 1);
    await this.cache.del(COURSE_DISCOVERY_CACHE_KEY);
    await this.cache.del(`${COURSE_DISCOVERY_CACHE_KEY}/${id}`);
    return { id, deleted: true };
  }
}
