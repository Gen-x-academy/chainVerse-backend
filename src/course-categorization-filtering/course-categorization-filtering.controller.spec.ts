import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CourseCategorizationFilteringController } from './course-categorization-filtering.controller';
import { CourseCategorizationFilteringService } from './course-categorization-filtering.service';

const mockCache = { del: jest.fn() };
const allowAll = { canActivate: () => true };

describe('CourseCategorizationFilteringController', () => {
  let controller: CourseCategorizationFilteringController;
  let service: CourseCategorizationFilteringService;

  beforeEach(async () => {
    mockCache.del.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseCategorizationFilteringController],
      providers: [
        CourseCategorizationFilteringService,
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAll)
      .overrideGuard(RolesGuard)
      .useValue(allowAll)
      .compile();

    controller = module.get<CourseCategorizationFilteringController>(
      CourseCategorizationFilteringController,
    );
    service = module.get<CourseCategorizationFilteringService>(
      CourseCategorizationFilteringService,
    );
  });

  describe('findAll', () => {
    it('delegates to service.findAll and returns its result', () => {
      jest.spyOn(service, 'findAll').mockReturnValue([]);
      expect(controller.findAll()).toEqual([]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('delegates to service.findOne', async () => {
      const item = await service.create({ title: 'X' });
      expect(controller.findOne(item.id)).toMatchObject({ title: 'X' });
    });

    it('propagates NotFoundException from service', () => {
      expect(() => controller.findOne('ghost')).toThrow(NotFoundException);
    });
  });

  describe('search', () => {
    it('delegates to service.search', () => {
      const spy = jest.spyOn(service, 'search').mockReturnValue([]);
      controller.search({ query: 'test' });
      expect(spy).toHaveBeenCalledWith({ query: 'test' });
    });

    it('normalises comma-separated tags string into an array', () => {
      const spy = jest.spyOn(service, 'search').mockReturnValue([]);
      // Simulate what Express does when a single string is passed for tags
      controller.search({ tags: 'defi,nft' as unknown as string[] });
      expect(spy).toHaveBeenCalledWith({ tags: ['defi', 'nft'] });
    });
  });

  describe('create', () => {
    it('delegates to service.create and returns the new item', async () => {
      const result = await controller.create({ title: 'New Course' });
      expect(result.id).toBeDefined();
      expect(result.title).toBe('New Course');
    });
  });

  describe('update', () => {
    it('delegates to service.update', async () => {
      const item = await service.create({ title: 'Old' });
      const updated = await controller.update(item.id, { title: 'New' });
      expect(updated.title).toBe('New');
    });

    it('propagates NotFoundException for unknown id', async () => {
      await expect(controller.update('ghost', { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('delegates to service.remove and returns deletion confirmation', async () => {
      const item = await service.create({ title: 'T' });
      const result = await controller.remove(item.id);
      expect(result).toEqual({ id: item.id, deleted: true });
    });

    it('propagates NotFoundException for unknown id', async () => {
      await expect(controller.remove('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
