import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  CourseCategorizationFilteringService,
  COURSE_DISCOVERY_CACHE_KEY,
} from './course-categorization-filtering.service';
import { CreateCourseCategorizationFilteringDto } from './dto/create-course-categorization-filtering.dto';
import { SearchCourseDto } from './dto/search-course.dto';

const mockCache = { del: jest.fn() };

describe('CourseCategorizationFilteringService', () => {
  let service: CourseCategorizationFilteringService;

  beforeEach(async () => {
    mockCache.del.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseCategorizationFilteringService,
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<CourseCategorizationFilteringService>(
      CourseCategorizationFilteringService,
    );
  });

  // ------------------------------------------------------------------
  // findAll
  // ------------------------------------------------------------------

  describe('findAll', () => {
    it('returns an empty array initially', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('returns all created items', async () => {
      await service.create({ title: 'A' });
      await service.create({ title: 'B' });
      expect(service.findAll()).toHaveLength(2);
    });
  });

  // ------------------------------------------------------------------
  // findOne
  // ------------------------------------------------------------------

  describe('findOne', () => {
    it('returns the item when found', async () => {
      const created = await service.create({ title: 'Course X' });
      const found = service.findOne(created.id);
      expect(found.title).toBe('Course X');
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.findOne('non-existent')).toThrow(NotFoundException);
    });
  });

  // ------------------------------------------------------------------
  // create
  // ------------------------------------------------------------------

  describe('create', () => {
    it('assigns a unique id to each item', async () => {
      const a = await service.create({ title: 'A' });
      const b = await service.create({ title: 'B' });
      expect(a.id).toBeDefined();
      expect(b.id).toBeDefined();
      expect(a.id).not.toBe(b.id);
    });

    it('stores optional description and metadata', async () => {
      const item = await service.create({
        title: 'T',
        description: 'desc',
        metadata: { category: 'web3' },
      });
      expect(item.description).toBe('desc');
      expect((item.metadata as Record<string, unknown>)['category']).toBe(
        'web3',
      );
    });

    it('invalidates the discovery cache key after creation', async () => {
      await service.create({ title: 'X' });
      expect(mockCache.del).toHaveBeenCalledWith(COURSE_DISCOVERY_CACHE_KEY);
    });
  });

  // ------------------------------------------------------------------
  // update
  // ------------------------------------------------------------------

  describe('update', () => {
    it('updates the item in place', async () => {
      const item = await service.create({ title: 'Old' });
      const updated = await service.update(item.id, { title: 'New' });
      expect(updated.title).toBe('New');
      expect(service.findOne(item.id).title).toBe('New');
    });

    it('throws NotFoundException when id is unknown', async () => {
      await expect(service.update('ghost', { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('invalidates both list and item cache keys', async () => {
      const item = await service.create({ title: 'T' });
      mockCache.del.mockReset();
      await service.update(item.id, { title: 'T2' });
      expect(mockCache.del).toHaveBeenCalledWith(COURSE_DISCOVERY_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(
        `${COURSE_DISCOVERY_CACHE_KEY}/${item.id}`,
      );
    });
  });

  // ------------------------------------------------------------------
  // remove
  // ------------------------------------------------------------------

  describe('remove', () => {
    it('removes the item from the store', async () => {
      const item = await service.create({ title: 'T' });
      await service.remove(item.id);
      expect(service.findAll()).toHaveLength(0);
    });

    it('returns { id, deleted: true }', async () => {
      const item = await service.create({ title: 'T' });
      const result = await service.remove(item.id);
      expect(result).toEqual({ id: item.id, deleted: true });
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
    });

    it('invalidates both list and item cache keys', async () => {
      const item = await service.create({ title: 'T' });
      mockCache.del.mockReset();
      await service.remove(item.id);
      expect(mockCache.del).toHaveBeenCalledWith(COURSE_DISCOVERY_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(
        `${COURSE_DISCOVERY_CACHE_KEY}/${item.id}`,
      );
    });
  });

  // ------------------------------------------------------------------
  // search
  // ------------------------------------------------------------------

  describe('search', () => {
    const seed: CreateCourseCategorizationFilteringDto[] = [
      {
        title: 'Intro to Blockchain',
        description: 'Learn the basics of blockchain technology',
        metadata: {
          category: 'web3',
          level: 'beginner',
          tags: ['defi', 'nft'],
        },
      },
      {
        title: 'Advanced DeFi',
        description: 'Deep dive into decentralised finance protocols',
        metadata: { category: 'web3', level: 'advanced', tags: ['defi'] },
      },
      {
        title: 'Python for Data Science',
        description: 'Data wrangling with pandas and numpy',
        metadata: { category: 'data', level: 'beginner', tags: ['python'] },
      },
    ];

    beforeEach(async () => {
      for (const dto of seed) {
        await service.create(dto);
      }
    });

    it('returns all items when no query or filters are provided', () => {
      const results = service.search({});
      expect(results).toHaveLength(3);
    });

    it('matches keyword in title with higher score than description', () => {
      const results = service.search({ query: 'blockchain' });
      // 'Intro to Blockchain' matches title (+3) AND description (+2) = 5
      expect(results[0].title).toBe('Intro to Blockchain');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('finds keyword matches in description', () => {
      const results = service.search({ query: 'pandas' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Python for Data Science');
    });

    it('finds keyword matches in metadata', () => {
      const results = service.search({ query: 'defi' });
      // Both blockchain and DeFi courses have 'defi' in metadata
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty array when query matches nothing', () => {
      expect(service.search({ query: 'zzznomatch' })).toHaveLength(0);
    });

    it('filters by category', () => {
      const results = service.search({ category: 'data' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Python for Data Science');
    });

    it('filters are case-insensitive', () => {
      const results = service.search({ category: 'WEB3' });
      expect(results).toHaveLength(2);
    });

    it('filters by level', () => {
      const results = service.search({ level: 'advanced' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Advanced DeFi');
    });

    it('filters by a single tag', () => {
      const results = service.search({ tags: ['nft'] });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Intro to Blockchain');
    });

    it('requires ALL supplied tags to match (AND semantics)', () => {
      // only the blockchain course has both defi AND nft
      const results = service.search({ tags: ['defi', 'nft'] });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Intro to Blockchain');
    });

    it('combines query and filters', () => {
      const results = service.search({ query: 'defi', level: 'advanced' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Advanced DeFi');
    });

    it('orders results by descending relevance score', () => {
      const results = service.search({ query: 'blockchain' });
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });
});
