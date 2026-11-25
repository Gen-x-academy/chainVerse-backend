import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isDuplicateKeyError } from '../mentorship.errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import type {
  CalculateRefundDto,
  DecideRefundExceptionDto,
  RequestRefundExceptionDto,
} from './dto/refund.dto';
import {
  applyBps,
  calculateRefund,
  describeBoundary,
  validatePolicy,
} from './refund-policy';
import {
  RefundCalculation,
  RefundCalculationDocument,
  RefundStatus,
} from './schemas/refund-calculation.schema';

export const MENTORSHIP_REFUND_TRANSFER = 'MENTORSHIP_REFUND_TRANSFER';

/** Moves the refund. Implementations must treat `transferId` as an idempotency key. */
export interface RefundTransferPort {
  transfer(request: {
    transferId: string;
    agreementId: string;
    amountMinor: number;
    currency: string;
  }): Promise<{ providerRef: string }>;
}

export interface RefundActor {
  userId: string;
  roles?: string[];
}

const STAFF_ROLES = ['admin', 'moderator', 'staff'];

/**
 * MENTOR-083 — cancellation and refund calculation.
 *
 * Authorization is deny-by-default: every operation needs a staff role, and a
 * manual exception needs a *second* staff member to approve it. The refund
 * amount is never taken from the caller; it comes from the snapshotted policy,
 * or from an approved exception.
 */
@Injectable()
export class MentorshipRefundService {
  constructor(
    @InjectModel(RefundCalculation.name)
    private readonly refunds: Model<RefundCalculationDocument>,
    private readonly telemetry: MentorshipTelemetry,
    @Optional()
    @Inject(MENTORSHIP_REFUND_TRANSFER)
    private readonly transferPort?: RefundTransferPort,
  ) {}

  private assertStaff(actor: RefundActor): void {
    if (!(actor.roles ?? []).some((r) => STAFF_ROLES.includes(r))) {
      this.telemetry.count('mentorship_refund_denied_total', { reason: 'not_staff' });
      throw new ForbiddenException('MENTOR_ACCESS_DENIED');
    }
  }

  /** Calculate and persist a refund. Idempotent per (agreementId, idempotencyKey). */
  async calculate(dto: CalculateRefundDto, actor: RefundActor) {
    this.assertStaff(actor);

    const existing = await this.refunds
      .findOne({ agreementId: dto.agreementId, idempotencyKey: dto.idempotencyKey })
      .exec();
    if (existing) return this.replay(existing, dto);

    const problems = validatePolicy(dto.policy);
    if (problems.length) {
      throw new BadRequestException({ code: 'REFUND_POLICY_INVALID', problems });
    }

    const result = calculateRefund({
      heldAmountMinor: dto.heldAmountMinor,
      sessionStart: dto.sessionStart,
      cancelledAt: dto.cancelledAt,
      cancelledBy: dto.cancelledBy,
      policy: dto.policy,
    });

    try {
      const created = await this.refunds.create({
        agreementId: dto.agreementId,
        idempotencyKey: dto.idempotencyKey,
        heldAmountMinor: dto.heldAmountMinor,
        currency: dto.currency,
        sessionStart: dto.sessionStart,
        cancelledAt: dto.cancelledAt,
        cancelledBy: dto.cancelledBy,
        policy: dto.policy,
        refundMinor: result.refundMinor,
        retainedMinor: result.retainedMinor,
        refundBps: result.refundBps,
        rule: result.rule,
        status: RefundStatus.CALCULATED,
        exception: null,
        transferId: null,
        transferredAt: null,
      });
      this.telemetry.count('mentorship_refund_calculated_total', { rule: result.rule });
      this.telemetry.event('mentorship_refund_calculated', {
        refundId: String(created._id),
        agreementId: dto.agreementId,
        rule: result.rule,
        refundBps: result.refundBps,
      });
      return {
        ...this.view(created),
        boundary: result.nextBoundaryAt && {
          at: result.nextBoundaryAt,
          local: describeBoundary(result.nextBoundaryAt, dto.policy.timeZone),
        },
      };
    } catch (err) {
      // A concurrent retry won the unique index: return the stored result.
      if (!isDuplicateKeyError(err)) throw err;
      const winner = await this.refunds
        .findOne({ agreementId: dto.agreementId, idempotencyKey: dto.idempotencyKey })
        .exec();
      if (!winner) throw err;
      return this.replay(winner, dto);
    }
  }

  private replay(existing: RefundCalculationDocument, dto: CalculateRefundDto) {
    // The same key with different inputs is a client bug, not a retry.
    if (
      existing.heldAmountMinor !== dto.heldAmountMinor ||
      existing.cancelledAt.getTime() !== new Date(dto.cancelledAt).getTime() ||
      existing.sessionStart.getTime() !== new Date(dto.sessionStart).getTime()
    ) {
      throw new ConflictException('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT');
    }
    return this.view(existing);
  }

  async get(id: string, actor: RefundActor) {
    this.assertStaff(actor);
    return this.view(await this.load(id));
  }

  /** A staff member proposes a refund different from the policy outcome. */
  async requestException(id: string, dto: RequestRefundExceptionDto, actor: RefundActor, now = new Date()) {
    this.assertStaff(actor);
    const updated = await this.refunds
      .findOneAndUpdate(
        { _id: id, status: RefundStatus.CALCULATED },
        {
          $set: {
            status: RefundStatus.EXCEPTION_PENDING,
            exception: {
              requestedBy: actor.userId,
              reason: dto.reason,
              requestedRefundBps: dto.requestedRefundBps,
              requestedAt: now,
              decidedBy: null,
              decidedAt: null,
              decisionNote: null,
            },
          },
        },
        { new: true },
      )
      .exec();
    if (!updated) {
      await this.load(id);
      throw new ConflictException('REFUND_NOT_IN_CALCULATED_STATE');
    }
    this.telemetry.count('mentorship_refund_exception_total', { outcome: 'requested' });
    return this.view(updated);
  }

  /** A different staff member approves or rejects the pending exception. */
  async decideException(id: string, dto: DecideRefundExceptionDto, actor: RefundActor, now = new Date()) {
    this.assertStaff(actor);
    const current = await this.load(id);
    if (current.status !== RefundStatus.EXCEPTION_PENDING || !current.exception) {
      throw new ConflictException('REFUND_NO_PENDING_EXCEPTION');
    }
    if (current.exception.requestedBy === actor.userId) {
      this.telemetry.count('mentorship_refund_denied_total', { reason: 'self_approval' });
      throw new ForbiddenException('REFUND_EXCEPTION_NEEDS_SECOND_APPROVER');
    }
    const status = dto.approve ? RefundStatus.EXCEPTION_APPROVED : RefundStatus.EXCEPTION_REJECTED;
    const updated = await this.refunds
      .findOneAndUpdate(
        { _id: id, status: RefundStatus.EXCEPTION_PENDING },
        {
          $set: {
            status,
            'exception.decidedBy': actor.userId,
            'exception.decidedAt': now,
            'exception.decisionNote': dto.note ?? null,
          },
        },
        { new: true },
      )
      .exec();
    if (!updated) throw new ConflictException('REFUND_NO_PENDING_EXCEPTION');
    this.telemetry.count('mentorship_refund_exception_total', {
      outcome: dto.approve ? 'approved' : 'rejected',
    });
    return this.view(updated);
  }

  /**
   * Pay the refund. The transfer id is derived from the calculation id, so a
   * retry, a double click or a crash between "transfer" and "mark" re-sends the
   * same id and cannot pay twice.
   */
  async executeTransfer(id: string, actor: RefundActor, now = new Date()) {
    this.assertStaff(actor);
    const current = await this.load(id);
    if (current.status === RefundStatus.TRANSFERRED) return this.view(current);
    if (current.status === RefundStatus.EXCEPTION_PENDING) {
      throw new ConflictException('REFUND_EXCEPTION_PENDING');
    }
    if (!this.transferPort) throw new ConflictException('REFUND_TRANSFER_NOT_CONFIGURED');

    const amountMinor =
      current.status === RefundStatus.EXCEPTION_APPROVED && current.exception
        ? applyBps(current.heldAmountMinor, current.exception.requestedRefundBps)
        : current.refundMinor;
    const transferId = `refund:${String(current._id)}`;

    if (amountMinor > 0) {
      await this.transferPort.transfer({
        transferId,
        agreementId: current.agreementId,
        amountMinor,
        currency: current.currency,
      });
    }
    const updated = await this.refunds
      .findOneAndUpdate(
        { _id: id, status: { $ne: RefundStatus.TRANSFERRED } },
        {
          $set: {
            status: RefundStatus.TRANSFERRED,
            transferId,
            transferredAt: now,
            refundMinor: amountMinor,
            retainedMinor: current.heldAmountMinor - amountMinor,
          },
        },
        { new: true },
      )
      .exec();
    this.telemetry.count('mentorship_refund_transfer_total', { outcome: updated ? 'sent' : 'replayed' });
    return this.view(updated ?? (await this.load(id)));
  }

  private async load(id: string): Promise<RefundCalculationDocument> {
    const doc = await this.refunds.findById(id).exec();
    if (!doc) throw new NotFoundException('REFUND_NOT_FOUND');
    return doc;
  }

  private view(doc: RefundCalculationDocument) {
    return {
      id: String(doc._id),
      agreementId: doc.agreementId,
      status: doc.status,
      currency: doc.currency,
      heldAmountMinor: doc.heldAmountMinor,
      refundMinor: doc.refundMinor,
      retainedMinor: doc.retainedMinor,
      refundBps: doc.refundBps,
      rule: doc.rule,
      policyVersion: doc.policy.version,
      exception: doc.exception,
      transferId: doc.transferId,
      transferredAt: doc.transferredAt,
    };
  }
}
