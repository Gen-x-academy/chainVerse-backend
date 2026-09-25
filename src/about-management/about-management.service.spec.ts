import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AboutManagementService } from './about-management.service';
import {
  AboutContentRevision,
  RevisionStatus,
} from './schemas/about-content-revision.schema';

/* ------------------------------------------------------------------ */
/*  Mock helpers                                                       */
/* ------------------------------------------------------------------ */

function buildMockModel() {
  const model: any = jest.fn().mockImplementation(function (
    this: any,
    payload: any,
  ) {
    Object.assign(this, payload);
    this.save = jest.fn().mockResolvedValue(this);
  });

  model.find = jest.fn();
  model.findOne = jest.fn();
  model.findById = jest.fn();
  model.updateMany = jest.fn();

  return model;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('AboutManagementService', () => {
  let service: AboutManagementService;
  let model: any;

  beforeEach(async () => {
    model = buildMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AboutManagementService,
        { provide: getModelToken(AboutContentRevision.name), useValue: model },
      ],
    }).compile();

    service = module.get<AboutManagementService>(AboutManagementService);
  });

  /* ================================================================ */
  /*  createRevision                                                   */
  /* ================================================================ */

  describe('createRevision', () => {
    it('creates a draft with version 1 when no revisions exist', async () => {
      const sortExec = jest.fn().mockResolvedValue(null);
      model.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({ exec: sortExec }),
        }),
      });

      const result = await service.createRevision(
        { title: 'T', content: 'C', preview: 'P' },
        'user-1',
      );
      expect(result.status).toBe(RevisionStatus.DRAFT);
      expect(result.version).toBe(1);
      expect(result.author).toBe('user-1');
    });

    it('increments version from the latest revision', async () => {
      const latest = { version: 5 };
      const sortExec = jest.fn().mockResolvedValue(latest);
      model.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({ exec: sortExec }),
        }),
      });

      const result = await service.createRevision(
        { title: 'T', content: 'C' },
        'user-1',
      );
      expect(result.version).toBe(6);
    });

    it('defaults preview to the first 200 chars of content', async () => {
      const sortExec = jest.fn().mockResolvedValue(null);
      model.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({ exec: sortExec }),
        }),
      });

      const longContent = 'A'.repeat(300);
      const result = await service.createRevision(
        { title: 'T', content: longContent },
        'user-1',
      );
      expect(result.preview).toBe('A'.repeat(200));
    });
  });

  /* ================================================================ */
  /*  updateRevision                                                   */
  /* ================================================================ */

  describe('updateRevision', () => {
    it('updates fields on a draft revision', async () => {
      const doc = {
        _id: 'abc',
        status: RevisionStatus.DRAFT,
        title: 'Old',
        content: 'Old',
        save: jest.fn().mockResolvedValue(true),
      };
      const execMock = jest.fn().mockResolvedValue(doc);
      model.findById.mockReturnValue({ exec: execMock });

      await service.updateRevision('abc', { title: 'New' });
      expect(doc.title).toBe('New');
      expect(doc.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when revision does not exist', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      model.findById.mockReturnValue({ exec: execMock });

      await expect(
        service.updateRevision('ghost', { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when trying to edit a published revision', async () => {
      const doc = {
        _id: 'abc',
        status: RevisionStatus.PUBLISHED,
        save: jest.fn(),
      };
      const execMock = jest.fn().mockResolvedValue(doc);
      model.findById.mockReturnValue({ exec: execMock });

      await expect(
        service.updateRevision('abc', { title: 'X' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  /* ================================================================ */
  /*  publishRevision                                                  */
  /* ================================================================ */

  describe('publishRevision', () => {
    it('publishes a draft and archives previous published', async () => {
      const doc = {
        _id: 'abc',
        status: RevisionStatus.DRAFT,
        publishedAt: null,
        save: jest.fn().mockImplementation(function (this: any) {
          return this;
        }),
      };
      const execMock = jest.fn().mockResolvedValue(doc);
      model.findById.mockReturnValue({ exec: execMock });
      model.updateMany.mockResolvedValue({});

      const result = await service.publishRevision('abc');
      expect(result.status).toBe(RevisionStatus.PUBLISHED);
      expect(result.publishedAt).toBeInstanceOf(Date);
      expect(model.updateMany).toHaveBeenCalledWith(
        { status: RevisionStatus.PUBLISHED },
        { $set: { status: RevisionStatus.ARCHIVED } },
      );
    });

    it('throws NotFoundException when revision does not exist', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      model.findById.mockReturnValue({ exec: execMock });

      await expect(service.publishRevision('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when already published', async () => {
      const doc = { _id: 'abc', status: RevisionStatus.PUBLISHED };
      const execMock = jest.fn().mockResolvedValue(doc);
      model.findById.mockReturnValue({ exec: execMock });

      await expect(service.publishRevision('abc')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  /* ================================================================ */
  /*  rollback                                                         */
  /* ================================================================ */

  describe('rollback', () => {
    it('creates a new draft from a specific target revision', async () => {
      const target = {
        title: 'T',
        content: 'C',
        preview: 'P',
      };
      const targetExec = jest.fn().mockResolvedValue(target);
      model.findById.mockReturnValue({ exec: targetExec });

      const latestExec = jest.fn().mockResolvedValue(null);
      model.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({ exec: latestExec }),
        }),
      });

      const result = await service.rollback(
        { targetRevisionId: 'target-id' },
        'user-2',
      );
      expect(result.title).toBe('T');
      expect(result.status).toBe(RevisionStatus.DRAFT);
      expect(result.author).toBe('user-2');
    });

    it('rolls back to the most recent published when no target specified', async () => {
      const published = { title: 'Pub', content: 'Body', preview: 'Prev' };
      const publishedExec = jest.fn().mockResolvedValue(published);
      const latestExec = jest.fn().mockResolvedValue(null);

      // First findOne: find published revision
      model.findOne
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            exec: publishedExec,
          }),
        })
        // Second findOne: find latest version
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({ exec: latestExec }),
          }),
        });

      const result = await service.rollback({}, 'user-3');
      expect(result.title).toBe('Pub');
      expect(result.status).toBe(RevisionStatus.DRAFT);
    });

    it('throws NotFoundException when target does not exist', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      model.findById.mockReturnValue({ exec: execMock });

      await expect(
        service.rollback({ targetRevisionId: 'ghost' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when no published revision exists', async () => {
      const findExec = jest.fn().mockResolvedValue(null);
      model.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({ exec: findExec }),
      });

      await expect(service.rollback({}, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ================================================================ */
  /*  findPublished                                                    */
  /* ================================================================ */

  describe('findPublished', () => {
    it('returns the most recently published revision', async () => {
      const doc = { status: RevisionStatus.PUBLISHED };
      const execMock = jest.fn().mockResolvedValue(doc);
      model.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({ exec: execMock }),
      });

      const result = await service.findPublished();
      expect(result).toBe(doc);
    });

    it('throws NotFoundException when none published', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      model.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({ exec: execMock }),
      });

      await expect(service.findPublished()).rejects.toThrow(NotFoundException);
    });
  });

  /* ================================================================ */
  /*  archiveRevision                                                  */
  /* ================================================================ */

  describe('archiveRevision', () => {
    it('archives a draft revision', async () => {
      const doc = {
        status: RevisionStatus.DRAFT,
        save: jest.fn().mockImplementation(function (this: any) {
          return this;
        }),
      };
      const execMock = jest.fn().mockResolvedValue(doc);
      model.findById.mockReturnValue({ exec: execMock });

      const result = await service.archiveRevision('abc');
      expect(result.status).toBe(RevisionStatus.ARCHIVED);
    });

    it('throws ConflictException when already archived', async () => {
      const doc = { status: RevisionStatus.ARCHIVED };
      const execMock = jest.fn().mockResolvedValue(doc);
      model.findById.mockReturnValue({ exec: execMock });

      await expect(service.archiveRevision('abc')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when revision does not exist', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      model.findById.mockReturnValue({ exec: execMock });

      await expect(service.archiveRevision('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ================================================================ */
  /*  findAllRevisions                                                 */
  /* ================================================================ */

  describe('findAllRevisions', () => {
    it('returns revisions sorted by version descending', async () => {
      const docs = [{ version: 2 }, { version: 1 }];
      const execMock = jest.fn().mockResolvedValue(docs);
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({ exec: execMock }),
      });

      const result = await service.findAllRevisions();
      expect(result).toEqual(docs);
      expect(model.find).toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  findRevisionById                                                 */
  /* ================================================================ */

  describe('findRevisionById', () => {
    it('returns the revision when found', async () => {
      const doc = { _id: 'abc' };
      const execMock = jest.fn().mockResolvedValue(doc);
      model.findById.mockReturnValue({ exec: execMock });

      const result = await service.findRevisionById('abc');
      expect(result).toBe(doc);
    });

    it('throws NotFoundException when not found', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      model.findById.mockReturnValue({ exec: execMock });

      await expect(service.findRevisionById('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
