import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  PrivacyPolicyManagementService,
  PRIVACY_POLICY_CACHE_KEY,
} from './privacy-policy-management.service';

const mockCache = { del: jest.fn() };

describe('PrivacyPolicyManagementService', () => {
  let service: PrivacyPolicyManagementService;

  beforeEach(async () => {
    mockCache.del.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyPolicyManagementService,
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<PrivacyPolicyManagementService>(
      PrivacyPolicyManagementService,
    );
  });

  // ------------------------------------------------------------------
  // findAll
  // ------------------------------------------------------------------

  describe('findAll', () => {
    it('returns an empty array initially', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('returns all items after creation', async () => {
      await service.create({ title: 'Policy v1' } as any);
      expect(service.findAll()).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------
  // findOne
  // ------------------------------------------------------------------

  describe('findOne', () => {
    it('returns the policy item when found', async () => {
      const item = await service.create({ title: 'Policy' } as any);
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
    it('assigns unique ids', async () => {
      const a = await service.create({ title: 'A' } as any);
      const b = await service.create({ title: 'B' } as any);
      expect(a.id).not.toBe(b.id);
    });

    it('invalidates the privacy policy list cache', async () => {
      await service.create({ title: 'P' } as any);
      expect(mockCache.del).toHaveBeenCalledWith(PRIVACY_POLICY_CACHE_KEY);
    });
  });

  // ------------------------------------------------------------------
  // update
  // ------------------------------------------------------------------

  describe('update', () => {
    it('merges the payload into the existing item', async () => {
      const item = await service.create({ title: 'Old' } as any);
      const updated = await service.update(item.id, { title: 'New' } as any);
      expect((updated as any).title).toBe('New');
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.update('ghost', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('invalidates list and item cache keys', async () => {
      const item = await service.create({ title: 'T' } as any);
      mockCache.del.mockReset();
      await service.update(item.id, {});
      expect(mockCache.del).toHaveBeenCalledWith(PRIVACY_POLICY_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(
        `${PRIVACY_POLICY_CACHE_KEY}/${item.id}`,
      );
    });
  });

  // ------------------------------------------------------------------
  // remove
  // ------------------------------------------------------------------

  describe('remove', () => {
    it('removes the item', async () => {
      const item = await service.create({ title: 'T' } as any);
      await service.remove(item.id);
      expect(service.findAll()).toHaveLength(0);
    });

    it('returns { id, deleted: true }', async () => {
      const item = await service.create({ title: 'T' } as any);
      const result = await service.remove(item.id);
      expect(result).toEqual({ id: item.id, deleted: true });
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
    });

    it('invalidates list and item cache keys', async () => {
      const item = await service.create({ title: 'T' } as any);
      mockCache.del.mockReset();
      await service.remove(item.id);
      expect(mockCache.del).toHaveBeenCalledWith(PRIVACY_POLICY_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(
        `${PRIVACY_POLICY_CACHE_KEY}/${item.id}`,
      );
    });
  });
});
