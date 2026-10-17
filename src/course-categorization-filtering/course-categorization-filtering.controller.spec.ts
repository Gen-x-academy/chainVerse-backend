import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CourseCategorizationFilteringController } from './course-categorization-filtering.controller';
import { CourseCategorizationFilteringService } from './course-categorization-filtering.service';

const mockCache = { del: jest.fn() };
const allowAll = { canActivate: () => true };

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  search: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('CourseCategorizationFilteringController', () => {
  let controller: CourseCategorizationFilteringController;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseCategorizationFilteringController],
      providers: [
        { provide: CourseCategorizationFilteringService, useValue: mockService },
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
  });

  describe('findAll', () => {
    it('delegates to service.findAll and returns its result', async () => {
      mockService.findAll.mockResolvedValue([]);
      await expect(controller.findAll()).resolves.toEqual([]);
      expect(mockService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('delegates to service.findOne', async () => {
      mockService.findOne.mockResolvedValue({ id: 'a', title: 'X' });
      await expect(controller.findOne('a')).resolves.toMatchObject({
        title: 'X',
      });
      expect(mockService.findOne).toHaveBeenCalledWith('a');
    });

    it('propagates NotFoundException from service', async () => {
      mockService.findOne.mockRejectedValue(new NotFoundException());
      await expect(controller.findOne('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    it('delegates to service.search', () => {
      mockService.search.mockResolvedValue([]);
      controller.search({ query: 'test' });
      expect(mockService.search).toHaveBeenCalledWith({ query: 'test' });
    });

    it('normalises comma-separated tags string into an array', () => {
      mockService.search.mockResolvedValue([]);
      // Simulate what Express does when a single string is passed for tags
      controller.search({ tags: 'defi,nft' as unknown as string[] });
      expect(mockService.search).toHaveBeenCalledWith({ tags: ['defi', 'nft'] });
    });
  });

  describe('create', () => {
    it('delegates to service.create and returns the new item', async () => {
      mockService.create.mockResolvedValue({ id: 'a', title: 'New Course' });
      const result = await controller.create({ title: 'New Course' });
      expect(mockService.create).toHaveBeenCalledWith({ title: 'New Course' });
      expect(result.id).toBeDefined();
      expect(result.title).toBe('New Course');
    });
  });

  describe('update', () => {
    it('delegates to service.update', async () => {
      mockService.update.mockResolvedValue({ id: 'a', title: 'New' });
      const updated = await controller.update('a', { title: 'New' });
      expect(mockService.update).toHaveBeenCalledWith('a', { title: 'New' });
      expect(updated.title).toBe('New');
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockService.update.mockRejectedValue(new NotFoundException());
      await expect(controller.update('ghost', { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('delegates to service.remove and returns deletion confirmation', async () => {
      mockService.remove.mockResolvedValue({ id: 'a', deleted: true });
      await expect(controller.remove('a')).resolves.toEqual({
        id: 'a',
        deleted: true,
      });
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockService.remove.mockRejectedValue(new NotFoundException());
      await expect(controller.remove('ghost')).rejects.toThrow(NotFoundException);
      await expect(controller.remove('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
