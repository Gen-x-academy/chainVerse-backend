import { ForbiddenException } from '@nestjs/common';
import { ErrorCode, ValidationDomainException } from '../../common/errors';
import { BlockingPolicy } from './blocking.policy';
import { MentorshipBlockingService } from './blocking.service';

const A = '507f1f77bcf86cd799439011';
const B = '507f1f77bcf86cd799439012';
const C = '507f1f77bcf86cd799439013';

const lean = (value: unknown) => ({ lean: jest.fn().mockResolvedValue(value) });

describe('MentorshipBlockingService', () => {
  const model = {
    exists: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    find: jest.fn(),
  };
  const telemetry = { count: jest.fn(), event: jest.fn() };
  const service = new MentorshipBlockingService(model as never, telemetry as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isBlocked', () => {
    it('checks the pair in both directions', async () => {
      model.exists.mockResolvedValue({ _id: 'block-id' });
      await expect(service.isBlocked(A, B)).resolves.toBe(true);
      expect(model.exists).toHaveBeenCalledWith({
        $or: [
          { blockerId: A, blockedId: B },
          { blockerId: B, blockedId: A },
        ],
      });
    });

    it('returns false for unrelated users, a self pair or a missing id', async () => {
      model.exists.mockResolvedValue(null);
      await expect(service.isBlocked(A, C)).resolves.toBe(false);
      await expect(service.isBlocked(A, A)).resolves.toBe(false);
      await expect(service.isBlocked('', B)).resolves.toBe(false);
      expect(model.exists).toHaveBeenCalledTimes(1);
    });
  });

  describe('assertNotBlocked', () => {
    it('throws the generic, non-leaking blocked error', async () => {
      model.exists.mockResolvedValue({ _id: 'block-id' });
      const error = await service
        .assertNotBlocked(A, B, 'proposals')
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(Error);
      expect((error as { errorCode: string }).errorCode).toBe(
        ErrorCode.BIZ_MENTORSHIP_BLOCKED,
      );
      const body = (error as { getResponse: () => Record<string, unknown> })
        .getResponse();
      // No direction, author, reason or block existence detail is returned.
      expect(body).toEqual({
        message: 'This match is not available',
        errorCode: ErrorCode.BIZ_MENTORSHIP_BLOCKED,
      });
      expect(telemetry.count).toHaveBeenCalledWith(
        'mentorship_block_enforcement_total',
        { entry_point: 'proposals' },
      );
    });

    it('passes for allowed pairs and self matches', async () => {
      model.exists.mockResolvedValue(null);
      await expect(service.assertNotBlocked(A, B)).resolves.toBeUndefined();
      await expect(service.assertNotBlocked(A, A)).resolves.toBeUndefined();
    });
  });

  describe('filterBlockedIds', () => {
    it('silently removes blocked candidates in either direction and self', async () => {
      model.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { blockerId: A, blockedId: B },
          { blockerId: C, blockedId: A },
        ]),
      });
      await expect(
        service.filterBlockedIds(A, [A, B, C, '507f1f77bcf86cd799439014']),
      ).resolves.toEqual(['507f1f77bcf86cd799439014']);
      expect(telemetry.count).toHaveBeenCalledWith(
        'mentorship_block_filter_total',
        { outcome: 'filtered' },
      );
    });

    it('does not query when there are no candidates', async () => {
      await expect(service.filterBlockedIds(A, [A])).resolves.toEqual([]);
      expect(model.find).not.toHaveBeenCalled();
    });
  });

  describe('block', () => {
    it('uses an idempotent conditional upsert and never overwrites a reason', async () => {
      model.findOneAndUpdate.mockReturnValue(
        lean({ blockerId: A, blockedId: B, reason: 'Safety', createdAt: new Date('2026-01-01') }),
      );
      const first = await service.block(A, { blockedUserId: B, reason: 'Safety' });
      const second = await service.block(A, { blockedUserId: B, reason: 'Different' });
      expect(first).toEqual(second);
      expect(model.findOneAndUpdate).toHaveBeenCalledTimes(2);
      const [filter, update, options] = model.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ blockerId: A, blockedId: B });
      expect(update).toEqual({ $setOnInsert: { reason: 'Safety' } });
      expect(options).toMatchObject({ upsert: true, new: true });
    });

    it('rejects self-blocking before touching the database', async () => {
      await expect(
        service.block(A, { blockedUserId: A }),
      ).rejects.toBeInstanceOf(ValidationDomainException);
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('returns the canonical row when a concurrent retry loses the unique-index race', async () => {
      model.findOneAndUpdate.mockRejectedValueOnce({ code: 11000 });
      model.findOne.mockReturnValue(
        lean({ blockerId: A, blockedId: B, reason: 'Safety', createdAt: new Date('2026-01-01') }),
      );
      const result = await service.block(A, { blockedUserId: B, reason: 'Safety' });
      expect(result).toMatchObject({ blockedUserId: B, reason: 'Safety' });
      expect(telemetry.count).toHaveBeenCalledWith(
        'mentorship_block_create_total',
        { outcome: 'idempotent' },
      );
    });

    it('never exposes the blocker id in the response', async () => {
      model.findOneAndUpdate.mockReturnValue(
        lean({ blockerId: A, blockedId: B, reason: 'Safety', createdAt: new Date('2026-01-01') }),
      );
      const result = await service.block(A, { blockedUserId: B });
      expect(result).not.toHaveProperty('blockerId');
    });

    it('does not break the business path when telemetry fails', async () => {
      telemetry.count.mockImplementation(() => {
        throw new Error('metrics unavailable');
      });
      telemetry.event.mockImplementation(() => {
        throw new Error('logger unavailable');
      });
      model.findOneAndUpdate.mockReturnValue(
        lean({ blockerId: A, blockedId: B, createdAt: new Date('2026-01-01') }),
      );
      await expect(service.block(A, { blockedUserId: B })).resolves.toMatchObject({
        blockedUserId: B,
      });
    });
  });

  describe('unblock and listOwnBlocks', () => {
    it('removes only the caller\'s own block and is idempotent', async () => {
      model.deleteOne
        .mockResolvedValueOnce({ deletedCount: 1 })
        .mockResolvedValueOnce({ deletedCount: 0 });
      await expect(service.unblock(A, B)).resolves.toEqual({ removed: true });
      await expect(service.unblock(A, B)).resolves.toEqual({ removed: false });
      expect(model.deleteOne).toHaveBeenCalledWith({ blockerId: A, blockedId: B });
      expect(telemetry.count).toHaveBeenCalledWith(
        'mentorship_block_remove_total',
        { outcome: 'noop' },
      );
    });

    it('lists only the caller\'s blocks with no blocker identity', async () => {
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnValue(
          lean([
            { blockerId: A, blockedId: B, reason: 'private', createdAt: new Date('2026-01-01') },
          ]),
        ),
      });
      const rows = await service.listOwnBlocks(A);
      expect(model.find).toHaveBeenCalledWith({ blockerId: A });
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty('blockerId');
      expect(rows[0].reason).toBe('private');
    });
  });

  describe('BlockingPolicy', () => {
    const policy = new BlockingPolicy(telemetry as never);

    it('denies by default when the actor does not own the block', () => {
      expect(() => policy.assertOwnBlock(A, B)).toThrow(ForbiddenException);
      const error = (() => {
        try {
          policy.assertOwnBlock('', B);
        } catch (err) {
          return err;
        }
      })();
      expect((error as { errorCode: string }).errorCode).toBe(
        ErrorCode.MENTOR_ACCESS_DENIED,
      );
      expect(() => policy.assertOwnBlock(A, A)).not.toThrow();
    });
  });
});
