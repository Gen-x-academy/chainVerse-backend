import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FaqManagementService, FAQ_CACHE_KEY } from './faq-management.service';
import {
  FaqManagement,
  FaqManagementDocument,
} from './schemas/faq-management.schema';

const mockCache = { del: jest.fn() };

const mockFaqModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  save: jest.fn(),
  exec: jest.fn(),
};

describe('FaqManagementService', () => {
  let service: FaqManagementService;
  let model: Model<FaqManagementDocument>;

  beforeEach(async () => {
    mockCache.del.mockReset();

    // Reset all mock functions
    Object.values(mockFaqModel).forEach((mock) => mock.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqManagementService,
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: getModelToken(FaqManagement.name), useValue: mockFaqModel },
      ],
    }).compile();

    service = module.get<FaqManagementService>(FaqManagementService);
    model = module.get<Model<FaqManagementDocument>>(
      getModelToken(FaqManagement.name),
    );
  });

  // ------------------------------------------------------------------
  // findAll
  // ------------------------------------------------------------------

  describe('findAll', () => {
    it('returns an empty array when no FAQs exist', async () => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockFaqModel.find.mockReturnValue(mockQuery);

      const result = await service.findAll();
      expect(result).toEqual([]);
      expect(mockFaqModel.find).toHaveBeenCalledWith({ isActive: true });
      expect(mockQuery.sort).toHaveBeenCalledWith({ order: 1 });
    });

    it('returns all active FAQs sorted by order', async () => {
      const mockFaqs = [
        { _id: '1', question: 'Q1', answer: 'A1', order: 1, isActive: true },
        { _id: '2', question: 'Q2', answer: 'A2', order: 2, isActive: true },
      ];
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockFaqs),
      };
      mockFaqModel.find.mockReturnValue(mockQuery);

      const result = await service.findAll();
      expect(result).toEqual(mockFaqs);
      expect(mockFaqModel.find).toHaveBeenCalledWith({ isActive: true });
      expect(mockQuery.sort).toHaveBeenCalledWith({ order: 1 });
    });
  });

  // ------------------------------------------------------------------
  // findOne
  // ------------------------------------------------------------------

  describe('findOne', () => {
    it('returns the FAQ when found', async () => {
      const mockFaq = { _id: '1', question: 'Q', answer: 'A', isActive: true };
      const mockQuery = { exec: jest.fn().mockResolvedValue(mockFaq) };
      mockFaqModel.findOne.mockReturnValue(mockQuery);

      const result = await service.findOne('1');
      expect(result).toEqual(mockFaq);
      expect(mockFaqModel.findOne).toHaveBeenCalledWith({
        _id: '1',
        isActive: true,
      });
    });

    it('throws NotFoundException for an unknown id', async () => {
      const mockQuery = { exec: jest.fn().mockResolvedValue(null) };
      mockFaqModel.findOne.mockReturnValue(mockQuery);

      await expect(service.findOne('ghost')).rejects.toThrow(NotFoundException);
      expect(mockFaqModel.findOne).toHaveBeenCalledWith({
        _id: 'ghost',
        isActive: true,
      });
    });
  });

  // ------------------------------------------------------------------
  // create
  // ------------------------------------------------------------------

  describe('create', () => {
    it('creates a new FAQ and invalidates cache', async () => {
      const payload = { question: 'Q1', answer: 'A1' };
      const createdFaq = { _id: '1', ...payload, isActive: true, order: 0 };

      const mockSavedFaq = { save: jest.fn().mockResolvedValue(createdFaq) };
      mockFaqModel.create.mockReturnValue(mockSavedFaq);

      const result = await service.create(payload);
      expect(result).toEqual(createdFaq);
      expect(mockFaqModel.create).toHaveBeenCalledWith(payload);
      expect(mockCache.del).toHaveBeenCalledWith(FAQ_CACHE_KEY);
    });
  });

  // ------------------------------------------------------------------
  // update
  // ------------------------------------------------------------------

  describe('update', () => {
    it('updates an existing FAQ and invalidates cache', async () => {
      const payload = { question: 'Updated Q' };
      const updatedFaq = {
        _id: '1',
        question: 'Updated Q',
        answer: 'A',
        isActive: true,
        order: 0,
      };

      const mockQuery = { exec: jest.fn().mockResolvedValue(updatedFaq) };
      mockFaqModel.findByIdAndUpdate.mockReturnValue(mockQuery);

      const result = await service.update('1', payload);
      expect(result).toEqual(updatedFaq);
      expect(mockFaqModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '1',
        payload,
        { new: true },
      );
      expect(mockCache.del).toHaveBeenCalledWith(FAQ_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(`${FAQ_CACHE_KEY}/1`);
    });

    it('throws NotFoundException for an unknown id', async () => {
      const mockQuery = { exec: jest.fn().mockResolvedValue(null) };
      mockFaqModel.findByIdAndUpdate.mockReturnValue(mockQuery);

      await expect(service.update('ghost', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(mockFaqModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'ghost',
        {},
        { new: true },
      );
    });
  });

  // ------------------------------------------------------------------
  // remove
  // ------------------------------------------------------------------

  describe('remove', () => {
    it('removes the FAQ and invalidates cache', async () => {
      const deletedFaq = {
        _id: '1',
        question: 'Q',
        answer: 'A',
        isActive: true,
        order: 0,
      };
      const mockQuery = { exec: jest.fn().mockResolvedValue(deletedFaq) };
      mockFaqModel.findByIdAndDelete.mockReturnValue(mockQuery);

      const result = await service.remove('1');
      expect(result).toEqual({ id: '1', deleted: true });
      expect(mockFaqModel.findByIdAndDelete).toHaveBeenCalledWith('1');
      expect(mockCache.del).toHaveBeenCalledWith(FAQ_CACHE_KEY);
      expect(mockCache.del).toHaveBeenCalledWith(`${FAQ_CACHE_KEY}/1`);
    });

    it('throws NotFoundException for an unknown id', async () => {
      const mockQuery = { exec: jest.fn().mockResolvedValue(null) };
      mockFaqModel.findByIdAndDelete.mockReturnValue(mockQuery);

      await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
      expect(mockFaqModel.findByIdAndDelete).toHaveBeenCalledWith('ghost');
    });
  });
});
