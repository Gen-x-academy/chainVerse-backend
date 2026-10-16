import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AboutManagementController } from './about-management.controller';
import { AboutManagementService } from './about-management.service';
import { RevisionStatus } from './schemas/about-content-revision.schema';

const allowAll = { canActivate: () => true };

describe('AboutManagementController', () => {
  let controller: AboutManagementController;

  const mockRevision = {
    _id: 'abc123',
    title: 'About Us',
    content: 'Content here',
    preview: 'Preview',
    status: RevisionStatus.DRAFT,
    author: 'user-1',
    version: 1,
    publishedAt: null,
  };

  const mockService = {
    findPublished: jest.fn().mockResolvedValue({
      ...mockRevision,
      status: RevisionStatus.PUBLISHED,
    }),
    findAllRevisions: jest.fn().mockResolvedValue([mockRevision]),
    findRevisionById: jest.fn().mockResolvedValue(mockRevision),
    createRevision: jest.fn().mockResolvedValue(mockRevision),
    updateRevision: jest.fn().mockResolvedValue({
      ...mockRevision,
      title: 'Updated',
    }),
    publishRevision: jest.fn().mockResolvedValue({
      ...mockRevision,
      status: RevisionStatus.PUBLISHED,
      publishedAt: new Date(),
    }),
    archiveRevision: jest.fn().mockResolvedValue({
      ...mockRevision,
      status: RevisionStatus.ARCHIVED,
    }),
    rollback: jest.fn().mockResolvedValue({
      ...mockRevision,
      version: 2,
    }),
  };

  beforeEach(async () => {
    Object.values(mockService).forEach((fn) => fn.mockClear());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AboutManagementController],
      providers: [
        { provide: AboutManagementService, useValue: mockService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAll)
      .overrideGuard(RolesGuard)
      .useValue(allowAll)
      .compile();

    controller = module.get<AboutManagementController>(AboutManagementController);
  });

  describe('findPublished', () => {
    it('delegates to service.findPublished', async () => {
      const result = await controller.findPublished();
      expect(result.status).toBe(RevisionStatus.PUBLISHED);
      expect(mockService.findPublished).toHaveBeenCalled();
    });
  });

  describe('findAllRevisions', () => {
    it('delegates to service.findAllRevisions', async () => {
      const result = await controller.findAllRevisions();
      expect(result).toHaveLength(1);
      expect(mockService.findAllRevisions).toHaveBeenCalled();
    });
  });

  describe('findRevisionById', () => {
    it('returns the revision for a valid id', async () => {
      const result = await controller.findRevisionById('abc123');
      expect(result._id).toBe('abc123');
      expect(mockService.findRevisionById).toHaveBeenCalledWith('abc123');
    });

    it('propagates NotFoundException', async () => {
      mockService.findRevisionById.mockRejectedValueOnce(new NotFoundException());
      await expect(controller.findRevisionById('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createRevision', () => {
    it('creates a new revision with the authenticated user as author', async () => {
      const result = await controller.createRevision(
        { title: 'T', content: 'C' },
        'user-1',
      );
      expect(result).toEqual(mockRevision);
      expect(mockService.createRevision).toHaveBeenCalledWith(
        { title: 'T', content: 'C' },
        'user-1',
      );
    });
  });

  describe('updateRevision', () => {
    it('updates the revision', async () => {
      const result = await controller.updateRevision('abc123', {
        title: 'Updated',
      });
      expect(result.title).toBe('Updated');
      expect(mockService.updateRevision).toHaveBeenCalledWith('abc123', {
        title: 'Updated',
      });
    });
  });

  describe('publishRevision', () => {
    it('publishes the revision', async () => {
      const result = await controller.publishRevision('abc123');
      expect(result.status).toBe(RevisionStatus.PUBLISHED);
      expect(mockService.publishRevision).toHaveBeenCalledWith('abc123');
    });
  });

  describe('archiveRevision', () => {
    it('archives the revision', async () => {
      const result = await controller.archiveRevision('abc123');
      expect(result.status).toBe(RevisionStatus.ARCHIVED);
      expect(mockService.archiveRevision).toHaveBeenCalledWith('abc123');
    });
  });

  describe('rollback', () => {
    it('rolls back using the provided target', async () => {
      const result = await controller.rollback(
        { targetRevisionId: 'target-id' },
        'user-1',
      );
      expect(result.version).toBe(2);
      expect(mockService.rollback).toHaveBeenCalledWith(
        { targetRevisionId: 'target-id' },
        'user-1',
      );
    });
  });
});
