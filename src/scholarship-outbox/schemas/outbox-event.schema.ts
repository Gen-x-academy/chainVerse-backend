import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OutboxEventDocument = HydratedDocument<OutboxEvent>;

/**
 * Lifecycle of a staged outbox row.
 *
 *   PENDING    — staged inside the producing transaction, not yet published.
 *   PUBLISHED  — delivered to the in-process event bus exactly once (see the
 *                delivery note on `publishedAt` for the at-least-once caveat).
 *   DEAD       — retried past `maxAttempts`; no longer relayed. Retained for
 *                operator inspection and never silently dropped.
 */
export enum OutboxEventStatus {
  PENDING = 'pending',
  PUBLISHED = 'published',
  DEAD = 'dead',
}

/**
 * Which scholarship aggregate produced the event. Kept as a small closed set
 * rather than a free string so the relay and its metrics can group by owner.
 */
export enum OutboxAggregateType {
  BUDGET_RESERVATION = 'budget_reservation',
  SCHOLARSHIP_AWARD = 'scholarship_award',
  MILESTONE_APPROVAL = 'milestone_approval',
  DISBURSEMENT_INTENT = 'disbursement_intent',
  BUDGET_LEDGER = 'budget_ledger',
}

/**
 * Payload envelope every relayed event carries on top of the domain payload.
 *
 * `eventId` is the deduplication key. The in-process bus is at-most-once, so a
 * crash between `emit()` and the `publishedAt` write can deliver an event twice;
 * consumers are required to key idempotency on `eventId`, not on arrival order.
 */
export interface OutboxEnvelope {
  eventId: string;
  schemaVersion: number;
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  organizationId: string;
  correlationId: string | null;
  occurredAt: string;
}

/**
 * Transactional outbox row.
 *
 * Every cross-module scholarship transition stages one of these **inside the
 * same Mongo transaction** as the authoritative write. If the transaction
 * commits, the event is guaranteed to exist; if it aborts, neither exists.
 * That removes the window in which `MilestoneVerificationService` saved a
 * `PaymentEligibility` and then died before emitting `payment-eligible`, which
 * previously left the milestone payable with nobody listening and was only
 * repaired by a five-minute cron sweep.
 *
 * Migration:
 *   New collection `scholarship_outbox_events`. No existing collection is
 *   modified, so this deploys additively. Backfill is unnecessary — rows are
 *   created by the flows that changed, not by a migration of historical data.
 *   The relay self-heals any row written before the relay existed, so a deploy
 *   that lands the writer ahead of the reader publishes nothing late.
 *
 * Operational impact:
 *   - One extra insert per cross-module transition (~4 writes/second at the
 *     observed peak of scholarship activity), inside an already-open
 *     transaction.
 *   - The relay publishes in batches on a cron; expect delivery latency of up to
 *     `OUTBOX_POLL_MS` for events raised outside a request, and immediate
 *     delivery for events staged during a request (see `OutboxRelayJob`).
 *   - `scholarship_outbox_events` grows by one row per transition until the TTL
 *     in `expiresAt` reaps it. Budget 4 KB per row as the upper bound.
 *   - Rows in `dead` state are the operator's queue; the drift dashboards alert
 *     on `deadLetterCount > 0`.
 *
 * Privacy:
 *   Payloads are a **closed allowlist per event name**, enforced by
 *   `OutboxService.stage`. They carry identifiers, minor-unit amounts and
 *   currency codes only — never applicant names, evidence bodies, milestone
 *   descriptions, notes, free-text reasons or wallet secret material. The outbox
 *   is not tenant-isolated at rest the way the source collections are, so
 *   anything that would be too sensitive for a log line is deliberately absent.
 */
@Schema({ timestamps: true, collection: 'scholarship_outbox_events' })
export class OutboxEvent {
  /**
   * Stable identifier, also carried in the emitted envelope. Generated once at
   * stage time so that a retry of the *same* staged row keeps the same id.
   */
  @Prop({ required: true, unique: true })
  eventId: string;

  /** Tenant scope of the transition that produced the event. */
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, enum: OutboxAggregateType, index: true })
  aggregateType: OutboxAggregateType;

  @Prop({ required: true, index: true })
  aggregateId: string;

  /** One of the `DomainEvents` constants; relayed verbatim onto the bus. */
  @Prop({ required: true, index: true })
  eventName: string;

  /**
   * Version of the *payload shape*, bumped when a field is removed or its
   * meaning changes. Additive fields do not bump it.
   */
  @Prop({ required: true, min: 1, default: 1 })
  schemaVersion: number;

  /** Ties one business flow's events together across requests and retries. */
  // Explicit `type`: a `string | null` union is ambiguous to Mongoose's runtime
  // reflection, which throws at class-decoration time rather than reporting a
  // type error. Nullability is expressed through `default` instead.
  @Prop({ type: String, default: null, index: true })
  correlationId: string | null;

  @Prop({ required: true })
  occurredAt: Date;

  @Prop({ required: true, enum: OutboxEventStatus, index: true })
  status: OutboxEventStatus;

  /** Bumped on every delivery attempt; drives the backoff and the dead-letter cut-off. */
  @Prop({ required: true, min: 0, default: 0 })
  attempts: number;

  /** Earliest time the relay may attempt delivery (exponential backoff). */
  @Prop({ required: true, index: true })
  nextAttemptAt: Date;

  /** Null until the relay has published the row. */
  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  /** Set when delivery is abandoned; from then on the row is never retried. */
  @Prop({ type: Date, default: null })
  deadLetteredAt: Date | null;

  /** Truncated failure detail for the last delivery attempt. */
  @Prop({ type: String, default: null })
  lastError: string | null;

  /**
   * Domain payload. Shape is defined by `eventName`; see the privacy note on
   * the class.
   */
  @Prop({ required: true, type: Object })
  payload: Record<string, unknown>;

  /**
   * Stamped at stage time; drives the TTL index that reaps published and dead
   * rows. Bounded rather than derived from `publishedAt` so a row that never
   * publishes is still collected.
   */
  @Prop({ required: true })
  expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);

/**
 * Relay polling index: unpublished rows whose backoff has elapsed. Partial so
 * the index stays proportional to the backlog rather than to all history.
 */
OutboxEventSchema.index(
  { nextAttemptAt: 1, occurredAt: 1 },
  { partialFilterExpression: { status: OutboxEventStatus.PENDING } },
);

/** Operator dashboard: dead letters per tenant. */
OutboxEventSchema.index({ status: 1, organizationId: 1 });

/**
 * Reap published and dead rows after 14 days. `expiresAt` is stamped at stage
 * time rather than derived so it is not affected by later clock skew, and so a
 * row that never publishes is still bounded.
 */
OutboxEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
