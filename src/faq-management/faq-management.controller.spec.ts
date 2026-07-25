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

  const mockFaq = { id: '1', question: 'Q', answer: 'A', isActive: true, order: 0 };

  beforeEach(async () => {
    mockCache.del.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FaqManagementController],
      providers: [
        {
          provide: FaqManagementService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([mockFaq]),
            findOne: jest.fn().mockResolvedValue(mockFaq),
            create: jest.fn().mockResolvedValue(mockFaq),
            update: jest.fn().mockResolvedValue({ ...mockFaq, question: 'New Q' }),
            remove: jest.fn().mockResolvedValue({ id: '1', deleted: true }),
          },
        },
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
    it('delegates to service.findAll', async () => {
      expect(await controller.findAll()).toEqual([mockFaq]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the FAQ for a valid id', async () => {
      expect(await controller.findOne('1')).toEqual(mockFaq);
      expect(service.findOne).toHaveBeenCalledWith('1');
    });

    it('throws NotFoundException for an unknown id', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());
      await expect(controller.findOne('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('returns the newly created FAQ', async () => {
      const result = await controller.create({ question: 'What?' } as any);
      expect(result).toEqual(mockFaq);
      expect(service.create).toHaveBeenCalledWith({ question: 'What?' });
    });
  });

  describe('update', () => {
    it('returns the updated FAQ', async () => {
      const result = await controller.update('1', { question: 'New Q' } as any);
      expect(result.question).toBe('New Q');
      expect(service.update).toHaveBeenCalledWith('1', { question: 'New Q' });
    });

    it('propagates NotFoundException for an unknown id', async () => {
      jest.spyOn(service, 'update').mockRejectedValue(new NotFoundException());
      await expect(controller.update('ghost', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('returns deletion confirmation', async () => {
      const result = await controller.remove('1');
      expect(result).toEqual({ id: '1', deleted: true });
      expect(service.remove).toHaveBeenCalledWith('1');
    });

    it('propagates NotFoundException for an unknown id', async () => {
      jest.spyOn(service, 'remove').mockRejectedValue(new NotFoundException());
      await expect(controller.remove('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
