import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isDuplicateKeyError } from '../mentorship.errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import type {
  ProposeCorrectionDto,
  SignOffCorrectionDto,
  StartReconciliationRunDto,
} from './dto/reconciliation.dto';
import { classify } from './reconciliation-classifier';
import {
  CorrectionStatus,
  ReconciliationMismatch,
  ReconciliationMismatchDocument,
  ReconciliationRun,
  ReconciliationRunDocument,
  ReconciliationRunStatus,
} from './schemas/reconciliation.schema';

export interface ReconActor {
  userId: string;
  roles?: string[];
}
const FINANCE_ROLES = ['admin', 'finance'];

/**
 * MENTOR-084 — ledger reconciliation. Deny-by-default (finance/admin only).
 * Runs are idempotent per key and resumable: mismatches are upserted on
 * (runId, key) and the run cursor advances per persisted item, so a crashed
 * run continues where it stopped and never double-counts.
 */
@Injectable()
export class MentorshipReconciliationService {
  constructor(
    @InjectModel(ReconciliationRun.name) private readonly runs: Model<ReconciliationRunDocument>,
    @InjectModel(ReconciliationMismatch.name)
    private readonly mismatches: Model<ReconciliationMismatchDocument>,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  private assertFinance(actor: ReconActor): void {
    if (!(actor.roles ?? []).some((r) => FINANCE_ROLES.includes(r))) {
      this.telemetry.count('mentorship_reconciliation_denied_total', { reason: 'not_finance' });
      throw new ForbiddenException('MENTOR_ACCESS_DENIED');
    }
  }

  /** Start, or resume/replay, a run. Safe to call again after any failure. */
  async run(dto: StartReconciliationRunDto, actor: ReconActor) {
    this.assertFinance(actor);
    let run = await this.runs.findOne({ idempotencyKey: dto.idempotencyKey }).exec();
    if (!run) {
      try {
        run = await this.runs.create({
          idempotencyKey: dto.idempotencyKey,
          periodLabel: dto.periodLabel,
          startedBy: actor.userId,
          status: ReconciliationRunStatus.RUNNING,
          cursor: null,
          processed: 0,
          mismatches: 0,
        });
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err;
        run = await this.runs.findOne({ idempotencyKey: dto.idempotencyKey }).exec();
        if (!run) throw err;
      }
    }
    if (run.status === ReconciliationRunStatus.COMPLETED) return this.summary(run);

    const results = classify(dto.internal, dto.external);
    for (const r of results) {
      if (run.cursor !== null && r.key <= run.cursor) continue; // already persisted
      const bad = r.type !== 'matched';
      if (bad) {
        await this.mismatches.updateOne(
          { runId: String(run._id), key: r.key },
          { $setOnInsert: { ...r, runId: String(run._id), correctionStatus: CorrectionStatus.NONE } },
          { upsert: true },
        );
      }
      run = (await this.runs
        .findByIdAndUpdate(
          run._id,
          { $set: { cursor: r.key }, $inc: { processed: 1, mismatches: bad ? 1 : 0 } },
          { new: true },
        )
        .exec())!;
    }
    run = (await this.runs
      .findByIdAndUpdate(run._id, { $set: { status: ReconciliationRunStatus.COMPLETED } }, { new: true })
      .exec())!;
    this.telemetry.count('mentorship_reconciliation_run_total', { outcome: 'completed' });
    this.telemetry.event('mentorship_reconciliation_completed', {
      runId: String(run._id),
      processed: run.processed,
      mismatches: run.mismatches,
    });
    return this.summary(run);
  }

  async getRun(id: string, actor: ReconActor) {
    this.assertFinance(actor);
    const run = await this.runs.findById(id).exec();
    if (!run) throw new NotFoundException('RECONCILIATION_RUN_NOT_FOUND');
    const items = await this.mismatches.find({ runId: id }).sort({ key: 1 }).exec();
    return { ...this.summary(run), mismatches: items };
  }

  async proposeCorrection(mismatchId: string, dto: ProposeCorrectionDto, actor: ReconActor) {
    this.assertFinance(actor);
    const m = await this.mismatches
      .findOneAndUpdate(
        { _id: mismatchId, correctionStatus: { $in: [CorrectionStatus.NONE, CorrectionStatus.REJECTED] } },
        { $set: { correctionStatus: CorrectionStatus.PROPOSED, correctionNote: dto.note, proposedBy: actor.userId } },
        { new: true },
      )
      .exec();
    if (!m) throw new ConflictException('CORRECTION_NOT_PROPOSABLE');
    this.telemetry.count('mentorship_reconciliation_correction_total', { outcome: 'proposed' });
    return m;
  }

  /** A correction needs a sign-off from someone other than its proposer. */
  async signOff(mismatchId: string, dto: SignOffCorrectionDto, actor: ReconActor, now = new Date()) {
    this.assertFinance(actor);
    const current = await this.mismatches.findById(mismatchId).exec();
    if (!current) throw new NotFoundException('MISMATCH_NOT_FOUND');
    if (current.correctionStatus !== CorrectionStatus.PROPOSED) {
      throw new ConflictException('NO_PROPOSED_CORRECTION');
    }
    if (current.proposedBy === actor.userId) {
      this.telemetry.count('mentorship_reconciliation_denied_total', { reason: 'self_signoff' });
      throw new ForbiddenException('CORRECTION_NEEDS_SECOND_SIGNER');
    }
    const m = await this.mismatches
      .findOneAndUpdate(
        { _id: mismatchId, correctionStatus: CorrectionStatus.PROPOSED },
        {
          $set: {
            correctionStatus: dto.approve ? CorrectionStatus.SIGNED_OFF : CorrectionStatus.REJECTED,
            signedOffBy: actor.userId,
            signedOffAt: now,
          },
        },
        { new: true },
      )
      .exec();
    if (!m) throw new ConflictException('NO_PROPOSED_CORRECTION');
    this.telemetry.count('mentorship_reconciliation_correction_total', {
      outcome: dto.approve ? 'signed_off' : 'rejected',
    });
    return m;
  }

  private summary(run: ReconciliationRunDocument) {
    return {
      id: String(run._id),
      periodLabel: run.periodLabel,
      status: run.status,
      processed: run.processed,
      mismatches: run.mismatches,
      cursor: run.cursor,
    };
  }
}
