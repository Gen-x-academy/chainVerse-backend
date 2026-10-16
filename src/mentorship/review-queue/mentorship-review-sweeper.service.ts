import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import { DomainEvents } from '../../events/event-names';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import {
  MentorshipApplication,
  MentorshipApplicationDocument,
  OPEN_STATUSES,
} from '../applications/schemas/mentorship-application.schema';
import {
  ProgramReviewer,
  ProgramReviewerDocument,
} from '../programs/schemas/program-reviewer.schema';

const BATCH = 200;
const RECONCILE_EVERY_N_TICKS = 10;

/**
 * Background workflow for review queues (MENTOR-034).
 *
 * - Overdue detection: marks open applications past `review.dueAt` once
 *   (atomic `overdueNotifiedAt: null → now`) and emits
 *   `mentorship.review.overdue`. Safe with multiple app instances: only the
 *   instance whose update matches emits.
 * - Workload reconciliation: every N ticks, recomputes each reviewer's
 *   `activeAssignments` from applications to heal drift after crashes
 *   between capacity reservation and release.
 *
 * Interval: MENTORSHIP_REVIEW_SWEEP_INTERVAL_MS (0 disables, e.g. in tests).
 */
@Injectable()
export class MentorshipReviewSweeper implements OnModuleInit, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private ticks = 0;

  constructor(
    @InjectModel(MentorshipApplication.name)
    private readonly applicationModel: Model<MentorshipApplicationDocument>,
    @InjectModel(ProgramReviewer.name)
    private readonly reviewerModel: Model<ProgramReviewerDocument>,
    private readonly telemetry: MentorshipTelemetry,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const interval = this.config.get<number>('mentorship.reviewSweepIntervalMs') ?? 60_000;
    if (!interval || interval <= 0 || this.config.get<boolean>('mentorship.enabled') === false) return;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One sweep. Public so it can be triggered manually / from tests. */
  async tick(): Promise<void> {
    if (this.running) return; // never overlap on slow databases
    this.running = true;
    const started = Date.now();
    try {
      const marked = await this.markOverdue(new Date());
      this.ticks += 1;
      const reconciled = this.ticks % RECONCILE_EVERY_N_TICKS === 0 ? await this.reconcileWorkload() : 0;
      this.telemetry.count('mentorship_review_sweeps_total', { result: 'ok' });
      if (marked || reconciled) {
        this.telemetry.event('mentorship.review.sweep', { marked, reconciled, durationMs: Date.now() - started });
      }
    } catch (err) {
      this.telemetry.count('mentorship_review_sweeps_total', { result: 'error' });
      this.telemetry.warn('mentorship.review.sweep_failed', { error: (err as Error).message });
    } finally {
      this.running = false;
    }
  }

  async markOverdue(now: Date): Promise<number> {
    const candidates = await this.applicationModel
      .find(
        { status: { $in: OPEN_STATUSES }, 'review.overdueNotifiedAt': null, 'review.dueAt': { $lt: now } },
        { _id: 1, programId: 1, 'review.assigneeId': 1, 'review.dueAt': 1 },
      )
      .limit(BATCH)
      .lean()
      .exec();

    let marked = 0;
    for (const c of candidates) {
      const res = await this.applicationModel
        .updateOne(
          { _id: c._id, 'review.overdueNotifiedAt': null, 'review.dueAt': c.review.dueAt },
          { $set: { 'review.overdueNotifiedAt': now } },
        )
        .exec();
      if (res.modifiedCount !== 1) continue; // another instance or a triage got there first
      marked += 1;
      this.events.emit(DomainEvents.MENTORSHIP_REVIEW_OVERDUE, {
        applicationId: String(c._id),
        programId: String(c.programId),
        assigneeId: c.review.assigneeId ?? null,
        dueAt: c.review.dueAt,
      });
    }
    if (marked) this.telemetry.count('mentorship_review_overdue_total', {}, marked);
    return marked;
  }

  async reconcileWorkload(): Promise<number> {
    const actual = await this.applicationModel
      .aggregate<{ _id: { programId: unknown; reviewerId: string }; n: number }>([
        { $match: { status: { $in: OPEN_STATUSES }, 'review.assigneeId': { $ne: null } } },
        { $group: { _id: { programId: '$programId', reviewerId: '$review.assigneeId' }, n: { $sum: 1 } } },
      ])
      .exec();
    const counts = new Map<string, number>(
      actual.map((a) => [`${String(a._id.programId)}:${a._id.reviewerId}`, a.n] as [string, number]),
    );

    let fixed = 0;
    const cursor = this.reviewerModel.find({}, { programId: 1, reviewerId: 1, activeAssignments: 1 }).lean().cursor();
    for await (const r of cursor) {
      const expected = counts.get(`${String(r.programId)}:${r.reviewerId}`) ?? 0;
      if (expected === r.activeAssignments) continue;
      // Conditional on the value we read so we never clobber a concurrent reservation.
      const res = await this.reviewerModel
        .updateOne({ _id: r._id, activeAssignments: r.activeAssignments }, { $set: { activeAssignments: expected } })
        .exec();
      if (res.modifiedCount === 1) fixed += 1;
    }
    if (fixed) this.telemetry.count('mentorship_workload_reconciled_total', {}, fixed);
    return fixed;
  }
}
