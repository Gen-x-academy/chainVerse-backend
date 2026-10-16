import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MentorshipLifecycle,
  MentorshipLifecycleDocument,
  MentorshipLifecycleEvent,
  MentorshipLifecycleEventDocument,
} from './schemas/mentorship-lifecycle.schema';
import {
  evaluateTransition,
  MentorshipActor,
  MentorshipState,
} from './mentorship-lifecycle.machine';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

export interface LifecycleView {
  mentorshipId: string;
  state: MentorshipState;
  version: number;
}

export interface TransitionResult extends LifecycleView {
  /** False when the mentorship was already in the requested state. */
  changed: boolean;
}

export interface LifecycleHistoryEntry {
  sequence: number;
  from: MentorshipState;
  to: MentorshipState;
  actor: MentorshipActor;
  reason: string | null;
  at: string;
}

const DUPLICATE_KEY = 11000;
const isDuplicateKey = (error: unknown) =>
  (error as { code?: number } | null)?.code === DUPLICATE_KEY;

/**
 * Persists mentorship lifecycles. The rules live in `evaluateTransition`; this class
 * loads the current state, applies the decision under optimistic concurrency, and
 * appends the audit row.
 *
 * Callers are responsible for deciding *who the actor is* from the authenticated
 * principal and the mentorship's participants; this service trusts the actor it is given.
 */
@Injectable()
export class MentorshipLifecycleService {
  constructor(
    @InjectModel(MentorshipLifecycle.name)
    private readonly lifecycles: Model<MentorshipLifecycleDocument>,
    @InjectModel(MentorshipLifecycleEvent.name)
    private readonly events: Model<MentorshipLifecycleEventDocument>,
  ) {}

  /** Creates the lifecycle in `draft`. Calling it again for the same mentorship changes nothing. */
  async start(mentorshipId: string): Promise<LifecycleView> {
    const existing = await this.lifecycles.findOne({ mentorshipId }).exec();
    if (existing) return this.view(existing);

    try {
      const created = await this.lifecycles.create({
        mentorshipId,
        state: MentorshipState.DRAFT,
        version: 0,
      });
      return this.view(created);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return this.view(await this.require(mentorshipId));
    }
  }

  async get(mentorshipId: string): Promise<LifecycleView> {
    return this.view(await this.require(mentorshipId));
  }

  /**
   * Moves a mentorship to `to`. Succeeds without effect if it is already there, so a
   * client may retry after a timeout. Forbidden moves and unauthorised actors fail with
   * stable error codes before anything is written.
   */
  async transition(
    mentorshipId: string,
    to: MentorshipState,
    actor: MentorshipActor,
    reason?: string,
  ): Promise<TransitionResult> {
    const current = await this.require(mentorshipId);
    const outcome = evaluateTransition(current.state, to, actor, reason);

    if (!outcome.changed) {
      return { ...this.view(current), changed: false };
    }

    const nextVersion = current.version + 1;
    const result = await this.lifecycles.updateOne(
      { mentorshipId, version: current.version, state: current.state },
      { $set: { state: to }, $inc: { version: 1 } },
    );
    if (result.modifiedCount !== 1) {
      // Someone else moved it first. Nothing was written; the caller reloads and decides again.
      throw new ResourceConflictException(
        'The mentorship changed while this request was being processed. Reload it and try again.',
        ErrorCode.BIZ_MENTORSHIP_LIFECYCLE_CONFLICT,
      );
    }

    try {
      await this.events.create({
        mentorshipId,
        sequence: nextVersion,
        from: outcome.record.from,
        to: outcome.record.to,
        actor: outcome.record.actor,
        reason: outcome.record.reason,
        at: outcome.record.at,
      });
    } catch (error) {
      // (mentorshipId, sequence) is unique: a replay already has its row.
      if (!isDuplicateKey(error)) throw error;
    }

    return { mentorshipId, state: to, version: nextVersion, changed: true };
  }

  /** Every recorded change, oldest first. */
  async history(mentorshipId: string): Promise<LifecycleHistoryEntry[]> {
    await this.require(mentorshipId);
    const rows = await this.events.find({ mentorshipId }).sort({ sequence: 1 }).exec();
    return rows.map((row) => ({
      sequence: row.sequence,
      from: row.from,
      to: row.to,
      actor: { id: row.actor.id, kind: row.actor.kind },
      reason: row.reason,
      at: row.at.toISOString(),
    }));
  }

  private async require(mentorshipId: string): Promise<MentorshipLifecycleDocument> {
    const found = await this.lifecycles.findOne({ mentorshipId }).exec();
    if (!found) {
      throw new ResourceNotFoundException(
        'Mentorship lifecycle not found.',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return found;
  }

  private view(doc: MentorshipLifecycleDocument): LifecycleView {
    return { mentorshipId: doc.mentorshipId, state: doc.state, version: doc.version };
  }
}
