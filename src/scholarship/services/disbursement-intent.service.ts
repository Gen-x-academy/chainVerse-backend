import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import * as crypto from 'crypto';
import { AuditService } from '../../common/audit/audit.service';
import { AuditAction } from '../../common/audit/audit-action.enum';
import { AuditContext } from '../../common/audit/audit-context';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { DomainEvents } from '../../events/event-names';
import { ScholarshipDisbursementIntentCreatedPayload } from '../../events/payloads/scholarship-disbursement-intent-created.payload';
import {
  ListDisbursementIntentsDto,
  RecordIntentTransitionDto,
} from '../dto/disbursement-intent.dto';
import {
  DisbursementIntent,
  DisbursementIntentDocument,
} from '../schemas/disbursement-intent.schema';
import {
  PaymentEligibility,
  PaymentEligibilityDocument,
} from '../schemas/payment-eligibility.schema';
import {
  DisbursementIntentStatus,
  INTENT_TRANSITIONS,
  ScholarshipAwardStatus,
} from '../scholarship.constants';
import { isDuplicateKeyError } from '../scholarship-actor';
import { ScholarshipAccessService } from './scholarship-access.service';

const TARGET_TYPE = 'scholarship_disbursement_intent';

/** Financial fields an intent must agree with its eligibility on. */
const PINNED_FIELDS = [
  'organizationId',
  'awardId',
  'milestoneKey',
  'amountMinor',
  'currency',
  'recipientId',
  'recipientWallet',
] as const;

export interface CreateIntentResult {
  intent: DisbursementIntentDocument;
  /** False when an existing intent was reconciled and returned. */
  created: boolean;
}

/**
 * Deterministic idempotency key for an installment. The same award milestone
 * always maps to the same key, independent of which caller or retry creates
 * the intent — that is what makes double payment structurally impossible.
 */
export function disbursementIntentKey(
  organizationId: string,
  awardId: string,
  milestoneKey: string,
): string {
  return crypto
    .createHash('sha256')
    .update(
      `scholarship-disbursement:v1:${organizationId}:${awardId}:${milestoneKey}`,
    )
    .digest('hex');
}

@Injectable()
export class DisbursementIntentService {
  private readonly logger = new Logger(DisbursementIntentService.name);

  constructor(
    @InjectModel(DisbursementIntent.name)
    private readonly intentModel: Model<DisbursementIntentDocument>,
    @InjectModel(PaymentEligibility.name)
    private readonly eligibilityModel: Model<PaymentEligibilityDocument>,
    private readonly access: ScholarshipAccessService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Returns the single intent for an eligibility, creating it on first call.
   *
   * Retries (HTTP, event redelivery, reconciliation job) converge on the same
   * record. An existing intent is checked field-by-field against the
   * eligibility; any disagreement is an integrity fault and is refused rather
   * than "fixed", because the intent may already be in flight.
   */
  async createForEligibility(
    organizationId: string,
    eligibilityId: string,
    actorId: string,
    audit: AuditContext,
  ): Promise<CreateIntentResult> {
    const eligibility = await this.eligibilityModel
      .findOne({ _id: eligibilityId, organizationId })
      .exec();
    if (!eligibility) {
      throw new ResourceNotFoundException('Payment eligibility not found');
    }

    const intentKey = disbursementIntentKey(
      eligibility.organizationId,
      eligibility.awardId,
      eligibility.milestoneKey,
    );

    const existing = await this.intentModel.findOne({ intentKey }).exec();
    if (existing) {
      return {
        intent: await this.reconcile(existing, eligibility),
        created: false,
      };
    }

    const award = await this.access.requireAward(
      eligibility.organizationId,
      eligibility.awardId,
    );
    if (award.status !== ScholarshipAwardStatus.ACTIVE) {
      throw new BusinessRuleException(
        'Award is not active; no new disbursement may be created',
        ErrorCode.BIZ_SCHOLARSHIP_INTENT_TRANSITION,
      );
    }

    let intent: DisbursementIntentDocument;
    try {
      intent = await new this.intentModel({
        intentKey,
        organizationId: eligibility.organizationId,
        awardId: eligibility.awardId,
        milestoneKey: eligibility.milestoneKey,
        eligibilityId: eligibility.id,
        amountMinor: eligibility.amountMinor,
        currency: eligibility.currency,
        recipientId: eligibility.recipientId,
        recipientWallet: eligibility.recipientWallet,
        status: DisbursementIntentStatus.CREATED,
        createdBy: actorId,
      }).save();
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const winner = await this.intentModel
        .findOne({ $or: [{ intentKey }, { eligibilityId: eligibility.id }] })
        .exec();
      if (!winner) throw err;
      return {
        intent: await this.reconcile(winner, eligibility),
        created: false,
      };
    }

    await this.linkEligibility(eligibility, intent);

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_DISBURSEMENT_INTENT_CREATED,
      context: audit,
      target: { type: TARGET_TYPE, id: intent.id },
      after: {
        intentKey,
        awardId: intent.awardId,
        milestoneKey: intent.milestoneKey,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        recipientId: intent.recipientId,
      },
    });

    const payload = Object.assign(
      new ScholarshipDisbursementIntentCreatedPayload(),
      {
        intentId: intent.id,
        intentKey,
        organizationId: intent.organizationId,
        awardId: intent.awardId,
        milestoneKey: intent.milestoneKey,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
      },
    );
    this.eventEmitter.emit(
      DomainEvents.SCHOLARSHIP_DISBURSEMENT_INTENT_CREATED,
      payload,
    );

    return { intent, created: true };
  }

  async findOne(
    organizationId: string,
    intentId: string,
  ): Promise<DisbursementIntentDocument> {
    const intent = await this.intentModel
      .findOne({ _id: intentId, organizationId })
      .exec();
    if (!intent) {
      throw new ResourceNotFoundException('Disbursement intent not found');
    }
    return intent;
  }

  list(
    organizationId: string,
    query: ListDisbursementIntentsDto,
  ): Promise<DisbursementIntent[]> {
    const filter: Record<string, unknown> = { organizationId };
    if (query.status) filter.status = query.status;
    if (query.awardId) filter.awardId = query.awardId;
    return this.intentModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
  }

  /**
   * Records the outcome of external execution. Transitions are compare-and-set
   * on the current status, and exact repeats are no-ops so executors can retry
   * their callbacks safely. Amount and recipient are never touched here.
   */
  async transition(
    organizationId: string,
    intentId: string,
    dto: RecordIntentTransitionDto,
    actorId: string,
    audit: AuditContext,
  ): Promise<DisbursementIntentDocument> {
    const intent = await this.findOne(organizationId, intentId);

    if (this.isRepeat(intent, dto)) return intent;

    if (!INTENT_TRANSITIONS[intent.status].includes(dto.status)) {
      throw new ResourceConflictException(
        `Cannot move intent from ${intent.status} to ${dto.status}`,
        ErrorCode.BIZ_SCHOLARSHIP_INTENT_TRANSITION,
      );
    }
    if (
      dto.status === DisbursementIntentStatus.CONFIRMED &&
      dto.externalReference &&
      dto.externalReference !== intent.externalReference
    ) {
      throw new ResourceConflictException(
        'Confirmation references a different execution than the one submitted',
        ErrorCode.BIZ_SCHOLARSHIP_INTENT_INTEGRITY,
      );
    }

    const set: Record<string, unknown> = { status: dto.status };
    const update: UpdateQuery<DisbursementIntentDocument> = {
      $set: set,
      $push: {
        transitions: {
          from: intent.status,
          to: dto.status,
          actorId,
          externalReference: dto.externalReference ?? null,
          reason: dto.reason ?? null,
          at: new Date(),
        },
      },
    };
    if (dto.status === DisbursementIntentStatus.SUBMITTED) {
      set.externalReference = dto.externalReference;
      set.lastFailureReason = null;
      update.$inc = { attempts: 1 };
    }
    if (dto.status === DisbursementIntentStatus.FAILED) {
      set.lastFailureReason = dto.reason;
    }

    const updated = await this.intentModel
      .findOneAndUpdate(
        { _id: intent.id, organizationId, status: intent.status },
        update,
        { new: true },
      )
      .exec();
    if (!updated) {
      // Lost a race; accept only if the winner recorded the same outcome.
      const current = await this.findOne(organizationId, intentId);
      if (this.isRepeat(current, dto)) return current;
      throw new ResourceConflictException(
        `Intent moved to ${current.status} concurrently`,
        ErrorCode.BIZ_SCHOLARSHIP_INTENT_TRANSITION,
      );
    }

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_DISBURSEMENT_INTENT_TRANSITIONED,
      context: audit,
      target: { type: TARGET_TYPE, id: updated.id },
      before: {
        status: intent.status,
        externalReference: intent.externalReference,
      },
      after: {
        status: updated.status,
        externalReference: updated.externalReference,
      },
      reason: dto.reason ?? null,
    });
    return updated;
  }

  /** Eligibilities that still have no intent, oldest first. */
  findEligibilitiesWithoutIntent(
    olderThan: Date,
    limit: number,
  ): Promise<PaymentEligibilityDocument[]> {
    return this.eligibilityModel
      .find({ disbursementIntentId: null, createdAt: { $lt: olderThan } })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private isRepeat(
    intent: DisbursementIntent,
    dto: RecordIntentTransitionDto,
  ): boolean {
    if (intent.status !== dto.status) return false;
    if (dto.status === DisbursementIntentStatus.SUBMITTED) {
      if (dto.externalReference !== intent.externalReference) {
        // A second, different submission while one is outstanding is exactly
        // the double-payment case; never treat it as a harmless repeat.
        throw new ResourceConflictException(
          'Intent is already submitted under a different external reference',
          ErrorCode.BIZ_SCHOLARSHIP_INTENT_INTEGRITY,
        );
      }
    }
    return true;
  }

  private async reconcile(
    intent: DisbursementIntentDocument,
    eligibility: PaymentEligibilityDocument,
  ): Promise<DisbursementIntentDocument> {
    const mismatched: string[] = PINNED_FIELDS.filter(
      (field) => intent[field] !== eligibility[field],
    );
    if (intent.eligibilityId !== eligibility.id)
      mismatched.push('eligibilityId');

    if (mismatched.length > 0) {
      this.logger.error(
        `Disbursement intent ${intent.id} disagrees with eligibility ${eligibility.id} on: ${mismatched.join(', ')}`,
      );
      throw new ResourceConflictException(
        'Existing disbursement intent does not match this eligibility',
        ErrorCode.BIZ_SCHOLARSHIP_INTENT_INTEGRITY,
      );
    }

    await this.linkEligibility(eligibility, intent);
    return intent;
  }

  private async linkEligibility(
    eligibility: PaymentEligibilityDocument,
    intent: DisbursementIntentDocument,
  ): Promise<void> {
    if (eligibility.disbursementIntentId === intent.id) return;
    await this.eligibilityModel
      .updateOne(
        { _id: eligibility.id, disbursementIntentId: null },
        { $set: { disbursementIntentId: intent.id } },
      )
      .exec();
  }
}
