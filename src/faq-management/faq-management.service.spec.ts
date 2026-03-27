import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  FaqManagementService,
  FAQ_CACHE_KEY,
} from './faq-management.service';

const mockCache = { del: jest.fn() };

describe('FaqManagementService', () => {
  let service: FaqManagementService;

  beforeEach(async () => {
    mockCache.del.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqManagementService,
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<FaqManagementService>(FaqManagementService);
  });

  // ------------------------------------------------------------------
  // findAll
  // ------------------------------------------------------------------

  describe('findAll', () => {
    it('returns an empty array when no FAQs exist', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('returns all created FAQs', async () => {
      await service.create({ question: 'Q1', answer: 'A1' } as any);
      await service.create({ question: 'Q2', answer: 'A2' } as any);
      expect(service.findAll()).toHaveLength(2);
    });
  });

  // ------------------------------------------------------------------
  // findOne
  // ------------------------------------------------------------------

  describe('findOne', () => {
    it('returns the FAQ when found', async () => {
      const item = await service.create({ question: 'Q', answer: 'A' } as any);
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
    it('assigns a unique id to each FAQ', async () => {
      const a = await service.create({ question: 'Q1' } as any);
      const b = await service.create({ question: 'Q2' } as any);
      expect(a.id).not.toBe(b.id);
    });

    it('invalidates the FAQ list cache key', async () => {
      await service.create({ question: 'Q' } as any);
      expect(mockCache.del).toHaveBeenCalledWith(FAQ_CACHE_KEY);
    });
  });

  // ------------------------------------------------------------------
  // update
  // ------------------------------------------------------------------

  describe('update', () => {
    it('merges the payload into the existing FAQ', async () => {
      const item = await service.create({ question: 'Old Q' } as any);
      const updated = await service.update(item.id, { question: 'New Q' } as any);
      expect((updated as any).question).toBe('New Q');
      expect((service.findOne(item.id) as any).question).toBe('New Q');
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.update('ghost', {})).rejects.toThrow(NotFoundException);
    });

    it('invalidates list and item cache keys after update', async () => {
      const item = await service.create({ question: 'Q' } as any);
      mockCache.del.mockReset();
      await service.update(item.id, {});
      expect(mockCache.del).toHaveBeenCalledWith(FAQ_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(`${FAQ_CACHE_KEY}/${item.id}`);
    });
  });

  // ------------------------------------------------------------------
  // remove
  // ------------------------------------------------------------------

  describe('remove', () => {
    it('removes the FAQ from the store', async () => {
      const item = await service.create({ question: 'Q' } as any);
      await service.remove(item.id);
      expect(service.findAll()).toHaveLength(0);
    });

    it('returns { id, deleted: true }', async () => {
      const item = await service.create({ question: 'Q' } as any);
      const result = await service.remove(item.id);
      expect(result).toEqual({ id: item.id, deleted: true });
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
    });

    it('invalidates list and item cache keys after removal', async () => {
      const item = await service.create({ question: 'Q' } as any);
      mockCache.del.mockReset();
      await service.remove(item.id);
      expect(mockCache.del).toHaveBeenCalledWith(FAQ_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(`${FAQ_CACHE_KEY}/${item.id}`);
    });
  });
});
