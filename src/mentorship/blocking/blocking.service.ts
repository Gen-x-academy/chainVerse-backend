import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ErrorCode, ValidationDomainException } from '../../common/errors';
import { isDuplicateKeyError, MentorshipErrors } from '../mentorship.errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import type {
  CreateMentorshipBlockDto,
  MentorshipBlockViewDto,
} from './dto/blocking.dto';
import {
  MentorshipBlock,
  MentorshipBlockDocument,
} from './schemas/blocking.schema';

interface BlockRecord {
  blockerId: string;
  blockedId: string;
  reason?: string | null;
  createdAt?: Date;
}

/**
 * The single authoritative API for mentorship block checks.
 *
 * A block is always bidirectional and never overridable. Reads never return
 * the blocker id, the existence of a block, or the private reason to anyone
 * other than the blocker themselves. All writes use conditional/upsert
 * operations so retries cannot create duplicate effects.
 */
@Injectable()
export class MentorshipBlockingService {
  constructor(
    @InjectModel(MentorshipBlock.name)
    private readonly blockModel: Model<MentorshipBlockDocument>,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  /** True when either user has blocked the other. Pure read; safe to retry. */
  async isBlocked(a: string, b: string): Promise<boolean> {
    if (!a || !b || a === b) return false;
    const found = await this.blockModel.exists({
      $or: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    });
    return Boolean(found);
  }

  /**
   * Reject a match involving a blocked pair. The error is deliberately the
   * generic, pre-existing "match not available" response: it carries no
   * direction, author or reason, so the blocked user cannot learn who blocked
   * them. Discovery/recommendation surfaces should prefer `filterBlockedIds`
   * (silent exclusion) so even existence stays unobservable.
   */
  async assertNotBlocked(a: string, b: string, entryPoint = 'unspecified'): Promise<void> {
    if (!a || !b || a === b) return;
    if (await this.isBlocked(a, b)) {
      this.safeCount('mentorship_block_enforcement_total', {
        entry_point: this.entryPointLabel(entryPoint),
      });
      throw MentorshipErrors.blocked();
    }
  }

  /**
   * Silently remove blocked (and self) candidates from a discovery or
   * recommendation result. No error, count or field reveals which candidates
   * were removed or why.
   */
  async filterBlockedIds(callerId: string, candidateIds: string[]): Promise<string[]> {
    const candidates = candidateIds.filter((id) => id !== callerId);
    if (!callerId || candidates.length === 0) return candidates;

    const rows = await this.blockModel.find(
      {
        $or: [
          { blockerId: callerId, blockedId: { $in: candidates } },
          { blockerId: { $in: candidates }, blockedId: callerId },
        ],
      },
      { blockerId: 1, blockedId: 1, _id: 0 },
    ).lean<Pick<BlockRecord, 'blockerId' | 'blockedId'>[]>();

    const hidden = new Set<string>();
    for (const row of rows) {
      hidden.add(row.blockerId === callerId ? row.blockedId : row.blockerId);
    }
    const visible = candidates.filter((id) => !hidden.has(id));
    if (visible.length !== candidates.length) {
      this.safeCount('mentorship_block_filter_total', { outcome: 'filtered' });
    }
    return visible;
  }

  /** Idempotently create the caller's block using the collection's unique index. */
  async block(actorId: string, dto: CreateMentorshipBlockDto): Promise<MentorshipBlockViewDto> {
    if (!actorId || !dto.blockedUserId || actorId === dto.blockedUserId) {
      throw new ValidationDomainException(
        'You cannot block yourself',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    try {
      const record = await this.blockModel
        .findOneAndUpdate(
          { blockerId: actorId, blockedId: dto.blockedUserId },
          { $setOnInsert: { reason: dto.reason ?? null } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .lean<BlockRecord>();
      this.safeCount('mentorship_block_create_total', { outcome: 'recorded' });
      this.safeEvent('mentorship_block_created', {
        actorId,
        blockedUserId: dto.blockedUserId,
      });
      return toBlockView(record!);
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      // A concurrent retry won the unique-index race; return the canonical row.
      const existing = await this.blockModel
        .findOne({ blockerId: actorId, blockedId: dto.blockedUserId })
        .lean<BlockRecord>();
      this.safeCount('mentorship_block_create_total', { outcome: 'idempotent' });
      return toBlockView(existing!);
    }
  }

  /** Remove only a block created by the caller. Repeated calls are harmless. */
  async unblock(actorId: string, blockedUserId: string): Promise<{ removed: boolean }> {
    const result = await this.blockModel.deleteOne({
      blockerId: actorId,
      blockedId: blockedUserId,
    });
    const removed = (result?.deletedCount ?? 0) > 0;
    this.safeCount('mentorship_block_remove_total', {
      outcome: removed ? 'removed' : 'noop',
    });
    this.safeEvent('mentorship_block_removed', { actorId, blockedUserId });
    return { removed };
  }

  /** List only blocks owned by the caller; the private reason stays theirs. */
  async listOwnBlocks(actorId: string): Promise<MentorshipBlockViewDto[]> {
    const rows = await this.blockModel
      .find({ blockerId: actorId })
      .sort({ createdAt: -1 })
      .lean<BlockRecord[]>();
    return rows.map(toBlockView);
  }

  private entryPointLabel(entryPoint: string): string {
    const normalised = entryPoint.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return normalised.slice(0, 40) || 'other';
  }

  private safeCount(name: string, labels: Record<string, string>): void {
    try {
      this.telemetry.count(name, labels);
    } catch {
      // Observability must never break a business path.
    }
  }

  private safeEvent(event: string, fields: Record<string, unknown>): void {
    try {
      this.telemetry.event(event, fields);
    } catch {
      // Observability must never break a business path.
    }
  }
}

function toBlockView(record: BlockRecord): MentorshipBlockViewDto {
  return {
    blockedUserId: record.blockedId,
    reason: record.reason ?? null,
    createdAt: (record.createdAt ?? new Date()).toISOString(),
  };
}
