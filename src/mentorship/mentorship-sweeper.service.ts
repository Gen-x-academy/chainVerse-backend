import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Model } from 'mongoose';
import { AuditAction } from '../common/audit/audit-action.enum';
import { systemAuditContext } from '../common/audit/audit-context';
import type { AppConfig } from '../config/app.config';
import { MentorshipCapacityService } from './mentorship-capacity.service';
import { MentorshipTelemetry } from './mentorship-telemetry.service';
import {
  ActionContext,
  MatchProposalService,
} from './match-proposal.service';
import {
  ACTIVATION_STALE_AFTER_MS,
  ProposalStatus,
  SWEEP_BATCH_SIZE,
} from './mentorship.constants';
import type { ProposalRecord } from './mentorship.policy';
import {
  MatchProposal,
  MatchProposalDocument,
} from './schemas/match-proposal.schema';

const JOB_NAME = 'mentorship-sweeper';

/**
 * Background maintenance for matching:
 *
 * 1. Expire pending proposals past `expiresAt` (releasing capacity holds).
 * 2. Finish or roll back activations interrupted mid-flight.
 * 3. Reconcile mentor `reservedSlots` against source data.
 *
 * Every step uses the same conditional transitions as the API, so running
 * on several instances at once is safe — a second instance simply finds
 * nothing left to do.
 */
@Injectable()
export class MentorshipSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MentorshipSweeper.name);
  private running = false;

  constructor(
    @InjectModel(MatchProposal.name)
    private readonly proposalModel: Model<MatchProposalDocument>,
    private readonly proposals: MatchProposalService,
    private readonly capacity: MentorshipCapacityService,
    private readonly telemetry: MentorshipTelemetry,
    private readonly scheduler: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('nodeEnv') === 'test') return;
    const cronTime =
      this.config.get<AppConfig['mentorship']>('mentorship')?.sweepCron ??
      '0 */5 * * * *';
    const job = CronJob.from({ cronTime, onTick: () => void this.run() });
    this.scheduler.addCronJob(JOB_NAME, job);
    job.start();
  }

  onModuleDestroy(): void {
    if (this.scheduler.doesExist('cron', JOB_NAME)) {
      this.scheduler.deleteCronJob(JOB_NAME);
    }
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      this.telemetry.sweep('expired', await this.expireDue());
      this.telemetry.sweep('activation_recovered', await this.recoverActivations());
      this.telemetry.sweep('capacity_reconciled', await this.capacity.reconcile());
    } catch (err) {
      this.logger.error(
        `Mentorship sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  async expireDue(now = new Date()): Promise<number> {
    const due = await this.proposalModel
      .find(
        { status: ProposalStatus.PENDING, expiresAt: { $lte: now } },
        { _id: 1 },
      )
      .limit(SWEEP_BATCH_SIZE)
      .lean();

    const ctx = this.systemContext('expire');
    let count = 0;
    for (const { _id } of due) {
      const closed = await this.proposals.close(
        _id.toString(),
        ProposalStatus.EXPIRED,
        ctx,
        'expired',
        [ProposalStatus.PENDING],
        { expiresAt: { $lte: now } },
      );
      if (closed) {
        count += 1;
        await this.proposals.recordClosed(
          closed,
          AuditAction.MENTORSHIP_PROPOSAL_EXPIRED,
          ctx,
        );
      }
    }
    return count;
  }

  async recoverActivations(now = new Date()): Promise<number> {
    const stuck = await this.proposalModel
      .find({
        status: ProposalStatus.ACTIVATING,
        activationStartedAt: {
          $lte: new Date(now.getTime() - ACTIVATION_STALE_AFTER_MS),
        },
      })
      .limit(SWEEP_BATCH_SIZE)
      .lean<ProposalRecord[]>();

    const ctx = this.systemContext('recover');
    let count = 0;
    for (const proposal of stuck) {
      try {
        await this.proposals.completeActivation(proposal, ctx);
        count += 1;
      } catch (err) {
        this.logger.warn(
          `Activation recovery for proposal ${proposal._id.toString()} ended: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return count;
  }

  private systemContext(phase: string): ActionContext {
    return {
      actorId: 'system',
      actorRole: 'system',
      audit: systemAuditContext(`mentorship-sweeper:${phase}`),
    };
  }
}
