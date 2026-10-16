import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientSession, Model, Types } from 'mongoose';
import {
  BudgetLedger,
  BudgetLedgerDocument,
  BudgetReservation,
  BudgetReservationDocument,
  ReservationStatus,
  RESERVATION_STATUS_TRANSITIONS,
} from '../schemas/budget-reservation.schema';
import {
  BudgetLedgerResult,
  BudgetReservationResult,
  CancelReservationDto,
  ConfirmReservationDto,
  CreateReservationDto,
  InitialiseLedgerDto,
  ListReservationsQueryDto,
  ReleaseReservationDto,
  UpdateLedgerDto,
} from '../dto/budget-reservation.dto';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { DomainEvents } from '../../events/event-names';
import { OutboxService } from '../../scholarship-outbox/services/outbox.service';
import {
  ScholarshipTransactionRunner,
  withSession,
} from '../../scholarship-outbox/services/scholarship-transaction.runner';
import { OutboxAggregateType } from '../../scholarship-outbox/schemas/outbox-event.schema';

/** True for the duplicate-key errors the active-reservation index produces. */
function isDuplicateKeyError(error: unknown): boolean {
  const code = (error as { code?: number } | null)?.code;
  const codeName = (error as { codeName?: string } | null)?.codeName;
  return (
    code === 11000 ||
    codeName === 'DuplicateKey' ||
    (error instanceof Error && /E11000/.test(error.message))
  );
}

// ── Serialization helpers ─────────────────────────────────────────────────────

function toLedgerResult(doc: BudgetLedgerDocument): BudgetLedgerResult {
  const available = doc.totalBudget - doc.reservedAmount - doc.disbursedAmount;
  return {
    ledgerId: doc._id.toString(),
    organizationId: doc.organizationId,
    programId: doc.programId.toString(),
    totalBudget: doc.totalBudget,
    reservedAmount: doc.reservedAmount,
    disbursedAmount: doc.disbursedAmount,
    availableBudget: available,
    currency: doc.currency,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt!.toISOString(),
    updatedAt: doc.updatedAt!.toISOString(),
  };
}

function toReservationResult(
  doc: BudgetReservationDocument,
): BudgetReservationResult {
  return {
    reservationId: doc._id.toString(),
    organizationId: doc.organizationId,
    programId: doc.programId.toString(),
    applicationId: doc.applicationId.toString(),
    amount: doc.amount,
    currency: doc.currency,
    status: doc.status,
    expiresAt: doc.expiresAt.toISOString(),
    resolvedAt: doc.resolvedAt ? doc.resolvedAt.toISOString() : null,
    resolvedBy: doc.resolvedBy,
    reason: doc.reason,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt!.toISOString(),
    updatedAt: doc.updatedAt!.toISOString(),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Manages the per-program budget ledger and per-application reservations for
 * the scholarship awards workflow.
 *
 * Atomicity guarantee (#1255):
 *   Every mutation here touches **two** collections — the reservation document
 *   and the ledger's `reservedAmount`/`disbursedAmount` — so each one runs
 *   inside a single Mongo transaction via `ScholarshipTransactionRunner` and
 *   stages its outbox row in that same transaction.
 *
 *   This replaced a read-then-write sequence whose crash window was
 *   unrecoverable: the ledger `$inc` was applied *before* the reservation insert,
 *   so a crash in between left `reservedAmount` inflated with no reservation to
 *   justify or release it. The expiry job could not repair it, because it only
 *   iterates reservations that exist. The same shape existed in reverse on every
 *   release, where the reservation had already moved on and the ledger decrement
 *   was the write that could be lost.
 *
 * Exactly-once guarantee:
 *   Two independent mechanisms, deliberately layered:
 *     1. Every status transition is a compare-and-set whose filter carries the
 *        expected current status, so only one caller can move a reservation.
 *     2. The `uniq_active_reservation_per_application` partial unique index makes
 *        the "at most one active reservation per application" invariant a
 *        property of the database rather than of a preceding read. Under
 *        concurrency the index is what actually prevents a double reservation.
 *
 * Idempotency:
 *   Retrying any method converges on the existing reservation rather than
 *   double-counting, because the CAS matches zero documents on the second
 *   attempt and the follow-up read turns that into a precise error or a no-op.
 *
 * Tenant isolation:
 *   All public methods require `organizationId`; every query includes it,
 *   including the ledger reads used to classify a failed constraint.
 */
@Injectable()
export class BudgetReservationService {
  private readonly logger = new Logger(BudgetReservationService.name);

  constructor(
    @InjectModel(BudgetLedger.name)
    private readonly ledgerModel: Model<BudgetLedgerDocument>,
    @InjectModel(BudgetReservation.name)
    private readonly reservationModel: Model<BudgetReservationDocument>,
    private readonly transactions: ScholarshipTransactionRunner,
    private readonly outbox: OutboxService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Loads the ledger document for a program and asserts tenant ownership.
   * Throws {@link ResourceNotFoundException} when not found.
   */
  private async resolveLedger(
    organizationId: string,
    programId: string,
    session: ClientSession | null = null,
  ): Promise<BudgetLedgerDocument> {
    const ledger = await withSession(
      this.ledgerModel.findOne({
        programId: new Types.ObjectId(programId),
        organizationId,
      }),
      session,
    ).exec();
    if (!ledger) {
      throw new ResourceNotFoundException(
        `Budget ledger not found for program ${programId}.`,
        ErrorCode.RES_BUDGET_LEDGER_NOT_FOUND,
      );
    }
    return ledger;
  }

  /**
   * Finds any active (PENDING or CONFIRMED) reservation for an application.
   */
  private async findActiveReservation(
    organizationId: string,
    applicationId: string,
    session: ClientSession | null = null,
  ): Promise<BudgetReservationDocument | null> {
    return withSession(
      this.reservationModel.findOne({
        applicationId: new Types.ObjectId(applicationId),
        organizationId,
        status: {
          $in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
        },
      }),
      session,
    ).exec();
  }

  /**
   * Asserts that a status transition is permitted by the transition map.
   * Throws {@link BusinessRuleException} when the transition is illegal.
   */
  private assertTransitionAllowed(
    current: ReservationStatus,
    next: ReservationStatus,
  ): void {
    const allowed = RESERVATION_STATUS_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      // Give a more specific error for the most common illegal transitions.
      if (
        current === ReservationStatus.CONFIRMED &&
        next === ReservationStatus.CANCELLED
      ) {
        throw new BusinessRuleException(
          'A confirmed reservation cannot be cancelled; use release instead.',
          ErrorCode.BIZ_RESERVATION_ALREADY_CONFIRMED,
        );
      }
      if (
        (current === ReservationStatus.RELEASED ||
          current === ReservationStatus.EXPIRED ||
          current === ReservationStatus.CANCELLED) &&
        next === ReservationStatus.RELEASED
      ) {
        throw new BusinessRuleException(
          `Reservation is already in terminal state ${current} and cannot be released.`,
          ErrorCode.BIZ_RESERVATION_ALREADY_RELEASED,
        );
      }
      throw new BusinessRuleException(
        `Cannot transition reservation from ${current} to ${next}.`,
        ErrorCode.BIZ_RESERVATION_INVALID_STATE,
      );
    }
  }

  // ── Ledger management ──────────────────────────────────────────────────────

  /**
   * Creates the budget ledger for a scholarship program.
   *
   * Exactly one ledger may exist per program; a second call returns 409.
   *
   * @param organizationId  Tenant scope.
   * @param programId       The scholarship program.
   * @param dto             Total budget and currency.
   * @param actorId         JWT `sub` of the OWNER creating the ledger.
   */
  async initialiseLedger(
    organizationId: string,
    programId: string,
    dto: InitialiseLedgerDto,
    actorId: string,
  ): Promise<BudgetLedgerResult> {
    const existing = await this.ledgerModel
      .findOne({ programId: new Types.ObjectId(programId), organizationId })
      .exec();
    if (existing) {
      throw new ResourceConflictException(
        `A budget ledger already exists for program ${programId}.`,
        ErrorCode.BIZ_RESERVATION_ALREADY_EXISTS,
      );
    }

    const ledger = await this.ledgerModel.create({
      organizationId,
      programId: new Types.ObjectId(programId),
      totalBudget: dto.totalBudget,
      reservedAmount: 0,
      disbursedAmount: 0,
      currency: dto.currency.toUpperCase(),
      createdBy: actorId,
    });

    this.logger.log(
      `Budget ledger created for program ${programId} ` +
        `(total=${dto.totalBudget} ${dto.currency}) by ${actorId}`,
    );
    return toLedgerResult(ledger);
  }

  /**
   * Updates the total budget capacity of an existing ledger.
   *
   * The new value must not drop below `reservedAmount + disbursedAmount`
   * (cannot reclaim already-committed funds).
   *
   * @param organizationId  Tenant scope.
   * @param programId       The scholarship program.
   * @param dto             New total budget value.
   */
  async updateLedger(
    organizationId: string,
    programId: string,
    dto: UpdateLedgerDto,
  ): Promise<BudgetLedgerResult> {
    const ledger = await this.resolveLedger(organizationId, programId);

    const committed = ledger.reservedAmount + ledger.disbursedAmount;
    if (dto.totalBudget < committed) {
      throw new BusinessRuleException(
        `New total budget (${dto.totalBudget}) cannot be less than committed ` +
          `funds (reserved=${ledger.reservedAmount} + disbursed=${ledger.disbursedAmount} = ${committed}).`,
        ErrorCode.VAL_BUDGET_AMOUNT_INVALID,
      );
    }

    ledger.totalBudget = dto.totalBudget;
    await ledger.save();

    this.logger.log(
      `Budget ledger updated for program ${programId}: totalBudget=${dto.totalBudget}`,
    );
    return toLedgerResult(ledger);
  }

  /**
   * Returns the current budget ledger summary for a program.
   *
   * @param organizationId  Tenant scope.
   * @param programId       The scholarship program.
   */
  async getLedger(
    organizationId: string,
    programId: string,
  ): Promise<BudgetLedgerResult> {
    const ledger = await this.resolveLedger(organizationId, programId);
    return toLedgerResult(ledger);
  }

  // ── Reservation lifecycle ──────────────────────────────────────────────────

  /**
   * Creates a PENDING reservation and increments `BudgetLedger.reservedAmount`
   * as **one atomic unit**.
   *
   * The budget constraint stays in the update filter, so it is still enforced by
   * the server rather than by a prior read:
   *
   * ```
   * filter: { programId, organizationId, reservedAmount + disbursedAmount + amount <= totalBudget }
   * update: { $inc: { reservedAmount: +amount } }
   * ```
   *
   * What changed is that the reservation insert, that `$inc` and the outbox row
   * now share one transaction, so there is no longer an ordering in which the
   * ledger has been debited with nothing to show for it.
   *
   * The "no active reservation for this application" rule is now enforced twice,
   * and the second check is the one that holds under concurrency:
   *   - the pre-flight read, which gives a precise, actionable 409 for the
   *     ordinary single-caller case;
   *   - `uniq_active_reservation_per_application`, which is what actually
   *     resolves the race. When it fires, the transaction has already aborted,
   *     so the losing caller sees a clean 409 with no ledger mutation to undo.
   *
   * @param organizationId  Tenant scope.
   * @param programId       The scholarship program.
   * @param applicationId   The application being awarded.
   * @param dto             Amount, currency, and expiry timestamp.
   * @param actorId         JWT `sub` of the staff member creating the hold.
   */
  async createReservation(
    organizationId: string,
    programId: string,
    applicationId: string,
    dto: CreateReservationDto,
    actorId: string,
  ): Promise<BudgetReservationResult> {
    // 1. Validate expiry is in the future. Rejected before the transaction opens
    //    because no state is involved.
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= new Date()) {
      throw new ValidationDomainException(
        'expiresAt must be a future date.',
        ErrorCode.VAL_RESERVATION_INVALID_EXPIRY,
      );
    }

    const programObjectId = new Types.ObjectId(programId);
    const currency = dto.currency.toUpperCase();

    return this.transactions
      .run('scholarships.createReservation', async (session) => {
        // 2. Guard: no active reservation for this application.
        const existing = await this.findActiveReservation(
          organizationId,
          applicationId,
          session,
        );
        if (existing) {
          throw new ResourceConflictException(
            `An active reservation (${existing.status}) already exists for ` +
              `application ${applicationId}.`,
            ErrorCode.BIZ_RESERVATION_ALREADY_EXISTS,
          );
        }

        // 3. Atomically claim the budget slot.
        //    The filter ensures: reservedAmount + disbursedAmount + dto.amount <= totalBudget
        const updatedLedger = await withSession(
          this.ledgerModel.findOneAndUpdate(
            {
              programId: programObjectId,
              organizationId,
              currency,
              // Inline budget constraint — atomic, no separate read needed.
              $expr: {
                $lte: [
                  { $add: ['$reservedAmount', '$disbursedAmount', dto.amount] },
                  '$totalBudget',
                ],
              },
            },
            { $inc: { reservedAmount: dto.amount } },
            { new: true },
          ),
          session,
        ).exec();

        if (!updatedLedger) {
          // Determine whether the ledger is missing or budget is exhausted.
          // Read inside the transaction so the diagnosis reflects the same
          // snapshot the failed update was evaluated against.
          const ledger = await withSession(
            this.ledgerModel.findOne({
              programId: programObjectId,
              organizationId,
            }),
            session,
          ).exec();

          if (!ledger) {
            throw new ResourceNotFoundException(
              `Budget ledger not found for program ${programId}.`,
              ErrorCode.RES_BUDGET_LEDGER_NOT_FOUND,
            );
          }
          if (ledger.currency !== currency) {
            throw new ValidationDomainException(
              `Currency mismatch: ledger uses ${ledger.currency}, reservation requested ${currency}.`,
              ErrorCode.VAL_BUDGET_AMOUNT_INVALID,
            );
          }
          throw new BusinessRuleException(
            `Insufficient budget: requested ${dto.amount} ${currency} but only ` +
              `${ledger.totalBudget - ledger.reservedAmount - ledger.disbursedAmount} available.`,
            ErrorCode.BIZ_BUDGET_INSUFFICIENT,
          );
        }

        // 4. Create the reservation document now that budget is secured.
        let reservation: BudgetReservationDocument;
        try {
          [reservation] = await this.reservationModel.create(
            [
              {
                organizationId,
                programId: programObjectId,
                applicationId: new Types.ObjectId(applicationId),
                amount: dto.amount,
                currency,
                status: ReservationStatus.PENDING,
                expiresAt,
                resolvedAt: null,
                resolvedBy: null,
                reason: null,
                createdBy: actorId,
              },
            ],
            session ? { session } : {},
          );
        } catch (error) {
          // The partial unique index rejected a concurrent reservation for the
          // same application. Because the whole unit of work is transactional,
          // the ledger `$inc` above is rolled back with it — so reporting the
          // conflict here is honest: nothing was reserved.
          if (isDuplicateKeyError(error)) {
            throw new ResourceConflictException(
              `A reservation for application ${applicationId} was created concurrently; ` +
                `only one active reservation per application is permitted.`,
              ErrorCode.BIZ_RESERVATION_ALREADY_EXISTS,
            );
          }
          throw error;
        }

        // 5. Stage the event in the same transaction, so a committed
        //    reservation always has a durable record that it happened.
        await this.outbox.stage(
          {
            organizationId,
            aggregateType: OutboxAggregateType.BUDGET_RESERVATION,
            aggregateId: reservation._id.toString(),
            eventName: DomainEvents.SCHOLARSHIP_BUDGET_RESERVATION_CHANGED,
            payload: {
              reservationId: reservation._id.toString(),
              organizationId,
              programId,
              applicationId,
              amount: dto.amount,
              currency,
              status: ReservationStatus.PENDING,
            },
          },
          session,
        );

        return reservation;
      })
      .then((reservation) => {
        this.logger.log(
          `Budget reservation created: application=${applicationId}, ` +
            `amount=${dto.amount} ${currency}, expires=${dto.expiresAt} ` +
            `by ${actorId}`,
        );
        return toReservationResult(reservation);
      });
  }

  /**
   * The single write path for every reservation status transition.
   *
   * `confirmReservation`, `cancelReservation`, `releaseReservation` and the
   * expiry sweep all differ only in which statuses they accept and which way the
   * ledger moves. Factoring that out keeps the transaction boundary in exactly
   * one place — which is the point: four copies of "CAS the reservation, then
   * adjust the ledger" is four chances to forget that the second write must
   * share the first write's session.
   *
   * Within one transaction, in order:
   *   1. compare-and-set the reservation from `fromStatus` to `toStatus`;
   *   2. classify a lost race by re-reading, so the caller gets a precise 404 or
   *      422 rather than a silent no-op;
   *   3. apply the ledger movement;
   *   4. stage the outbox row.
   *
   * @returns the transitioned reservation, or `null` when another caller had
   *   already moved it out of `fromStatus` — the caller decides whether that is
   *   an idempotent success or a conflict.
   */
  private async settleReservation(
    label: string,
    params: {
      organizationId: string;
      programId: Types.ObjectId;
      applicationId: Types.ObjectId;
      /** Matches the reservation by id when set, otherwise by application+program. */
      reservationId?: Types.ObjectId;
      fromStatus: ReservationStatus;
      toStatus: ReservationStatus;
      actorId: string;
      reason: string | null;
      /** Ledger `$inc` computed from the amount the reservation actually held. */
      ledgerInc: (amount: number) => Record<string, number>;
      /** Skip the 404/classify path for the expiry sweep, which drives by id. */
      quietIfMissing?: boolean;
    },
  ): Promise<BudgetReservationDocument | null> {
    const {
      organizationId,
      programId,
      applicationId,
      reservationId,
      fromStatus,
      toStatus,
      actorId,
      reason,
      ledgerInc,
      quietIfMissing,
    } = params;

    return this.transactions.run(label, async (session) => {
      const identity = reservationId
        ? { _id: reservationId }
        : { applicationId, programId };

      const updated = await withSession(
        this.reservationModel.findOneAndUpdate(
          { ...identity, organizationId, status: fromStatus },
          {
            $set: {
              status: toStatus,
              resolvedAt: new Date(),
              resolvedBy: actorId,
              reason,
            },
          },
          { new: true },
        ),
        session,
      ).exec();

      if (!updated) {
        if (quietIfMissing) return null;

        // Re-read to surface a meaningful error.
        const doc = await withSession(
          this.reservationModel.findOne({ ...identity, organizationId }),
          session,
        ).exec();
        if (!doc) {
          throw new ResourceNotFoundException(
            `No reservation found for application ${applicationId.toString()}.`,
            ErrorCode.RES_BUDGET_RESERVATION_NOT_FOUND,
          );
        }
        this.assertTransitionAllowed(doc.status, toStatus);
        return null;
      }

      // The ledger moves in the same transaction as the reservation, so the two
      // can never disagree about whether this amount is still held.
      await withSession(
        this.ledgerModel.updateOne(
          { programId: updated.programId, organizationId },
          { $inc: ledgerInc(updated.amount) },
        ),
        session,
      ).exec();

      await this.outbox.stage(
        {
          organizationId,
          aggregateType: OutboxAggregateType.BUDGET_RESERVATION,
          aggregateId: updated._id.toString(),
          eventName: DomainEvents.SCHOLARSHIP_BUDGET_RESERVATION_CHANGED,
          payload: {
            reservationId: updated._id.toString(),
            organizationId,
            programId: updated.programId.toString(),
            applicationId: updated.applicationId.toString(),
            amount: updated.amount,
            currency: updated.currency,
            status: toStatus,
          },
        },
        session,
      );

      return updated;
    });
  }

  /**
   * Confirms a PENDING reservation (applicant has accepted the award).
   *
   * In one transaction:
   *   - Transitions reservation PENDING → CONFIRMED.
   *   - Decrements `BudgetLedger.reservedAmount`.
   *   - Increments `BudgetLedger.disbursedAmount`.
   *
   * @param organizationId   Tenant scope.
   * @param programId        The scholarship program.
   * @param applicationId    The application whose reservation is confirmed.
   * @param dto              Optional acceptance note.
   * @param actorId          JWT `sub` of the staff member confirming.
   */
  async confirmReservation(
    organizationId: string,
    programId: string,
    applicationId: string,
    dto: ConfirmReservationDto,
    actorId: string,
  ): Promise<BudgetReservationResult> {
    const updated = await this.settleReservation(
      'scholarships.confirmReservation',
      {
        organizationId,
        programId: new Types.ObjectId(programId),
        applicationId: new Types.ObjectId(applicationId),
        fromStatus: ReservationStatus.PENDING,
        toStatus: ReservationStatus.CONFIRMED,
        actorId,
        reason: dto.note ?? null,
        ledgerInc: (amount) => ({
          reservedAmount: -amount,
          disbursedAmount: amount,
        }),
      },
    );

    this.logger.log(
      `Reservation confirmed for application ${applicationId} by ${actorId}`,
    );
    return toReservationResult(updated!);
  }

  /**
   * Cancels a PENDING reservation (admin decision; award not yet accepted).
   *
   * In one transaction:
   *   - Transitions reservation PENDING → CANCELLED.
   *   - Decrements `BudgetLedger.reservedAmount`.
   *
   * @param organizationId   Tenant scope.
   * @param programId        The scholarship program.
   * @param applicationId    The application whose reservation is cancelled.
   * @param dto              Mandatory cancellation reason.
   * @param actorId          JWT `sub` of the OWNER/ADMIN cancelling.
   */
  async cancelReservation(
    organizationId: string,
    programId: string,
    applicationId: string,
    dto: CancelReservationDto,
    actorId: string,
  ): Promise<BudgetReservationResult> {
    const updated = await this.settleReservation(
      'scholarships.cancelReservation',
      {
        organizationId,
        programId: new Types.ObjectId(programId),
        applicationId: new Types.ObjectId(applicationId),
        fromStatus: ReservationStatus.PENDING,
        toStatus: ReservationStatus.CANCELLED,
        actorId,
        reason: dto.reason,
        ledgerInc: (amount) => ({ reservedAmount: -amount }),
      },
    );

    this.logger.log(
      `Reservation cancelled for application ${applicationId} by ${actorId}: ` +
        dto.reason,
    );
    return toReservationResult(updated!);
  }

  /**
   * Releases a CONFIRMED reservation (award rescinded after acceptance).
   *
   * In one transaction:
   *   - Transitions reservation CONFIRMED → RELEASED.
   *   - Decrements `BudgetLedger.disbursedAmount`.
   *     (The capacity is restored to `availableBudget`.)
   *
   * @param organizationId   Tenant scope.
   * @param programId        The scholarship program.
   * @param applicationId    The application whose confirmed reservation is released.
   * @param dto              Mandatory release reason.
   * @param actorId          JWT `sub` of the OWNER releasing.
   */
  async releaseReservation(
    organizationId: string,
    programId: string,
    applicationId: string,
    dto: ReleaseReservationDto,
    actorId: string,
  ): Promise<BudgetReservationResult> {
    const updated = await this.settleReservation(
      'scholarships.releaseReservation',
      {
        organizationId,
        programId: new Types.ObjectId(programId),
        applicationId: new Types.ObjectId(applicationId),
        fromStatus: ReservationStatus.CONFIRMED,
        toStatus: ReservationStatus.RELEASED,
        actorId,
        reason: dto.reason,
        ledgerInc: (amount) => ({ disbursedAmount: -amount }),
      },
    );

    this.logger.log(
      `Reservation released for application ${applicationId} by ${actorId}: ` +
        dto.reason,
    );
    return toReservationResult(updated!);
  }

  // ── Read endpoints ─────────────────────────────────────────────────────────

  /**
   * Returns the active (PENDING or CONFIRMED) reservation for an application,
   * or 404 if none exists.
   *
   * @param organizationId  Tenant scope.
   * @param programId       The scholarship program.
   * @param applicationId   The application.
   */
  async getReservation(
    organizationId: string,
    programId: string,
    applicationId: string,
  ): Promise<BudgetReservationResult> {
    const doc = await this.reservationModel
      .findOne({
        applicationId: new Types.ObjectId(applicationId),
        organizationId,
        programId: new Types.ObjectId(programId),
        status: {
          $in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
        },
      })
      .exec();

    if (!doc) {
      throw new ResourceNotFoundException(
        `No active reservation found for application ${applicationId}.`,
        ErrorCode.RES_BUDGET_RESERVATION_NOT_FOUND,
      );
    }
    return toReservationResult(doc);
  }

  /**
   * Lists all reservations for a program, with optional status filter.
   *
   * Sorted by `createdAt` descending (most recent first).
   *
   * @param programId   The scholarship program.
   * @param query       Tenant scope, optional status filter, optional limit.
   */
  async listReservations(
    programId: string,
    query: ListReservationsQueryDto,
  ): Promise<BudgetReservationResult[]> {
    const filter: Record<string, unknown> = {
      programId: new Types.ObjectId(programId),
      organizationId: query.organizationId,
    };
    if (query.status) {
      filter.status = query.status;
    }

    const limit = Math.min(query.limit ?? 50, 200);

    const docs = await this.reservationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return docs.map(toReservationResult);
  }

  // ── Scheduled expiry job ───────────────────────────────────────────────────

  /**
   * Expires all PENDING reservations whose `expiresAt` has elapsed.
   *
   * Runs every hour.  A slower 6-hour reconciliation pass also runs as a
   * safety net in case a scheduled run is missed.
   *
   * For each expired reservation:
   *   1. Transitions reservation PENDING → EXPIRED (conditional update).
   *   2. Decrements BudgetLedger.reservedAmount by the reservation amount.
   *
   * The method is idempotent: running it multiple times on the same set of
   * reservations produces the same result because the conditional update on
   * `status = PENDING` is a no-op for already-expired documents.
   *
   * @returns Number of reservations expired in this run.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'scholarship-reservation-expiry' })
  async expireReservations(): Promise<number> {
    return this.runExpiryJob('hourly-expiry');
  }

  /** Six-hour safety-net reconciliation run. */
  @Cron(CronExpression.EVERY_6_HOURS, {
    name: 'scholarship-reservation-expiry-reconciliation',
  })
  async reconcileExpiredReservations(): Promise<number> {
    return this.runExpiryJob('6h-reconciliation');
  }

  /**
   * Core expiry logic shared by both cron methods.
   *
   * Finds all PENDING reservations with `expiresAt <= now`, transitions each to
   * EXPIRED and returns the budget to available capacity — one transaction per
   * reservation, not one for the whole sweep, so a single bad document cannot
   * roll back an hour's worth of correct expiries.
   *
   * Each unit is the shared `settleReservation` path, so the CAS, the ledger
   * movement and the outbox row commit together. Two overlapping cron instances
   * therefore cannot both decrement the ledger for the same reservation: the
   * loser's CAS matches nothing and its transaction is a no-op.
   */
  private async runExpiryJob(label: string): Promise<number> {
    const now = new Date();

    // Find candidate reservations using the partial index (status + expiresAt).
    const candidates = await this.reservationModel
      .find({
        status: ReservationStatus.PENDING,
        expiresAt: { $lte: now },
      })
      .select('_id organizationId programId applicationId amount')
      .lean()
      .exec();

    if (candidates.length === 0) {
      return 0;
    }

    let expired = 0;
    for (const candidate of candidates) {
      const updated = await this.settleReservation(
        `scholarships.expireReservation:${label}`,
        {
          organizationId: candidate.organizationId,
          programId: candidate.programId,
          applicationId: candidate.applicationId,
          reservationId: candidate._id,
          fromStatus: ReservationStatus.PENDING,
          toStatus: ReservationStatus.EXPIRED,
          actorId: 'system:expiry-job',
          reason: 'Reservation expired — applicant did not accept within TTL.',
          ledgerInc: (amount) => ({ reservedAmount: -amount }),
          // Another process (or a prior run) already transitioned this one;
          // that is the normal case for an overlapping sweep, not an error.
          quietIfMissing: true,
        },
      );
      if (updated) expired++;
    }

    if (expired > 0) {
      this.logger.log(
        `[${label}] Expired ${expired} reservation(s) and restored budget.`,
      );
    }

    return expired;
  }
}
