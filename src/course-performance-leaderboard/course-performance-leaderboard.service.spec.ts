import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  CoursePerformanceLeaderboardService,
  LEADERBOARD_CACHE_KEY,
} from './course-performance-leaderboard.service';

const mockCache = { del: jest.fn() };

describe('CoursePerformanceLeaderboardService', () => {
  let service: CoursePerformanceLeaderboardService;

  beforeEach(async () => {
    mockCache.del.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursePerformanceLeaderboardService,
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<CoursePerformanceLeaderboardService>(
      CoursePerformanceLeaderboardService,
    );
  });

  // ------------------------------------------------------------------
  // findAll
  // ------------------------------------------------------------------

  describe('findAll', () => {
    it('returns empty array before any items are created', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('returns all created items', async () => {
      await service.create({});
      await service.create({});
      expect(service.findAll()).toHaveLength(2);
    });
  });

  // ------------------------------------------------------------------
  // findOne
  // ------------------------------------------------------------------

  describe('findOne', () => {
    it('returns the item when it exists', async () => {
      const item = await service.create({});
      expect(service.findOne(item.id)).toMatchObject({ id: item.id });
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.findOne('ghost')).toThrow(NotFoundException);
    });
  });

  // ------------------------------------------------------------------
  // create
  // ------------------------------------------------------------------

  describe('create', () => {
    it('assigns a unique id', async () => {
      const a = await service.create({});
      const b = await service.create({});
      expect(a.id).not.toBe(b.id);
    });

    it('invalidates the leaderboard list cache', async () => {
      await service.create({});
      expect(mockCache.del).toHaveBeenCalledWith(LEADERBOARD_CACHE_KEY);
    });
  });

  // ------------------------------------------------------------------
  // update
  // ------------------------------------------------------------------

  describe('update', () => {
    it('merges the payload into the existing item', async () => {
      const item = await service.create({ score: 10 } as any);
      const updated = await service.update(item.id, { score: 99 } as any);
      expect((updated as any).score).toBe(99);
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.update('ghost', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('invalidates list and item cache keys', async () => {
      const item = await service.create({});
      mockCache.del.mockReset();
      await service.update(item.id, {});
      expect(mockCache.del).toHaveBeenCalledWith(LEADERBOARD_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(
        `${LEADERBOARD_CACHE_KEY}/${item.id}`,
      );
    });
  });

  // ------------------------------------------------------------------
  // remove
  // ------------------------------------------------------------------

  describe('remove', () => {
    it('removes the item from the collection', async () => {
      const item = await service.create({});
      await service.remove(item.id);
      expect(service.findAll()).toHaveLength(0);
    });

    it('returns { id, deleted: true }', async () => {
      const item = await service.create({});
      const result = await service.remove(item.id);
      expect(result).toEqual({ id: item.id, deleted: true });
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
    });

    it('invalidates list and item cache keys', async () => {
      const item = await service.create({});
      mockCache.del.mockReset();
      await service.remove(item.id);
      expect(mockCache.del).toHaveBeenCalledWith(LEADERBOARD_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(
        `${LEADERBOARD_CACHE_KEY}/${item.id}`,
      );
    });
  });
});
