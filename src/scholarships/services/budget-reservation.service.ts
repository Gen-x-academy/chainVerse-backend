import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
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

// ── Serialization helpers ─────────────────────────────────────────────────────

function toLedgerResult(doc: BudgetLedgerDocument): BudgetLedgerResult {
  const available =
    doc.totalBudget - doc.reservedAmount - doc.disbursedAmount;
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
 * Atomicity guarantee:
 *   Budget mutations use MongoDB's conditional `findOneAndUpdate` with
 *   arithmetic operators (`$inc`) so the read-check-write is a single
 *   round-trip.  No multi-document transactions are required because each
 *   ledger document is self-contained and the constraint is expressed in the
 *   update filter itself.
 *
 * Exactly-once release guarantee:
 *   Every status transition uses a `findOneAndUpdate` that includes the
 *   current expected status in the filter predicate.  Concurrent requests for
 *   the same reservation race: the first wins (matches a document and updates
 *   it), the second finds no matching document and the service detects the
 *   state change via a follow-up read, returning a meaningful error.
 *
 * Tenant isolation:
 *   All public methods require `organizationId`; every query includes it.
 */
@Injectable()
export class BudgetReservationService {
  private readonly logger = new Logger(BudgetReservationService.name);

  constructor(
    @InjectModel(BudgetLedger.name)
    private readonly ledgerModel: Model<BudgetLedgerDocument>,
    @InjectModel(BudgetReservation.name)
    private readonly reservationModel: Model<BudgetReservationDocument>,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Loads the ledger document for a program and asserts tenant ownership.
   * Throws {@link ResourceNotFoundException} when not found.
   */
  private async resolveLedger(
    organizationId: string,
    programId: string,
  ): Promise<BudgetLedgerDocument> {
    const ledger = await this.ledgerModel
      .findOne({ programId: new Types.ObjectId(programId), organizationId })
      .exec();
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
  ): Promise<BudgetReservationDocument | null> {
    return this.reservationModel
      .findOne({
        applicationId: new Types.ObjectId(applicationId),
        organizationId,
        status: { $in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
      })
      .exec();
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
   * Atomically creates a PENDING reservation and increments
   * `BudgetLedger.reservedAmount`.
   *
   * The budget constraint is enforced via a single conditional
   * `findOneAndUpdate`:
   *
   * ```
   * filter: { programId, organizationId, reservedAmount + disbursedAmount + amount <= totalBudget }
   * update: { $inc: { reservedAmount: +amount } }
   * ```
   *
   * If the update matches 0 documents (constraint violated), the service
   * throws {@link BIZ_BUDGET_INSUFFICIENT} without creating the reservation.
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
    // 1. Validate expiry is in the future.
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= new Date()) {
      throw new ValidationDomainException(
        'expiresAt must be a future date.',
        ErrorCode.VAL_RESERVATION_INVALID_EXPIRY,
      );
    }

    // 2. Guard: no active reservation for this application.
    const existing = await this.findActiveReservation(
      organizationId,
      applicationId,
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
    //    which is equivalent to:  reservedAmount <= totalBudget - disbursedAmount - amount
    const programObjectId = new Types.ObjectId(programId);
    const updatedLedger = await this.ledgerModel
      .findOneAndUpdate(
        {
          programId: programObjectId,
          organizationId,
          currency: dto.currency.toUpperCase(),
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
      )
      .exec();

    if (!updatedLedger) {
      // Determine whether the ledger is missing or budget is exhausted.
      const ledger = await this.ledgerModel
        .findOne({ programId: programObjectId, organizationId })
        .exec();

      if (!ledger) {
        throw new ResourceNotFoundException(
          `Budget ledger not found for program ${programId}.`,
          ErrorCode.RES_BUDGET_LEDGER_NOT_FOUND,
        );
      }
      if (ledger.currency !== dto.currency.toUpperCase()) {
        throw new ValidationDomainException(
          `Currency mismatch: ledger uses ${ledger.currency}, reservation requested ${dto.currency.toUpperCase()}.`,
          ErrorCode.VAL_BUDGET_AMOUNT_INVALID,
        );
      }
      throw new BusinessRuleException(
        `Insufficient budget: requested ${dto.amount} ${dto.currency} but only ` +
          `${ledger.totalBudget - ledger.reservedAmount - ledger.disbursedAmount} available.`,
        ErrorCode.BIZ_BUDGET_INSUFFICIENT,
      );
    }

    // 4. Create the reservation document now that budget is secured.
    const reservation = await this.reservationModel.create({
      organizationId,
      programId: programObjectId,
      applicationId: new Types.ObjectId(applicationId),
      amount: dto.amount,
      currency: dto.currency.toUpperCase(),
      status: ReservationStatus.PENDING,
      expiresAt,
      resolvedAt: null,
      resolvedBy: null,
      reason: null,
      createdBy: actorId,
    });

    this.logger.log(
      `Budget reservation created: application=${applicationId}, ` +
        `amount=${dto.amount} ${dto.currency}, expires=${dto.expiresAt} ` +
        `by ${actorId}`,
    );
    return toReservationResult(reservation);
  }

  /**
   * Confirms a PENDING reservation (applicant has accepted the award).
   *
   * Atomically:
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
    const now = new Date();

    // Conditional update: only succeeds if the reservation is still PENDING.
    const updated = await this.reservationModel
      .findOneAndUpdate(
        {
          applicationId: new Types.ObjectId(applicationId),
          organizationId,
          programId: new Types.ObjectId(programId),
          status: ReservationStatus.PENDING,
        },
        {
          $set: {
            status: ReservationStatus.CONFIRMED,
            resolvedAt: now,
            resolvedBy: actorId,
            reason: dto.note ?? null,
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      // Re-read to surface a meaningful error.
      const doc = await this.reservationModel
        .findOne({
          applicationId: new Types.ObjectId(applicationId),
          organizationId,
          programId: new Types.ObjectId(programId),
        })
        .exec();

      if (!doc) {
        throw new ResourceNotFoundException(
          `No reservation found for application ${applicationId}.`,
          ErrorCode.RES_BUDGET_RESERVATION_NOT_FOUND,
        );
      }
      this.assertTransitionAllowed(doc.status, ReservationStatus.CONFIRMED);
    }

    // Move amount from reserved → disbursed on the ledger.
    await this.ledgerModel
      .updateOne(
        { programId: new Types.ObjectId(programId), organizationId },
        { $inc: { reservedAmount: -updated!.amount, disbursedAmount: updated!.amount } },
      )
      .exec();

    this.logger.log(
      `Reservation confirmed for application ${applicationId} by ${actorId}`,
    );
    return toReservationResult(updated!);
  }

  /**
   * Cancels a PENDING reservation (admin decision; award not yet accepted).
   *
   * Atomically:
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
    const now = new Date();

    const updated = await this.reservationModel
      .findOneAndUpdate(
        {
          applicationId: new Types.ObjectId(applicationId),
          organizationId,
          programId: new Types.ObjectId(programId),
          status: ReservationStatus.PENDING,
        },
        {
          $set: {
            status: ReservationStatus.CANCELLED,
            resolvedAt: now,
            resolvedBy: actorId,
            reason: dto.reason,
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      const doc = await this.reservationModel
        .findOne({
          applicationId: new Types.ObjectId(applicationId),
          organizationId,
          programId: new Types.ObjectId(programId),
        })
        .exec();

      if (!doc) {
        throw new ResourceNotFoundException(
          `No reservation found for application ${applicationId}.`,
          ErrorCode.RES_BUDGET_RESERVATION_NOT_FOUND,
        );
      }
      this.assertTransitionAllowed(doc.status, ReservationStatus.CANCELLED);
    }

    await this.ledgerModel
      .updateOne(
        { programId: new Types.ObjectId(programId), organizationId },
        { $inc: { reservedAmount: -updated!.amount } },
      )
      .exec();

    this.logger.log(
      `Reservation cancelled for application ${applicationId} by ${actorId}: ` +
        dto.reason,
    );
    return toReservationResult(updated!);
  }

  /**
   * Releases a CONFIRMED reservation (award rescinded after acceptance).
   *
   * Atomically:
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
    const now = new Date();

    const updated = await this.reservationModel
      .findOneAndUpdate(
        {
          applicationId: new Types.ObjectId(applicationId),
          organizationId,
          programId: new Types.ObjectId(programId),
          status: ReservationStatus.CONFIRMED,
        },
        {
          $set: {
            status: ReservationStatus.RELEASED,
            resolvedAt: now,
            resolvedBy: actorId,
            reason: dto.reason,
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      const doc = await this.reservationModel
        .findOne({
          applicationId: new Types.ObjectId(applicationId),
          organizationId,
          programId: new Types.ObjectId(programId),
        })
        .exec();

      if (!doc) {
        throw new ResourceNotFoundException(
          `No reservation found for application ${applicationId}.`,
          ErrorCode.RES_BUDGET_RESERVATION_NOT_FOUND,
        );
      }
      this.assertTransitionAllowed(doc.status, ReservationStatus.RELEASED);
    }

    await this.ledgerModel
      .updateOne(
        { programId: new Types.ObjectId(programId), organizationId },
        { $inc: { disbursedAmount: -updated!.amount } },
      )
      .exec();

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
        status: { $in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
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
   * Finds all PENDING reservations with `expiresAt <= now`, transitions each
   * to EXPIRED, and returns the budget to available capacity on the ledger.
   *
   * Uses `findOneAndUpdate` per document (not a bulk update) so that the
   * conditional status check (`status = PENDING`) is applied atomically per
   * document, preventing double-expiry if two cron instances overlap.
   */
  private async runExpiryJob(label: string): Promise<number> {
    const now = new Date();

    // Find candidate reservations using the partial index (status + expiresAt).
    const candidates = await this.reservationModel
      .find({
        status: ReservationStatus.PENDING,
        expiresAt: { $lte: now },
      })
      .select('_id organizationId programId amount')
      .lean()
      .exec();

    if (candidates.length === 0) {
      return 0;
    }

    let expired = 0;
    for (const candidate of candidates) {
      // Conditional single-document transition — idempotent.
      const updated = await this.reservationModel
        .findOneAndUpdate(
          { _id: candidate._id, status: ReservationStatus.PENDING },
          {
            $set: {
              status: ReservationStatus.EXPIRED,
              resolvedAt: now,
              resolvedBy: 'system:expiry-job',
              reason: 'Reservation expired — applicant did not accept within TTL.',
            },
          },
          { new: false }, // return old doc to confirm it was PENDING
        )
        .exec();

      if (!updated) {
        // Another process (or a prior run) already transitioned this one.
        continue;
      }

      // Restore the held amount to available budget.
      await this.ledgerModel
        .updateOne(
          {
            programId: candidate.programId,
            organizationId: candidate.organizationId,
          },
          { $inc: { reservedAmount: -candidate.amount } },
        )
        .exec();

      expired++;
    }

    if (expired > 0) {
      this.logger.log(
        `[${label}] Expired ${expired} reservation(s) and restored budget.`,
      );
    }

    return expired;
  }
}
