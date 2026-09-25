import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { systemAuditContext } from '../../common/audit/audit-context';
import { DomainEvents } from '../../events/event-names';
import { ScholarshipPaymentEligiblePayload } from '../../events/payloads/scholarship-payment-eligible.payload';
import { DisbursementIntentService } from '../services/disbursement-intent.service';
import { MilestoneVerificationService } from '../services/milestone-verification.service';

const SYSTEM_ACTOR = 'system:scholarship-disbursements';
const BATCH_SIZE = 100;
/** Grace period so the job does not race the event listener on fresh rows. */
const SETTLE_MS = 60_000;

/**
 * Turns payment eligibility into disbursement intents.
 *
 * The event listener is the fast path. The cron is the safety net for anything
 * the fast path missed (process crash, listener error, emitter not wired):
 * it repairs approvals without an eligibility, then creates intents for
 * eligibilities without one. Both paths are idempotent, so running the job on
 * every instance concurrently is safe.
 */
@Injectable()
export class DisbursementReconciliationJob {
  private readonly logger = new Logger(DisbursementReconciliationJob.name);
  private running = false;

  constructor(
    private readonly intents: DisbursementIntentService,
    private readonly verification: MilestoneVerificationService,
  ) {}

  @OnEvent(DomainEvents.SCHOLARSHIP_PAYMENT_ELIGIBLE, { async: true })
  async onPaymentEligible(
    payload: ScholarshipPaymentEligiblePayload,
  ): Promise<void> {
    try {
      await this.intents.createForEligibility(
        payload.organizationId,
        payload.eligibilityId,
        SYSTEM_ACTOR,
        systemAuditContext(
          `eligibility:${payload.eligibilityId}`,
          SYSTEM_ACTOR,
        ),
      );
    } catch (err) {
      // The cron will retry; never let a listener failure surface elsewhere.
      this.logger.error(
        `Intent creation failed for eligibility ${payload.eligibilityId}: ${(err as Error).message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES, {
    name: 'scholarship-disbursement-reconciliation',
  })
  async reconcile(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.repairEligibilities();
      await this.createMissingIntents();
    } finally {
      this.running = false;
    }
  }

  private async repairEligibilities(): Promise<void> {
    const orphans =
      await this.verification.findApprovedWithoutEligibility(BATCH_SIZE);
    for (const progress of orphans) {
      try {
        await this.verification.ensurePaymentEligibility(progress);
        this.logger.warn(
          `Repaired missing eligibility for award ${progress.awardId} milestone ${progress.milestoneKey}`,
        );
      } catch (err) {
        this.logger.error(
          `Eligibility repair failed for award ${progress.awardId} milestone ${progress.milestoneKey}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async createMissingIntents(): Promise<void> {
    const pending = await this.intents.findEligibilitiesWithoutIntent(
      new Date(Date.now() - SETTLE_MS),
      BATCH_SIZE,
    );
    for (const eligibility of pending) {
      try {
        await this.intents.createForEligibility(
          eligibility.organizationId,
          eligibility.id,
          SYSTEM_ACTOR,
          systemAuditContext('scholarship-reconciliation', SYSTEM_ACTOR),
        );
      } catch (err) {
        this.logger.error(
          `Reconciliation could not create intent for eligibility ${eligibility.id}: ${(err as Error).message}`,
        );
      }
    }
  }
}
