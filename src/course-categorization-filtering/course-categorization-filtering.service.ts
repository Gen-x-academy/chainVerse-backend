import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Cache } from 'cache-manager';
import { isValidObjectId, Model } from 'mongoose';
import {
  CourseCategorizationItem,
  CourseCategorizationItemDocument,
} from './schemas/course-categorization-item.schema';
import { CreateCourseCategorizationFilteringDto } from './dto/create-course-categorization-filtering.dto';
import { UpdateCourseCategorizationFilteringDto } from './dto/update-course-categorization-filtering.dto';
import { SearchCourseDto } from './dto/search-course.dto';

export const COURSE_DISCOVERY_CACHE_KEY = '/courses/categorization-filtering';

export type CourseItem = { id: string } & CreateCourseCategorizationFilteringDto;

type CourseItemRecord = CourseCategorizationItem & { _id: unknown };

const NOT_FOUND_MESSAGE = 'CourseCategorizationFiltering item not found';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactCaseInsensitive(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

@Injectable()
export class CourseCategorizationFilteringService {
  constructor(
    @InjectModel(CourseCategorizationItem.name)
    private readonly itemModel: Model<CourseCategorizationItemDocument>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async findAll(): Promise<CourseItem[]> {
    const docs = await this.itemModel
      .find()
      .sort({ _id: 1 })
      .lean<CourseItemRecord[]>()
      .exec();
    return docs.map((doc) => this.toItem(doc));
  }

  async findOne(id: string): Promise<CourseItem> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    const doc = await this.itemModel
      .findById(id)
      .lean<CourseItemRecord>()
      .exec();
    if (!doc) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    return this.toItem(doc);
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
   *
   * Filters are pushed down to MongoDB; relevance scoring runs in memory on
   * the filtered result set.
   */
  async search(
    dto: SearchCourseDto,
  ): Promise<Array<CourseItem & { score: number }>> {
    const q = dto.query?.toLowerCase().trim() ?? '';

    const filter: Record<string, unknown> = {};
    if (dto.category) {
      filter['metadata.category'] = exactCaseInsensitive(dto.category);
    }
    if (dto.level) {
      filter['metadata.level'] = exactCaseInsensitive(dto.level);
    }
    if (dto.tags?.length) {
      filter['metadata.tags'] = { $all: dto.tags.map(exactCaseInsensitive) };
    }

    const docs = await this.itemModel
      .find(filter)
      .sort({ _id: 1 })
      .lean<CourseItemRecord[]>()
      .exec();

    const scored = docs
      .map((doc) => this.toItem(doc))
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
        const meta = (item.metadata ?? {}) as Record<string, unknown>;

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
    const doc = await this.itemModel.create(payload);
    await this.cache.del(COURSE_DISCOVERY_CACHE_KEY);
    return this.toItem(doc.toObject() as CourseItemRecord);
  }

  async update(id: string, payload: UpdateCourseCategorizationFilteringDto) {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    const doc = await this.itemModel
      .findByIdAndUpdate(id, { $set: payload }, { new: true })
      .lean<CourseItemRecord>()
      .exec();
    if (!doc) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    await this.cache.del(COURSE_DISCOVERY_CACHE_KEY);
    await this.cache.del(`${COURSE_DISCOVERY_CACHE_KEY}/${id}`);
    return this.toItem(doc);
  }

  async remove(id: string) {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    const doc = await this.itemModel.findByIdAndDelete(id).exec();
    if (!doc) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    await this.cache.del(COURSE_DISCOVERY_CACHE_KEY);
    await this.cache.del(`${COURSE_DISCOVERY_CACHE_KEY}/${id}`);
    return { id, deleted: true };
  }

  private toItem(doc: CourseItemRecord): CourseItem {
    const item: CourseItem = { id: String(doc._id), title: doc.title };
    if (doc.description !== undefined) item.description = doc.description;
    if (doc.metadata !== undefined) item.metadata = doc.metadata;
    return item;
  }
}
