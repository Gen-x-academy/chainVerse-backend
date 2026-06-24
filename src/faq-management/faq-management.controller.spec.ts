import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FaqManagementController } from './faq-management.controller';
import { FaqManagementService } from './faq-management.service';

const mockCache = { del: jest.fn() };
const allowAll = { canActivate: () => true };

describe('FaqManagementController', () => {
  let controller: FaqManagementController;
  let service: FaqManagementService;

  beforeEach(async () => {
    mockCache.del.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FaqManagementController],
      providers: [
        FaqManagementService,
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAll)
      .overrideGuard(RolesGuard)
      .useValue(allowAll)
      .compile();

    controller = module.get<FaqManagementController>(FaqManagementController);
    service = module.get<FaqManagementService>(FaqManagementService);
  });

  describe('findAll', () => {
    it('delegates to service.findAll', () => {
      const spy = jest.spyOn(service, 'findAll').mockReturnValue([]);
      expect(controller.findAll()).toEqual([]);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the FAQ for a valid id', async () => {
      const item = await service.create({ question: 'Q' } as any);
      expect(controller.findOne(item.id)).toMatchObject({ id: item.id });
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => controller.findOne('ghost')).toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('returns the newly created FAQ', async () => {
      const result = await controller.create({ question: 'What?' } as any);
      expect(result.id).toBeDefined();
    });
  });

  describe('update', () => {
    it('returns the updated FAQ', async () => {
      const item = await service.create({ question: 'Q' } as any);
      const updated = await controller.update(item.id, {
        question: 'New Q',
      } as any);
      expect(updated.question).toBe('New Q');
    });

    it('propagates NotFoundException for an unknown id', async () => {
      await expect(controller.update('ghost', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('returns deletion confirmation', async () => {
      const item = await service.create({ question: 'Q' } as any);
      const result = await controller.remove(item.id);
      expect(result).toEqual({ id: item.id, deleted: true });
    });

    it('propagates NotFoundException for an unknown id', async () => {
      await expect(controller.remove('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
