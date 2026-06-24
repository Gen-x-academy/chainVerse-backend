import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CoursePerformanceLeaderboardController } from './course-performance-leaderboard.controller';
import { CoursePerformanceLeaderboardService } from './course-performance-leaderboard.service';

const mockCache = { del: jest.fn() };
const allowAll = { canActivate: () => true };

describe('CoursePerformanceLeaderboardController', () => {
  let controller: CoursePerformanceLeaderboardController;
  let service: CoursePerformanceLeaderboardService;

  beforeEach(async () => {
    mockCache.del.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoursePerformanceLeaderboardController],
      providers: [
        CoursePerformanceLeaderboardService,
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAll)
      .overrideGuard(RolesGuard)
      .useValue(allowAll)
      .compile();

    controller = module.get<CoursePerformanceLeaderboardController>(
      CoursePerformanceLeaderboardController,
    );
    service = module.get<CoursePerformanceLeaderboardService>(
      CoursePerformanceLeaderboardService,
    );
  });

  describe('findAll', () => {
    it('delegates to service.findAll', () => {
      const spy = jest.spyOn(service, 'findAll').mockReturnValue([]);
      expect(controller.findAll()).toEqual([]);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the item for a valid id', async () => {
      const item = await service.create({});
      expect(controller.findOne(item.id)).toMatchObject({ id: item.id });
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => controller.findOne('ghost')).toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('delegates to service.create and returns the new item', async () => {
      const result = await controller.create({});
      expect(result.id).toBeDefined();
    });
  });

  describe('update', () => {
    it('delegates to service.update', async () => {
      const item = await service.create({});
      const updated = await controller.update(item.id, { score: 50 } as any);
      expect((updated as any).score).toBe(50);
    });

    it('propagates NotFoundException', async () => {
      await expect(controller.update('ghost', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('delegates to service.remove and returns deletion confirmation', async () => {
      const item = await service.create({});
      const result = await controller.remove(item.id);
      expect(result).toEqual({ id: item.id, deleted: true });
    });

    it('propagates NotFoundException', async () => {
      await expect(controller.remove('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
