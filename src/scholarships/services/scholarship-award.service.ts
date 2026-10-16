import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientSession, Model, Types } from 'mongoose';
import {
  AwardStatus,
  ACTIVE_AWARD_STATUSES,
  AWARD_STATUS_TRANSITIONS,
  ScholarshipAward,
  ScholarshipAwardDocument,
} from '../schemas/scholarship-award.schema';
import {
  BudgetReservation,
  BudgetReservationDocument,
  BudgetLedger,
  BudgetLedgerDocument,
  ReservationStatus,
} from '../schemas/budget-reservation.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
} from '../schemas/scholarship-application.schema';
import {
  AcceptAwardDto,
  AwardMilestoneResult,
  AwardResult,
  CreateAwardDto,
  DeclineAwardDto,
  ListAwardsQueryDto,
  RescindAwardDto,
} from '../dto/award.dto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
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

/** True for the duplicate-key errors the active-award index produces. */
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

function toAwardResult(doc: ScholarshipAwardDocument): AwardResult {
  const milestones: AwardMilestoneResult[] = doc.milestones.map((m) => ({
    milestoneId: m._id.toString(),
    title: m.title,
    description: m.description,
    amount: m.amount,
    startsAt: m.startsAt ? m.startsAt.toISOString() : null,
    endsAt: m.endsAt ? m.endsAt.toISOString() : null,
  }));

  return {
    awardId: doc._id.toString(),
    organizationId: doc.organizationId,
    programId: doc.programId.toString(),
    applicationId: doc.applicationId.toString(),
    applicantId: doc.applicantId,
    reservationId: doc.reservationId ? doc.reservationId.toString() : null,
    amount: doc.amount,
    currency: doc.currency,
    termsText: doc.termsText,
    milestones,
    acceptanceDeadline: doc.acceptanceDeadline.toISOString(),
    status: doc.status,
    respondedAt: doc.respondedAt ? doc.respondedAt.toISOString() : null,
    applicantNote: doc.applicantNote,
    rescindedAt: doc.rescindedAt ? doc.rescindedAt.toISOString() : null,
    rescindedBy: doc.rescindedBy,
    rescissionReason: doc.rescissionReason,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt!.toISOString(),
    updatedAt: doc.updatedAt!.toISOString(),
  };
}

/**
 * The ledger movement implied by a reservation transition, in one place so the
 * reserved/disbursed arithmetic cannot drift between call sites.
 *
 *   PENDING   → CONFIRMED : the amount becomes disbursed. It was already
 *                             promised and the applicant has now accepted.
 *   PENDING   → terminal   : the hold is abandoned, so it returns to available
 *                             capacity.
 *   CONFIRMED → RELEASED   : the award was rescinded before payout, so the
 *                             disbursed tally is credited back.
 */
function ledgerDelta(
  from: ReservationStatus,
  to: ReservationStatus,
  amount: number,
): Record<string, number> {
  if (to === ReservationStatus.CONFIRMED) {
    return { reservedAmount: -amount, disbursedAmount: amount };
  }
  if (from === ReservationStatus.CONFIRMED) {
    return { disbursedAmount: -amount };
  }
  return { reservedAmount: -amount };
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * ScholarshipAwardService materializes approved awards and manages their full
 * lifecycle: creation, applicant acceptance/decline, staff rescission, and
 * automated expiry.
 *
 * Key invariants:
 *
 *   1. **One active award per application.**
 *      Enforced by the `uniq_active_award_per_application` partial unique index,
 *      with a pre-flight read on top for a better error message. The index is
 *      what actually holds under concurrency — a read cannot (#1255).
 *
 *   2. **Conflict prevention.**
 *      Before creating a new award the service checks for any existing active
 *      award (PENDING_ACCEPTANCE | ACCEPTED) held by the same `applicantId`
 *      within the same `organizationId`.  A conflict returns 422
 *      BIZ_AWARD_CONFLICT.
 *
 *   3. **Authenticated acceptance.**
 *      The accept and decline endpoints verify that the calling user's JWT `sub`
 *      matches `award.applicantId`.  Any other caller receives 403
 *      BIZ_AWARD_ACCEPTANCE_FORBIDDEN.
 *
 *   4. **Offer expiry.**
 *      Two `@Cron` jobs sweep for PENDING_ACCEPTANCE awards past their
 *      `acceptanceDeadline` and transition them to OFFER_EXPIRED, releasing any
 *      linked budget reservation.
 *
 *   5. **Budget reservation linkage.**
 *      When `reservationId` is supplied on the award, acceptance transitions the
 *      reservation PENDING → CONFIRMED, and expiry/decline transitions it
 *      PENDING → EXPIRED/CANCELLED.  Rescission transitions CONFIRMED → RELEASED.
 *      Every one of those — award write, reservation CAS, ledger movement and
 *      outbox row — is a **single transaction** (#1255). The award's status and
 *      the ledger's arithmetic are the same fact, so they are never allowed to
 *      commit separately.
 *
 *   6. **Tenant isolation.**
 *      Every public method accepts `organizationId` as its first argument and
 *      includes it in every Mongoose query.
 */
@Injectable()
export class ScholarshipAwardService {
  private readonly logger = new Logger(ScholarshipAwardService.name);

  constructor(
    @InjectModel(ScholarshipAward.name)
    private readonly awardModel: Model<ScholarshipAwardDocument>,
    @InjectModel(ScholarshipApplication.name)
    private readonly applicationModel: Model<ScholarshipApplicationDocument>,
    @InjectModel(BudgetReservation.name)
    private readonly reservationModel: Model<BudgetReservationDocument>,
    @InjectModel(BudgetLedger.name)
    private readonly ledgerModel: Model<BudgetLedgerDocument>,
    private readonly transactions: ScholarshipTransactionRunner,
    private readonly outbox: OutboxService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Asserts that a status transition is permitted by AWARD_STATUS_TRANSITIONS.
   * Throws BIZ_AWARD_INVALID_STATE when the transition is illegal.
   */
  private assertTransitionAllowed(
    current: AwardStatus,
    next: AwardStatus,
  ): void {
    const allowed = AWARD_STATUS_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BusinessRuleException(
        `Award status transition ${current} → ${next} is not permitted.`,
        ErrorCode.BIZ_AWARD_INVALID_STATE,
      );
    }
  }

  /**
   * Validates milestone date ordering: startsAt must be before endsAt.
   * Throws VAL_AWARD_MILESTONE_DATE_INVALID when violated.
   */
  private validateMilestoneDates(
    milestones: Array<{ startsAt?: string; endsAt?: string; title: string }>,
  ): void {
    for (const m of milestones) {
      if (m.startsAt && m.endsAt) {
        if (new Date(m.startsAt) >= new Date(m.endsAt)) {
          throw new ValidationDomainException(
            `Milestone "${m.title}": startsAt must be before endsAt.`,
            ErrorCode.VAL_AWARD_MILESTONE_DATE_INVALID,
          );
        }
      }
    }
  }

  /**
   * Moves a linked budget reservation and the award together, in one transaction.
   *
   * An award transition and its budget movement are the same fact viewed from two
   * collections: accepting an award *is* the reservation becoming confirmed, and
   * the money only moves to `disbursedAmount` because the applicant said yes.
   * Writing them separately left a window in which the award was `ACCEPTED`
   * while the ledger still showed the money as merely reserved — so a
   * rescission arriving in that window released from the wrong bucket, or
   * released nothing at all.
   *
   * Routing the whole award transition through one helper is what closes that
   * window: the award CAS, the reservation CAS, the ledger `$inc` and the
   * outbox row commit or abort as a unit.
   *
   * The award move is itself a compare-and-set on `expectFrom`, which is what
   * makes the automatic expiry path exactly-once across overlapping cron runs —
   * the loser matches no document and its whole transaction, including the
   * ledger movement, is a no-op.
   *
   * @param expectFrom Status the award must currently hold.
   * @throws ResourceConflictException when another caller got there first.
   */
  private async transitionAward(
    label: string,
    params: {
      organizationId: string;
      awardId: Types.ObjectId;
      toStatus: AwardStatus;
      expectFrom: AwardStatus;
      actorId: string;
      /** Extra fields to `$set` alongside the status. */
      set?: Record<string, unknown>;
      /** Appended to `statusHistory`; `reason` is optional. */
      historyReason?: string;
      /** Reservation movement to make alongside, or null for none. */
      reservation: {
        from: ReservationStatus;
        to: ReservationStatus;
        reason: string;
      } | null;
    },
  ): Promise<ScholarshipAwardDocument> {
    const {
      organizationId,
      awardId,
      toStatus,
      expectFrom,
      actorId,
      set = {},
      historyReason,
      reservation,
    } = params;

    return this.transactions.run(
      label,
      async (session: ClientSession | null) => {
        const updated = await withSession(
          this.awardModel.findOneAndUpdate(
            { _id: awardId, organizationId, status: expectFrom },
            {
              $set: { ...set, status: toStatus },
              $push: {
                statusHistory: {
                  status: toStatus,
                  changedBy: actorId,
                  changedAt: new Date(),
                  reason: historyReason,
                },
              },
            },
            { new: true },
          ),
          session,
        ).exec();

        if (!updated) {
          throw new ResourceConflictException(
            `Award ${awardId.toString()} is no longer ${expectFrom}; it was ` +
              `transitioned concurrently.`,
            ErrorCode.BIZ_AWARD_INVALID_STATE,
          );
        }

        // `reservation` non-null with no `reservationId` is an award whose budget
        // cannot be settled. Moving the award anyway would strand the funds
        // reserved for it, so refuse.
        if (reservation && !updated.reservationId) {
          throw new ResourceConflictException(
            `Award ${awardId.toString()} has no budget reservation to settle ` +
              `into ${reservation.to}; it was not transitioned.`,
            ErrorCode.RES_BUDGET_RESERVATION_NOT_FOUND,
          );
        }
        if (reservation && updated.reservationId) {
          await this.settleReservationInSession(
            updated.reservationId,
            organizationId,
            reservation,
            actorId,
            session,
          );
        }

        await this.outbox.stage(
          {
            organizationId,
            aggregateType: OutboxAggregateType.SCHOLARSHIP_AWARD,
            aggregateId: updated._id.toString(),
            eventName: DomainEvents.SCHOLARSHIP_AWARD_STATUS_CHANGED,
            payload: {
              awardId: updated._id.toString(),
              organizationId,
              programId: updated.programId.toString(),
              applicationId: updated.applicationId.toString(),
              status: toStatus,
              amount: updated.amount,
              currency: updated.currency,
            },
          },
          session,
        );

        return updated;
      },
    );
  }

  /**
   * Moves the award's reservation and adjusts the ledger, inside the caller's
   * transaction.
   *
   * @returns the transitioned reservation, or `null` when it was already in a
   *   different state — which is the idempotent path, not a fault.
   */
  /**
   * Moves the award's linked reservation, and the budget ledger with it.
   *
   * Every exit here is either a full transition or a thrown error. A missing row
   * or a lost compare-and-set throws rather than returning null, because the
   * caller has already moved the award: returning would let the award commit
   * while its reservation and the ledger stayed put, which is precisely the
   * award/budget divergence #1255 exists to make impossible. Throwing aborts the
   * whole transaction instead.
   */
  private async settleReservationInSession(
    reservationId: Types.ObjectId,
    organizationId: string,
    reservation: {
      from: ReservationStatus;
      to: ReservationStatus;
      reason: string;
    },
    actorId: string,
    session: ClientSession | null,
  ): Promise<BudgetReservationDocument> {
    const updated = await withSession(
      this.reservationModel.findOneAndUpdate(
        { _id: reservationId, organizationId, status: reservation.from },
        {
          $set: {
            status: reservation.to,
            resolvedAt: new Date(),
            resolvedBy: actorId,
            reason: reservation.reason,
          },
        },
        { new: true },
      ),
      session,
    ).exec();

    if (!updated) {
      throw new ResourceConflictException(
        `Reservation ${reservationId.toString()} is no longer ` +
          `${reservation.from}; it was settled concurrently. The award was not ` +
          `transitioned.`,
        ErrorCode.BIZ_RESERVATION_INVALID_STATE,
      );
    }

    await withSession(
      this.ledgerModel.updateOne(
        { programId: updated.programId, organizationId },
        { $inc: ledgerDelta(reservation.from, reservation.to, updated.amount) },
      ),
      session,
    ).exec();

    // The reservation moved, so its own subscribers need to hear about it — not
    // only the award's. A listener reconciling budget from reservations would
    // otherwise see the ledger move with no event explaining it.
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
          applicationId: updated.applicationId?.toString() ?? null,
          status: reservation.to,
          amount: updated.amount,
          currency: updated.currency,
        },
      },
      session,
    );

    return updated;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  /**
   * Creates a new scholarship award record for an approved application.
   *
   * Steps:
   *   1. Resolve and verify the application (tenant-scoped lookup).
   *   2. Check for a duplicate active award on this application (409).
   *   3. Check for a conflicting active award held by this applicant in the
   *      same organization (422 BIZ_AWARD_CONFLICT).
   *   4. Validate `acceptanceDeadline` is in the future.
   *   5. Validate milestone date ordering.
   *   6. When `reservationId` is supplied, verify the reservation exists and
   *      belongs to this organization and program.
   *   7. Persist the award document and stage its outbox row in one transaction.
   *
   * The transaction is what makes the duplicate-award check sound: the read at
   * step 2 and the insert at step 7 must observe the same snapshot, or two
   * concurrent committee actions can both pass the check and both create an
   * award. `uniq_active_award_per_application` is the backstop when even that
   * is not enough — when it fires, the transaction has already rolled back.
   *
   * @param programId  Path parameter — the owning scholarship program.
   * @param applicationId  Path parameter — the winning application.
   * @param dto  Request body.
   * @param actorId  JWT `sub` of the staff member creating the award.
   */
  async createAward(
    programId: string,
    applicationId: string,
    dto: CreateAwardDto,
    actorId: string,
  ): Promise<AwardResult> {
    const { organizationId } = dto;
    const programObjectId = new Types.ObjectId(programId);

    const award = await this.transactions.run(
      'scholarships.createAward',
      async (session) => {
        // 1. Verify the application exists and belongs to this organization.
        const application = await withSession(
          this.applicationModel.findOne({ _id: applicationId, organizationId }),
          session,
        ).exec();
        if (!application) {
          throw new ResourceNotFoundException(
            `Application ${applicationId} not found in organization ${organizationId}.`,
            ErrorCode.RES_SCHOLARSHIP_APPLICATION_NOT_FOUND,
          );
        }

        // 2. Duplicate award check: only one non-terminal award per application.
        const existingAward = await withSession(
          this.awardModel.findOne({
            applicationId: new Types.ObjectId(applicationId),
            organizationId,
            status: { $in: Array.from(ACTIVE_AWARD_STATUSES) },
          }),
          session,
        ).exec();
        if (existingAward) {
          throw new ResourceConflictException(
            `An active award (${existingAward.status}) already exists for application ${applicationId}.`,
            ErrorCode.BIZ_AWARD_ALREADY_EXISTS,
          );
        }

        // 3. Conflict prevention: applicant must not hold another active award in this org.
        const conflictingAward = await withSession(
          this.awardModel.findOne({
            applicantId: application.applicantId,
            organizationId,
            status: { $in: Array.from(ACTIVE_AWARD_STATUSES) },
            // Exclude the same application (edge case: re-creation after terminal state).
            applicationId: { $ne: new Types.ObjectId(applicationId) },
          }),
          session,
        ).exec();
        if (conflictingAward) {
          throw new BusinessRuleException(
            `Applicant ${application.applicantId} already holds an active award ` +
              `(${conflictingAward.status}) in organization ${organizationId}. ` +
              `An applicant cannot hold conflicting awards simultaneously.`,
            ErrorCode.BIZ_AWARD_CONFLICT,
          );
        }

        // 4. Acceptance deadline must be in the future.
        const acceptanceDeadline = new Date(dto.acceptanceDeadline);
        if (acceptanceDeadline <= new Date()) {
          throw new ValidationDomainException(
            'acceptanceDeadline must be a future date.',
            ErrorCode.VAL_AWARD_ACCEPTANCE_DEADLINE_PAST,
          );
        }

        // 5. Validate milestone date ordering.
        if (dto.milestones?.length) {
          this.validateMilestoneDates(dto.milestones);
        }

        // 6. Verify the linked reservation (when supplied).
        if (dto.reservationId) {
          const reservation = await withSession(
            this.reservationModel.findOne({
              _id: new Types.ObjectId(dto.reservationId),
              organizationId,
              programId: programObjectId,
            }),
            session,
          ).exec();
          if (!reservation) {
            throw new ResourceNotFoundException(
              `Budget reservation ${dto.reservationId} not found for program ${programId}.`,
              ErrorCode.RES_BUDGET_RESERVATION_NOT_FOUND,
            );
          }
        }

        // 7. Persist.
        const now = new Date();
        let created: ScholarshipAwardDocument;
        try {
          [created] = await this.awardModel.create(
            [
              {
                organizationId,
                applicationId: new Types.ObjectId(applicationId),
                programId: programObjectId,
                applicantId: application.applicantId,
                reservationId: dto.reservationId
                  ? new Types.ObjectId(dto.reservationId)
                  : null,
                amount: dto.amount,
                currency: dto.currency.toUpperCase(),
                termsText: dto.termsText,
                milestones: (dto.milestones ?? []).map((m) => ({
                  _id: new Types.ObjectId(),
                  title: m.title,
                  description: m.description,
                  amount: m.amount,
                  startsAt: m.startsAt ? new Date(m.startsAt) : null,
                  endsAt: m.endsAt ? new Date(m.endsAt) : null,
                })),
                acceptanceDeadline,
                status: AwardStatus.PENDING_ACCEPTANCE,
                respondedAt: null,
                applicantNote: null,
                rescindedAt: null,
                rescindedBy: null,
                rescissionReason: null,
                createdBy: actorId,
                statusHistory: [
                  {
                    status: AwardStatus.PENDING_ACCEPTANCE,
                    changedBy: actorId,
                    changedAt: now,
                  },
                ],
              },
            ],
            session ? { session } : {},
          );
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new ResourceConflictException(
              `An active award for application ${applicationId} was created ` +
                `concurrently; only one active award per application is permitted.`,
              ErrorCode.BIZ_AWARD_ALREADY_EXISTS,
            );
          }
          throw error;
        }

        await this.outbox.stage(
          {
            organizationId,
            aggregateType: OutboxAggregateType.SCHOLARSHIP_AWARD,
            aggregateId: created._id.toString(),
            eventName: DomainEvents.SCHOLARSHIP_AWARD_STATUS_CHANGED,
            payload: {
              awardId: created._id.toString(),
              organizationId,
              programId,
              applicationId,
              status: AwardStatus.PENDING_ACCEPTANCE,
              amount: dto.amount,
              currency: dto.currency.toUpperCase(),
            },
          },
          session,
        );

        return created;
      },
    );

    this.logger.log(
      `Award created: application=${applicationId}, amount=${dto.amount} ` +
        `${dto.currency}, deadline=${dto.acceptanceDeadline}, by=${actorId}`,
    );

    return toAwardResult(award);
  }

  // ── Accept ─────────────────────────────────────────────────────────────────

  /**
   * The applicant formally accepts the scholarship offer.
   *
   * Verifies:
   *   - The caller is the award's own applicant.
   *   - The award is in PENDING_ACCEPTANCE state.
   *   - The acceptance deadline has not passed.
   *
   * Side-effects:
   *   - Transitions award PENDING_ACCEPTANCE → ACCEPTED.
   *   - Confirms the linked BudgetReservation (PENDING → CONFIRMED) if present.
   *
   * @param awardId       Path parameter.
   * @param callerId      JWT `sub` of the authenticated user (must equal applicantId).
   * @param dto           Optional acceptance note.
   */
  async acceptAward(
    awardId: string,
    callerId: string,
    dto: AcceptAwardDto,
  ): Promise<AwardResult> {
    const award = await this.awardModel
      .findOne({ _id: new Types.ObjectId(awardId) })
      .exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `Award ${awardId} not found.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    // Authenticated acceptance: caller must be the applicant.
    if (award.applicantId !== callerId) {
      throw new ForbiddenDomainException(
        'Only the applicant may accept this award.',
        ErrorCode.BIZ_AWARD_ACCEPTANCE_FORBIDDEN,
      );
    }

    // Deadline check before state check (more actionable error message).
    if (new Date() > award.acceptanceDeadline) {
      throw new BusinessRuleException(
        `The acceptance deadline (${award.acceptanceDeadline.toISOString()}) has passed. ` +
          `The offer has expired.`,
        ErrorCode.BIZ_AWARD_OFFER_EXPIRED,
      );
    }

    this.assertTransitionAllowed(award.status, AwardStatus.ACCEPTED);

    // The award move and the reservation move are one transaction, so an
    // accepted award and a confirmed reservation cannot disagree.
    const accepted = await this.transitionAward('scholarships.acceptAward', {
      organizationId: award.organizationId,
      awardId: award._id,
      toStatus: AwardStatus.ACCEPTED,
      expectFrom: AwardStatus.PENDING_ACCEPTANCE,
      actorId: callerId,
      set: {
        respondedAt: new Date(),
        applicantNote: dto.note ?? null,
      },
      reservation: {
        from: ReservationStatus.PENDING,
        to: ReservationStatus.CONFIRMED,
        reason: dto.note ?? 'Award accepted by applicant',
      },
    });

    this.logger.log(`Award ${awardId} accepted by applicant ${callerId}`);
    return toAwardResult(accepted);
  }

  // ── Decline ────────────────────────────────────────────────────────────────

  /**
   * The applicant formally declines the scholarship offer.
   *
   * Verifies:
   *   - The caller is the award's own applicant.
   *   - The award is in PENDING_ACCEPTANCE state.
   *
   * Side-effects:
   *   - Transitions award PENDING_ACCEPTANCE → DECLINED.
   *   - Cancels the linked BudgetReservation (PENDING → CANCELLED) if present.
   *
   * @param awardId    Path parameter.
   * @param callerId   JWT `sub` of the authenticated user (must equal applicantId).
   * @param dto        Optional decline reason.
   */
  async declineAward(
    awardId: string,
    callerId: string,
    dto: DeclineAwardDto,
  ): Promise<AwardResult> {
    const award = await this.awardModel
      .findOne({ _id: new Types.ObjectId(awardId) })
      .exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `Award ${awardId} not found.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    if (award.applicantId !== callerId) {
      throw new ForbiddenDomainException(
        'Only the applicant may decline this award.',
        ErrorCode.BIZ_AWARD_ACCEPTANCE_FORBIDDEN,
      );
    }

    this.assertTransitionAllowed(award.status, AwardStatus.DECLINED);

    const declined = await this.transitionAward('scholarships.declineAward', {
      organizationId: award.organizationId,
      awardId: award._id,
      toStatus: AwardStatus.DECLINED,
      expectFrom: AwardStatus.PENDING_ACCEPTANCE,
      actorId: callerId,
      set: {
        respondedAt: new Date(),
        applicantNote: dto.reason ?? null,
      },
      historyReason: dto.reason,
      reservation: {
        from: ReservationStatus.PENDING,
        to: ReservationStatus.CANCELLED,
        reason: `Award declined by applicant: ${dto.reason ?? 'no reason given'}`,
      },
    });

    this.logger.log(`Award ${awardId} declined by applicant ${callerId}`);
    return toAwardResult(declined);
  }

  // ── Rescind ────────────────────────────────────────────────────────────────

  /**
   * An organization OWNER rescinds an ACCEPTED award.
   *
   * Verifies:
   *   - The award belongs to the given organization.
   *   - The award is in ACCEPTED state.
   *
   * Side-effects:
   *   - Transitions award ACCEPTED → RESCINDED.
   *   - Releases the linked BudgetReservation (CONFIRMED → RELEASED) if present,
   *     restoring budget capacity.
   *
   * @param organizationId  Tenant scope.
   * @param awardId         Path parameter.
   * @param actorId         JWT `sub` of the OWNER rescinding.
   * @param dto             Mandatory rescission reason.
   */
  async rescindAward(
    organizationId: string,
    awardId: string,
    actorId: string,
    dto: RescindAwardDto,
  ): Promise<AwardResult> {
    const award = await this.awardModel
      .findOne({ _id: new Types.ObjectId(awardId), organizationId })
      .exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `Award ${awardId} not found in organization ${organizationId}.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    this.assertTransitionAllowed(award.status, AwardStatus.RESCINDED);

    const rescinded = await this.transitionAward('scholarships.rescindAward', {
      organizationId,
      awardId: award._id,
      toStatus: AwardStatus.RESCINDED,
      expectFrom: AwardStatus.ACCEPTED,
      actorId,
      set: {
        rescindedAt: new Date(),
        rescindedBy: actorId,
        rescissionReason: dto.reason,
      },
      historyReason: dto.reason,
      reservation: {
        from: ReservationStatus.CONFIRMED,
        to: ReservationStatus.RELEASED,
        reason: `Award rescinded: ${dto.reason}`,
      },
    });

    this.logger.log(`Award ${awardId} rescinded by ${actorId}: ${dto.reason}`);
    return toAwardResult(rescinded);
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Returns a single award by id.
   *
   * Staff endpoints supply `organizationId` to enforce tenant scoping.
   * The applicant-facing endpoint passes `null` for organizationId and instead
   * performs the applicant ownership check at the service layer via `callerId`.
   *
   * @param awardId         Path parameter.
   * @param organizationId  Tenant scope (null only for applicant self-reads).
   * @param callerId        When set, asserts award.applicantId === callerId.
   */
  async getAward(
    awardId: string,
    organizationId: string | null,
    callerId?: string,
  ): Promise<AwardResult> {
    const filter: Record<string, unknown> = {
      _id: new Types.ObjectId(awardId),
    };
    if (organizationId) {
      filter['organizationId'] = organizationId;
    }

    const award = await this.awardModel.findOne(filter).exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `Award ${awardId} not found.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    // Applicant self-read ownership check.
    if (callerId && award.applicantId !== callerId) {
      throw new ForbiddenDomainException(
        'You do not have access to this award.',
        ErrorCode.BIZ_AWARD_ACCEPTANCE_FORBIDDEN,
      );
    }

    return toAwardResult(award);
  }

  /**
   * Returns the award associated with a specific application id.
   * Used by the staff endpoint `GET …/applications/:applicationId/award`.
   *
   * @param applicationId   The application whose award to retrieve.
   * @param organizationId  Tenant scope.
   */
  async getAwardByApplicationId(
    applicationId: string,
    organizationId: string,
  ): Promise<AwardResult> {
    const award = await this.awardModel
      .findOne({
        applicationId: new Types.ObjectId(applicationId),
        organizationId,
      })
      .exec();

    if (!award) {
      throw new ResourceNotFoundException(
        `No award found for application ${applicationId}.`,
        ErrorCode.RES_SCHOLARSHIP_AWARD_NOT_FOUND,
      );
    }

    return toAwardResult(award);
  }

  /**
   * Lists all awards for a scholarship program with optional status filter.
   * Returns a paginated result sorted by `createdAt` descending.
   *
   * @param programId  Path parameter.
   * @param query      Pagination + optional status filter + organizationId.
   */
  async listAwards(
    programId: string,
    query: ListAwardsQueryDto,
  ): Promise<{
    data: AwardResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const filter: Record<string, unknown> = {
      organizationId: query.organizationId,
      programId: new Types.ObjectId(programId),
    };
    if (query.status !== undefined) {
      filter['status'] = query.status;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      this.awardModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.awardModel.countDocuments(filter).exec(),
    ]);

    return {
      data: docs.map(toAwardResult),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Scheduled expiry jobs ─────────────────────────────────────────────────

  /**
   * Primary expiry sweep — runs every hour.
   *
   * Finds all awards in PENDING_ACCEPTANCE with `acceptanceDeadline ≤ now`,
   * transitions each to OFFER_EXPIRED, and releases any linked budget
   * reservation (PENDING → EXPIRED).
   *
   * The job is idempotent: each award is gated by a conditional update
   * (`status = PENDING_ACCEPTANCE`), so concurrent runs skip already-processed
   * documents.
   *
   * Operational note:
   *   In a multi-instance deployment use a distributed lock (e.g. Redis SET NX)
   *   to prevent duplicate processing.  The conditional update means double
   *   processing is harmless but wastes resources.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'scholarship-award-expiry' })
  async expireAwards(): Promise<number> {
    return this.runExpiryJob('hourly-expiry');
  }

  /**
   * Reconciliation sweep — runs every 6 hours.
   *
   * Safety net for missed hourly runs (e.g. deployment gaps).
   */
  @Cron(CronExpression.EVERY_6_HOURS, {
    name: 'scholarship-award-expiry-reconciliation',
  })
  async reconcileExpiredAwards(): Promise<number> {
    return this.runExpiryJob('6h-reconciliation');
  }

  /**
   * Core expiry logic shared by both cron jobs.
   *
   * 1. Bulk-find all PENDING_ACCEPTANCE awards past their deadline.
   * 2. Re-read the candidate and transition it through `transitionAward`, which
   *    re-checks the status inside the transaction (exactly-once), moves the
   *    linked reservation, adjusts the ledger and stages the outbox row.
   * 3. Log the count of transitioned awards.
   *
   * The per-award transaction matters here more than elsewhere: this job is the
   * one place where an award and its reservation are mutated without a human in
   * the loop, so a crash between the two writes would have left a silently
   * expired award still holding budget, with nothing in the logs saying so.
   */
  private async runExpiryJob(jobLabel: string): Promise<number> {
    const now = new Date();
    let expired = 0;

    // Fetch candidates — status + partial index makes this efficient.
    const candidates = await this.awardModel
      .find({
        status: AwardStatus.PENDING_ACCEPTANCE,
        acceptanceDeadline: { $lte: now },
      })
      .select('_id organizationId')
      .exec();

    for (const candidate of candidates) {
      // Re-read so the status guard, the reservation CAS and the ledger move
      // are all evaluated inside one transaction snapshot.
      const award = await this.awardModel.findById(candidate._id).exec();
      if (!award || award.status !== AwardStatus.PENDING_ACCEPTANCE) {
        continue; // Already transitioned by a concurrent run.
      }

      try {
        await this.transitionAward(`scholarships.expireAward:${jobLabel}`, {
          organizationId: candidate.organizationId,
          awardId: candidate._id,
          toStatus: AwardStatus.OFFER_EXPIRED,
          expectFrom: AwardStatus.PENDING_ACCEPTANCE,
          actorId: 'system',
          historyReason: 'Acceptance deadline elapsed.',
          reservation: {
            from: ReservationStatus.PENDING,
            to: ReservationStatus.EXPIRED,
            reason: 'Offer acceptance deadline elapsed — award expired.',
          },
        });
        expired++;
      } catch (err) {
        // One award's conflict must not abandon the rest of the batch. A lost
        // race is the expected outcome when two instances run this sweep, and
        // `transitionAward` throws on it by design: a compare-and-set that lost
        // is a fact about the award, not a fault in the job. The transaction has
        // already rolled back, so this award is simply not ours to expire.
        //
        // A genuine failure (ledger write, outbox stage) is logged loudly and
        // left for the next sweep — the award stays PENDING_ACCEPTANCE, so it is
        // picked up again rather than silently skipped.
        this.logger.warn(
          `[${jobLabel}] Could not expire award ${candidate._id.toString()}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (expired > 0 || candidates.length > 0) {
      this.logger.log(
        `[${jobLabel}] Award expiry job: ${expired}/${candidates.length} award(s) expired.`,
      );
    }

    return expired;
  }
}
