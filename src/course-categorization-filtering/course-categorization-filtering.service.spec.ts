import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
  CourseCategorizationFilteringService,
  COURSE_DISCOVERY_CACHE_KEY,
} from './course-categorization-filtering.service';
import { CourseCategorizationItem } from './schemas/course-categorization-item.schema';

const mockCache = { del: jest.fn() };

/** Builds a chainable query mock resolving to `result` on exec(). */
function query<T>(result: T) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
  return chain;
}

const mockModel = {
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

function doc(fields: Record<string, unknown>) {
  return { _id: new Types.ObjectId(), ...fields };
}

describe('CourseCategorizationFilteringService', () => {
  let service: CourseCategorizationFilteringService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseCategorizationFilteringService,
        { provide: CACHE_MANAGER, useValue: mockCache },
        {
          provide: getModelToken(CourseCategorizationItem.name),
          useValue: mockModel,
        },
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
    it('returns an empty array when the collection is empty', async () => {
      mockModel.find.mockReturnValue(query([]));
      await expect(service.findAll()).resolves.toEqual([]);
    });

    it('maps stored documents to items with a string id', async () => {
      const a = doc({ title: 'A' });
      const b = doc({ title: 'B', description: 'd' });
      mockModel.find.mockReturnValue(query([a, b]));

      const items = await service.findAll();

      expect(items).toEqual([
        { id: a._id.toString(), title: 'A' },
        { id: b._id.toString(), title: 'B', description: 'd' },
      ]);
    });
  });

  // ------------------------------------------------------------------
  // findOne
  // ------------------------------------------------------------------

  describe('findOne', () => {
    it('returns the item when found', async () => {
      const stored = doc({ title: 'Course X' });
      mockModel.findById.mockReturnValue(query(stored));

      const found = await service.findOne(stored._id.toString());

      expect(mockModel.findById).toHaveBeenCalledWith(stored._id.toString());
      expect(found.title).toBe('Course X');
    });

    it('throws NotFoundException when no document matches', async () => {
      mockModel.findById.mockReturnValue(query(null));
      await expect(
        service.findOne(new Types.ObjectId().toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a malformed id without querying', async () => {
      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockModel.findById).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // create
  // ------------------------------------------------------------------

  describe('create', () => {
    it('persists the payload and returns the item with its id', async () => {
      const stored = doc({
        title: 'T',
        description: 'desc',
        metadata: { category: 'web3' },
      });
      mockModel.create.mockResolvedValue({ toObject: () => stored });

      const item = await service.create({
        title: 'T',
        description: 'desc',
        metadata: { category: 'web3' },
      });

      expect(mockModel.create).toHaveBeenCalledWith({
        title: 'T',
        description: 'desc',
        metadata: { category: 'web3' },
      });
      expect(item.id).toBe(stored._id.toString());
      expect(item.description).toBe('desc');
      expect((item.metadata as Record<string, unknown>)['category']).toBe(
        'web3',
      );
    });

    it('invalidates the discovery cache key after creation', async () => {
      mockModel.create.mockResolvedValue({ toObject: () => doc({ title: 'X' }) });
      await service.create({ title: 'X' });
      expect(mockCache.del).toHaveBeenCalledWith(COURSE_DISCOVERY_CACHE_KEY);
    });
  });

  // ------------------------------------------------------------------
  // update
  // ------------------------------------------------------------------

  describe('update', () => {
    it('applies a $set update and returns the updated item', async () => {
      const stored = doc({ title: 'New' });
      const id = stored._id.toString();
      mockModel.findByIdAndUpdate.mockReturnValue(query(stored));

      const updated = await service.update(id, { title: 'New' });

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: { title: 'New' } },
        { new: true },
      );
      expect(updated.title).toBe('New');
    });

    it('throws NotFoundException when id is unknown', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(query(null));
      await expect(
        service.update(new Types.ObjectId().toString(), { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a malformed id', async () => {
      await expect(service.update('ghost', { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('invalidates both list and item cache keys', async () => {
      const stored = doc({ title: 'T2' });
      const id = stored._id.toString();
      mockModel.findByIdAndUpdate.mockReturnValue(query(stored));

      await service.update(id, { title: 'T2' });

      expect(mockCache.del).toHaveBeenCalledWith(COURSE_DISCOVERY_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(
        `${COURSE_DISCOVERY_CACHE_KEY}/${id}`,
      );
    });
  });

  // ------------------------------------------------------------------
  // remove
  // ------------------------------------------------------------------

  describe('remove', () => {
    it('deletes the document and returns { id, deleted: true }', async () => {
      const stored = doc({ title: 'T' });
      const id = stored._id.toString();
      mockModel.findByIdAndDelete.mockReturnValue(query(stored));

      const result = await service.remove(id);

      expect(mockModel.findByIdAndDelete).toHaveBeenCalledWith(id);
      expect(result).toEqual({ id, deleted: true });
    });

    it('throws NotFoundException for an unknown id', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(query(null));
      await expect(
        service.remove(new Types.ObjectId().toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a malformed id', async () => {
      await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
    });

    it('invalidates both list and item cache keys', async () => {
      const stored = doc({ title: 'T' });
      const id = stored._id.toString();
      mockModel.findByIdAndDelete.mockReturnValue(query(stored));

      await service.remove(id);

      expect(mockCache.del).toHaveBeenCalledWith(COURSE_DISCOVERY_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(
        `${COURSE_DISCOVERY_CACHE_KEY}/${id}`,
      );
    });
  });

  // ------------------------------------------------------------------
  // search
  // ------------------------------------------------------------------

  describe('search', () => {
    const blockchain = doc({
      title: 'Intro to Blockchain',
      description: 'Learn the basics of blockchain technology',
      metadata: { category: 'web3', level: 'beginner', tags: ['defi', 'nft'] },
    });
    const defi = doc({
      title: 'Advanced DeFi',
      description: 'Deep dive into decentralised finance protocols',
      metadata: { category: 'web3', level: 'advanced', tags: ['defi'] },
    });
    const python = doc({
      title: 'Python for Data Science',
      description: 'Data wrangling with pandas and numpy',
      metadata: { category: 'data', level: 'beginner', tags: ['python'] },
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

    function filterArg(): Record<string, unknown> {
      return mockModel.find.mock.calls[0][0];
    }

    it('queries without filters and returns all items when none are given', async () => {
      mockModel.find.mockReturnValue(query([blockchain, defi, python]));
      const results = await service.search({});
      expect(filterArg()).toEqual({});
      expect(results).toHaveLength(3);
    });

    it('ranks title matches above description-only matches', async () => {
      mockModel.find.mockReturnValue(query([blockchain, defi, python]));
      const results = await service.search({ query: 'blockchain' });
      // 'Intro to Blockchain' matches title (+3) AND description (+2) = 5
      expect(results[0].title).toBe('Intro to Blockchain');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('finds keyword matches in description', async () => {
      mockModel.find.mockReturnValue(query([blockchain, defi, python]));
      const results = await service.search({ query: 'pandas' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Python for Data Science');
    });

    it('finds keyword matches in metadata', async () => {
      mockModel.find.mockReturnValue(query([blockchain, defi, python]));
      const results = await service.search({ query: 'defi' });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty array when query matches nothing', async () => {
      mockModel.find.mockReturnValue(query([blockchain, defi, python]));
      await expect(service.search({ query: 'zzznomatch' })).resolves.toHaveLength(
        0,
      );
    });

    it('pushes a case-insensitive exact category filter to MongoDB', async () => {
      mockModel.find.mockReturnValue(query([blockchain, defi]));
      await service.search({ category: 'WEB3' });
      const re = filterArg()['metadata.category'] as RegExp;
      expect(re.test('web3')).toBe(true);
      expect(re.test('web3-advanced')).toBe(false);
    });

    it('pushes a level filter to MongoDB', async () => {
      mockModel.find.mockReturnValue(query([defi]));
      const results = await service.search({ level: 'advanced' });
      const re = filterArg()['metadata.level'] as RegExp;
      expect(re.test('Advanced')).toBe(true);
      expect(results[0].title).toBe('Advanced DeFi');
    });

    it('requires ALL supplied tags via $all (AND semantics)', async () => {
      mockModel.find.mockReturnValue(query([blockchain]));
      await service.search({ tags: ['defi', 'nft'] });
      const tags = filterArg()['metadata.tags'] as { $all: RegExp[] };
      expect(tags.$all).toHaveLength(2);
      expect(tags.$all[0].test('DEFI')).toBe(true);
      expect(tags.$all[1].test('nft')).toBe(true);
    });

    it('escapes regex metacharacters in filter values', async () => {
      mockModel.find.mockReturnValue(query([]));
      await service.search({ category: 'c++' });
      const re = filterArg()['metadata.category'] as RegExp;
      expect(re.test('c++')).toBe(true);
      expect(re.test('ccc')).toBe(false);
    });

    it('combines query scoring with filters', async () => {
      mockModel.find.mockReturnValue(query([defi]));
      const results = await service.search({ query: 'defi', level: 'advanced' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Advanced DeFi');
    });

    it('orders results by descending relevance score', async () => {
      mockModel.find.mockReturnValue(query([defi, python, blockchain]));
      const results = await service.search({ query: 'blockchain' });
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });
});
