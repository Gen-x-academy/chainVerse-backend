import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { BusinessRuleException } from '../../common/errors/domain.exception';
import { DomainEventName } from '../../events/event-names';
import {
  OutboxAggregateType,
  OutboxEvent,
  OutboxEventDocument,
  OutboxEventStatus,
} from '../schemas/outbox-event.schema';

/** Default delivery cut-off before a row is dead-lettered. */
export const OUTBOX_MAX_ATTEMPTS = 8;

/** Rows are reaped this long after being staged. */
export const OUTBOX_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Minimum time a claimed row is hidden from other relays while its handler runs.
 *
 * A floor under the backoff, so a handler that takes longer than the backoff
 * period cannot be re-entered by a second relay instance.
 */
export const OUTBOX_LEASE_MS = 30_000;

/**
 * Per-event payload allowlist.
 *
 * The outbox collection is not tenant-partitioned and is read by the relay, so
 * it has a tighter privacy bar than the collections it mirrors: identifiers,
 * minor-unit amounts and currency codes only. This map is that bar, stated in
 * one place so adding a field is a deliberate act rather than an accident.
 */
const ALLOWED_PAYLOAD_KEYS: Readonly<Record<string, readonly string[]>> = {
  'scholarship.payment-eligible': [
    'eligibilityId',
    'organizationId',
    'awardId',
    'milestoneKey',
    'amountMinor',
    'currency',
  ],
  'scholarship.disbursement-intent-created': [
    'intentId',
    'intentKey',
    'organizationId',
    'awardId',
    'milestoneKey',
    'amountMinor',
    'currency',
  ],
  'scholarship.budget-reservation-changed': [
    'reservationId',
    'organizationId',
    'programId',
    'applicationId',
    'amount',
    'currency',
    'status',
  ],
  'scholarship.award-status-changed': [
    'awardId',
    'organizationId',
    'programId',
    'applicationId',
    'status',
    'amount',
    'currency',
  ],
  'scholarship-finance.ledger.drift-detected': [
    'organizationId',
    'programId',
    'ledgerId',
    'reservedAmount',
    'disbursedAmount',
    'expectedReservedAmount',
    'expectedDisbursedAmount',
  ],
};

export interface StageOutboxInput {
  organizationId: string;
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  eventName: DomainEventName;
  payload: Record<string, unknown>;
  /** Ties one flow's events together. Defaults to a fresh id. */
  correlationId?: string | null;
  /** Reused on retry so a re-run of the same transition keeps the same id. */
  eventId?: string;
}

/**
 * Transactional outbox: stages a domain event in the same transaction as the
 * authoritative write, and relays it to the in-process bus afterwards.
 *
 * The write path guarantees *durability* of the intent to publish. It cannot
 * guarantee exactly-once delivery, because the bus is in-process and
 * synchronous: a crash between `emit()` returning and `publishedAt` being
 * written replays the event. That is why every envelope carries `eventId` and
 * why the existing consumers key idempotency on `(eligibilityId)` and
 * `(intentKey)` — a duplicate delivery is a no-op for them by construction, not
 * by luck.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel: Model<OutboxEventDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Writes one outbox row. Pass the *same* `session` the domain write used so
   * the two commit or abort together; pass `null` only when the caller is
   * deliberately working outside a transaction, in which case the row is the
   * only evidence the transition was attempted.
   *
   * @throws BusinessRuleException when the payload carries a key outside the
   *   event's allowlist. This is a programming error, not a runtime condition,
   *   so it fails the request rather than silently dropping the field.
   */
  async stage(
    input: StageOutboxInput,
    session: ClientSession | null = null,
  ): Promise<OutboxEventDocument> {
    this.assertPayloadIsAllowlisted(input.eventName, input.payload);

    const now = new Date();
    const [doc] = await this.outboxModel.create(
      [
        {
          eventId: input.eventId ?? new Types.ObjectId().toHexString(),
          organizationId: input.organizationId,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          eventName: input.eventName,
          schemaVersion: 1,
          correlationId:
            input.correlationId ?? new Types.ObjectId().toHexString(),
          occurredAt: now,
          status: OutboxEventStatus.PENDING,
          attempts: 0,
          nextAttemptAt: now,
          publishedAt: null,
          deadLetteredAt: null,
          lastError: null,
          payload: input.payload,
          expiresAt: new Date(now.getTime() + OUTBOX_RETENTION_MS),
        },
      ],
      session ? { session } : {},
    );
    return doc;
  }

  /**
   * Publishes up to `limit` due rows and returns how many were published.
   *
   * Each row is claimed with a conditional update on `status = PENDING`, so two
   * relay instances (or two overlapping cron ticks) cannot both take the same
   * row — the loser matches zero documents and moves on.
   */
  async publishDue(limit: number): Promise<number> {
    const now = new Date();
    const due = await this.outboxModel
      .find({
        status: OutboxEventStatus.PENDING,
        nextAttemptAt: { $lte: now },
      })
      .sort({ occurredAt: 1 })
      .limit(limit)
      .exec();

    let published = 0;
    for (const candidate of due) {
      if (await this.publishOne(candidate)) published++;
    }
    return published;
  }

  /** Rows the operator must look at: retried past the cut-off. */
  countDeadLetters(organizationId?: string): Promise<number> {
    return this.outboxModel.countDocuments({
      status: OutboxEventStatus.DEAD,
      ...(organizationId ? { organizationId } : {}),
    });
  }

  /** Oldest unpublished row's age in ms, or null when the outbox is drained. */
  async oldestPendingAgeMs(): Promise<number | null> {
    const oldest = await this.outboxModel
      .findOne({ status: OutboxEventStatus.PENDING })
      .sort({ occurredAt: 1 })
      .select('occurredAt')
      .lean()
      .exec();
    return oldest ? Date.now() - oldest.occurredAt.getTime() : null;
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async publishOne(candidate: OutboxEventDocument): Promise<boolean> {
    const now = new Date();
    const attempts = candidate.attempts + 1;

    // Claim, as a compare-and-set on the attempt counter.
    //
    // Filtering on `status: PENDING` alone is not a claim: the update below does
    // not change `status`, so two relays that both read this row in `publishDue`
    // would both match it and both publish — a duplicated
    // `scholarship.award-status-changed`, which a listener is right to treat as a
    // second state transition. Pinning `attempts: candidate.attempts` means the
    // first relay's increment invalidates the second relay's filter, so exactly
    // one of them proceeds.
    //
    // The row is also parked out of reach for `OUTBOX_LEASE_MS` before the
    // publish, so a slow handler cannot have a second relay pick the same row up
    // from the tail of the queue mid-publish. A crash mid-publish costs one lease
    // of latency and then the event is retried — which is the point of an
    // at-least-once outbox.
    const claimed = await this.outboxModel
      .findOneAndUpdate(
        {
          _id: candidate._id,
          status: OutboxEventStatus.PENDING,
          attempts: candidate.attempts,
        },
        {
          $set: {
            attempts,
            nextAttemptAt: new Date(
              now.getTime() +
                Math.max(this.backoffMs(attempts), OUTBOX_LEASE_MS),
            ),
          },
        },
        { new: false },
      )
      .exec();
    if (!claimed) return false;

    if (attempts > OUTBOX_MAX_ATTEMPTS) {
      await this.outboxModel
        .updateOne(
          { _id: candidate._id },
          {
            $set: {
              status: OutboxEventStatus.DEAD,
              deadLetteredAt: now,
              lastError:
                claimed.lastError ?? 'delivery abandoned after backoff',
            },
          },
        )
        .exec();
      this.logger.error(
        `Outbox event ${claimed.eventId} (${claimed.eventName}) dead-lettered ` +
          `after ${attempts} attempts. Aggregate ${claimed.aggregateType}/` +
          `${claimed.aggregateId} may not have been observed by its listeners; ` +
          `replay it manually or fix the listener before resuming.`,
      );
      return false;
    }

    try {
      this.eventEmitter.emit(claimed.eventName, this.envelope(claimed));
      await this.outboxModel
        .updateOne(
          { _id: candidate._id, status: OutboxEventStatus.PENDING },
          {
            $set: {
              status: OutboxEventStatus.PUBLISHED,
              publishedAt: new Date(),
              lastError: null,
            },
          },
        )
        .exec();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.outboxModel
        .updateOne(
          { _id: candidate._id, status: OutboxEventStatus.PENDING },
          { $set: { lastError: message.slice(0, 500) } },
        )
        .exec();
      this.logger.warn(
        `Outbox delivery of ${claimed.eventName} (${claimed.eventId}) failed, ` +
          `attempt ${attempts}: ${message}`,
      );
      return false;
    }
  }

  /** Envelope merged over the domain payload; consumers see one flat object. */
  private envelope(row: OutboxEventDocument): Record<string, unknown> {
    return {
      ...row.payload,
      eventId: row.eventId,
      schemaVersion: row.schemaVersion,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      correlationId: row.correlationId,
      occurredAt: row.occurredAt.toISOString(),
    };
  }

  /** 2s, 4s, 8s … capped at five minutes, so a bad listener cannot spin. */
  private backoffMs(attempts: number): number {
    return Math.min(2 ** attempts * 1000, 5 * 60 * 1000);
  }

  private assertPayloadIsAllowlisted(
    eventName: string,
    payload: Record<string, unknown>,
  ): void {
    const allowed = ALLOWED_PAYLOAD_KEYS[eventName];
    if (!allowed) {
      throw new BusinessRuleException(
        `No outbox payload allowlist is declared for ${eventName}. Add one to ` +
          `ALLOWED_PAYLOAD_KEYS before staging this event.`,
        ErrorCode.BIZ_OUTBOX_EVENT_NOT_ALLOWLISTED,
      );
    }
    const disallowed = Object.keys(payload).filter(
      (key) => !allowed.includes(key),
    );
    if (disallowed.length > 0) {
      throw new BusinessRuleException(
        `Outbox payload for ${eventName} carries non-allowlisted field(s): ` +
          `${disallowed.join(', ')}. The outbox is not tenant-partitioned, so ` +
          `only identifiers, minor-unit amounts and currency codes belong here.`,
        ErrorCode.BIZ_OUTBOX_EVENT_NOT_ALLOWLISTED,
      );
    }
  }
}
