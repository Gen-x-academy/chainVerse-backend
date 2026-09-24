import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BorrowingSuspension,
  BorrowingSuspensionDocument,
  SuspensionReason,
  SuspensionStatus,
} from '../schemas/borrowing-suspension.schema';
import {
  PatronProfile,
  PatronProfileDocument,
  PatronStatus,
} from '../schemas/patron-profile.schema';
import { Loan, LoanDocument } from '../schemas/loan.schema';
import { LoanStatus } from '../schemas/loan.schema';
import { PatronBalance, PatronBalanceDocument } from '../schemas/patron-balance.schema';
import { CreateSuspensionDto, LiftSuspensionDto } from '../dto/borrowing-suspension.dto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  SUSPENSION_OVERDUE_COUNT_THRESHOLD,
  SUSPENSION_OVERDUE_AGE_DAYS_THRESHOLD,
  SUSPENSION_UNPAID_BALANCE_THRESHOLD,
  DEFAULT_CURRENCY,
} from '../e-library.constants';

export interface SuspensionCheckResult {
  suspended: boolean;
  reason?: SuspensionReason;
  message?: string;
  thresholdSnapshot?: {
    thresholdName: string;
    thresholdValue: number;
    measuredValue: number;
  };
}

/**
 * Manages threshold-based borrowing suspension.
 *
 * The service:
 *  - Evaluates three policy dimensions on demand: overdue count, overdue age,
 *    and unpaid balance.
 *  - Suspends borrowing (sets PatronProfile.status = SUSPENDED) when any
 *    threshold is crossed.
 *  - Lifts suspension automatically when all thresholds are back below their
 *    configured limits (e.g. after a return or a payment).
 *  - Allows staff to grant exceptions that lift an active suspension with a
 *    note.
 *  - Only blocks new checkouts/holds; returns and account access are always
 *    permitted regardless of suspension status.
 */
@Injectable()
export class BorrowingSuspensionService {
  private readonly logger = new Logger(BorrowingSuspensionService.name);

  constructor(
    @InjectModel(BorrowingSuspension.name)
    private readonly suspensionModel: Model<BorrowingSuspensionDocument>,
    @InjectModel(PatronProfile.name)
    private readonly patronModel: Model<PatronProfileDocument>,
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    @InjectModel(PatronBalance.name)
    private readonly balanceModel: Model<PatronBalanceDocument>,
  ) {}

  /**
   * Check whether a patron currently meets the criteria for suspension.
   * Does NOT modify state — purely read.
   */
  async checkThresholds(patronId: string): Promise<SuspensionCheckResult> {
    const now = new Date();

    // Overdue count
    const overdueCount = await this.loanModel.countDocuments({
      patronId,
      status: LoanStatus.OVERDUE,
    });

    if (overdueCount >= SUSPENSION_OVERDUE_COUNT_THRESHOLD) {
      return {
        suspended: true,
        reason: SuspensionReason.OVERDUE_COUNT,
        message:
          `Your borrowing access has been suspended because you have ${overdueCount} overdue item(s). ` +
          `Return overdue items to restore access. ` +
          `Threshold: ${SUSPENSION_OVERDUE_COUNT_THRESHOLD} overdue items.`,
        thresholdSnapshot: {
          thresholdName: 'overdue_count',
          thresholdValue: SUSPENSION_OVERDUE_COUNT_THRESHOLD,
          measuredValue: overdueCount,
        },
      };
    }

    // Overdue age (oldest overdue loan)
    if (overdueCount > 0) {
      const oldestOverdue = await this.loanModel
        .findOne({ patronId, status: LoanStatus.OVERDUE })
        .sort({ dueDate: 1 })
        .select('dueDate')
        .lean()
        .exec();

      if (oldestOverdue) {
        const ageDays = Math.floor(
          (now.getTime() - oldestOverdue.dueDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (ageDays >= SUSPENSION_OVERDUE_AGE_DAYS_THRESHOLD) {
          return {
            suspended: true,
            reason: SuspensionReason.OVERDUE_AGE,
            message:
              `Your borrowing access has been suspended because you have an item ${ageDays} day(s) overdue. ` +
              `Return overdue items to restore access. ` +
              `Threshold: ${SUSPENSION_OVERDUE_AGE_DAYS_THRESHOLD} days.`,
            thresholdSnapshot: {
              thresholdName: 'overdue_age_days',
              thresholdValue: SUSPENSION_OVERDUE_AGE_DAYS_THRESHOLD,
              measuredValue: ageDays,
            },
          };
        }
      }
    }

    // Unpaid balance
    const balance = await this.balanceModel
      .findOne({ patronId, currency: DEFAULT_CURRENCY })
      .lean()
      .exec();

    const unpaidBalance = balance?.balanceMinorUnits ?? 0;
    if (unpaidBalance >= SUSPENSION_UNPAID_BALANCE_THRESHOLD) {
      return {
        suspended: true,
        reason: SuspensionReason.UNPAID_BALANCE,
        message:
          `Your borrowing access has been suspended due to an outstanding balance of ` +
          `${unpaidBalance} ${DEFAULT_CURRENCY} minor units. ` +
          `Pay down your balance to restore access. ` +
          `Threshold: ${SUSPENSION_UNPAID_BALANCE_THRESHOLD} minor units.`,
        thresholdSnapshot: {
          thresholdName: 'unpaid_balance_minor_units',
          thresholdValue: SUSPENSION_UNPAID_BALANCE_THRESHOLD,
          measuredValue: unpaidBalance,
        },
      };
    }

    return { suspended: false };
  }

  /**
   * Evaluate thresholds and apply or lift suspension accordingly.
   *
   * Called after any event that could change the patron's status:
   * a return, a payment, a fine posting, or a reconciliation run.
   *
   * Returns the current suspension state after evaluation.
   */
  async reconcile(
    patronId: string,
    triggeredBy = 'system:reconciliation',
  ): Promise<{
    wasSuspended: boolean;
    nowSuspended: boolean;
    suspension?: BorrowingSuspensionDocument;
  }> {
    const patron = await this.requirePatron(patronId);
    const wasSuspended = patron.status === PatronStatus.SUSPENDED;

    const check = await this.checkThresholds(patronId);

    if (check.suspended && !wasSuspended) {
      // Apply new suspension
      const suspension = await this.applySuspension(
        patronId,
        check.reason!,
        check.message!,
        check.thresholdSnapshot!,
        triggeredBy,
      );
      return { wasSuspended: false, nowSuspended: true, suspension };
    }

    if (!check.suspended && wasSuspended) {
      // Auto-lift: all thresholds cleared
      await this.autoLiftSuspension(patronId, triggeredBy);
      return { wasSuspended: true, nowSuspended: false };
    }

    // No change needed
    const activeSuspension = wasSuspended
      ? await this.suspensionModel
          .findOne({ patronId, status: SuspensionStatus.ACTIVE })
          .sort({ createdAt: -1 })
          .exec() ?? undefined
      : undefined;

    return {
      wasSuspended,
      nowSuspended: wasSuspended,
      suspension: activeSuspension,
    };
  }

  /**
   * Manually suspend a patron's borrowing access (staff-initiated).
   */
  async suspend(
    dto: CreateSuspensionDto,
    staffId: string,
  ): Promise<BorrowingSuspensionDocument> {
    const patron = await this.requirePatron(dto.patronId);

    if (patron.status === PatronStatus.SUSPENDED) {
      throw new BusinessRuleException(
        `Patron ${dto.patronId} is already suspended`,
        ErrorCode.BIZ_PATRON_ALREADY_SUSPENDED,
      );
    }

    return this.applySuspension(
      dto.patronId,
      SuspensionReason.MANUAL,
      dto.message,
      { thresholdName: 'manual', thresholdValue: 0, measuredValue: 0 },
      staffId,
      dto.suspendedUntil ? new Date(dto.suspendedUntil) : null,
    );
  }

  /**
   * Lift an active suspension as a staff exception/override.
   *
   * Does not prevent re-suspension if thresholds are still exceeded; the
   * reconciliation pass will re-evaluate after any subsequent event.
   */
  async liftException(
    suspensionId: string,
    dto: LiftSuspensionDto,
    staffId: string,
  ): Promise<BorrowingSuspensionDocument> {
    const suspension = await this.suspensionModel
      .findById(suspensionId)
      .exec();

    if (!suspension) {
      throw new ResourceNotFoundException(
        `Suspension ${suspensionId} not found`,
        ErrorCode.RES_SUSPENSION_NOT_FOUND,
      );
    }

    if (suspension.status !== SuspensionStatus.ACTIVE) {
      throw new BusinessRuleException(
        `Suspension ${suspensionId} is not active (current status: ${suspension.status})`,
        ErrorCode.BIZ_SUSPENSION_NOT_ACTIVE,
      );
    }

    // Maker-checker: the staff member who suspended cannot also lift.
    if (suspension.createdBy === staffId) {
      throw new ForbiddenDomainException(
        `Staff member ${staffId} cannot lift a suspension they created`,
        ErrorCode.BIZ_SUSPENSION_SELF_LIFT,
      );
    }

    const now = new Date();

    await this.suspensionModel.findByIdAndUpdate(suspensionId, {
      $set: {
        status: SuspensionStatus.LIFTED_EXCEPTION,
        liftedBy: staffId,
        liftNote: dto.liftNote,
        liftedAt: now,
      },
    });

    // Restore patron status
    await this.patronModel.findOneAndUpdate(
      { platformUserId: suspension.patronId },
      {
        $set: {
          status: PatronStatus.ACTIVE,
          statusChangedAt: now,
          statusChangedBy: staffId,
          statusReason: `Exception lift: ${dto.liftNote}`,
        },
      },
    );

    return (await this.suspensionModel.findById(suspensionId).exec())!;
  }

  /** Get the currently active suspension for a patron, or null. */
  async getActiveSuspension(
    patronId: string,
  ): Promise<BorrowingSuspensionDocument | null> {
    return this.suspensionModel
      .findOne({ patronId, status: SuspensionStatus.ACTIVE })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** List suspension history for a patron. */
  async listForPatron(
    patronId: string,
    activeOnly = false,
    limit = 50,
  ): Promise<BorrowingSuspensionDocument[]> {
    const filter: Record<string, unknown> = { patronId };
    if (activeOnly) filter['status'] = SuspensionStatus.ACTIVE;

    return this.suspensionModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .exec();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async requirePatron(patronId: string): Promise<PatronProfileDocument> {
    const patron = await this.patronModel
      .findOne({ platformUserId: patronId })
      .exec();

    if (!patron) {
      throw new ResourceNotFoundException(
        `Patron profile not found for user ${patronId}`,
        ErrorCode.RES_NOT_FOUND,
      );
    }

    return patron;
  }

  private async applySuspension(
    patronId: string,
    reason: SuspensionReason,
    message: string,
    thresholdSnapshot: {
      thresholdName: string;
      thresholdValue: number;
      measuredValue: number;
    },
    createdBy: string,
    suspendedUntil: Date | null = null,
  ): Promise<BorrowingSuspensionDocument> {
    const now = new Date();

    // Close any lingering ACTIVE suspensions first (idempotent guard)
    await this.suspensionModel.updateMany(
      { patronId, status: SuspensionStatus.ACTIVE },
      {
        $set: {
          status: SuspensionStatus.LIFTED_AUTO,
          liftedBy: 'system:apply-new-suspension',
          liftNote: 'Superseded by new suspension record',
          liftedAt: now,
        },
      },
    );

    const suspension = await this.suspensionModel.create({
      patronId,
      status: SuspensionStatus.ACTIVE,
      reason,
      message,
      thresholdSnapshot,
      autoLift: reason !== SuspensionReason.MANUAL,
      suspendedUntil,
      createdBy,
      liftedBy: null,
      liftNote: null,
      liftedAt: null,
    });

    await this.patronModel.findOneAndUpdate(
      { platformUserId: patronId },
      {
        $set: {
          status: PatronStatus.SUSPENDED,
          statusChangedAt: now,
          statusChangedBy: createdBy,
          statusReason: message,
          statusExpiresAt: suspendedUntil ?? undefined,
        },
      },
    );

    this.logger.log(
      `Patron ${patronId} suspended (reason: ${reason}, by: ${createdBy})`,
    );

    return suspension;
  }

  private async autoLiftSuspension(
    patronId: string,
    liftedBy: string,
  ): Promise<void> {
    const now = new Date();

    await this.suspensionModel.updateMany(
      { patronId, status: SuspensionStatus.ACTIVE, autoLift: true },
      {
        $set: {
          status: SuspensionStatus.LIFTED_AUTO,
          liftedBy,
          liftNote: 'All threshold conditions resolved',
          liftedAt: now,
        },
      },
    );

    await this.patronModel.findOneAndUpdate(
      { platformUserId: patronId },
      {
        $set: {
          status: PatronStatus.ACTIVE,
          statusChangedAt: now,
          statusChangedBy: liftedBy,
          statusReason: 'Suspension lifted automatically: all conditions resolved',
        },
      },
    );

    this.logger.log(
      `Patron ${patronId} suspension auto-lifted (by: ${liftedBy})`,
    );
  }
}
