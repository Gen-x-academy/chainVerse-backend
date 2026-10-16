import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BusinessRuleException,
  ErrorCode,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors';
import { DomainEvents } from '../../events/event-names';
import {
  DepositStatus,
  FundingRoundStatus,
  LedgerSourceType,
  RefundStatus,
  RefundType,
} from '../domain/finance.enums';
import {
  assetKey,
  fundAccount,
  LedgerAccounts,
} from '../domain/ledger-accounts';
import {
  CompleteRefundDto,
  ListRefundsQueryDto,
  RequestRefundDto,
} from '../dto/refund.dto';
import {
  FundingRound,
  FundingRoundDocument,
} from '../schemas/funding-round.schema';
import { Refund, RefundDocument } from '../schemas/refund.schema';
import {
  SponsorDeposit,
  SponsorDepositDocument,
} from '../schemas/sponsor-deposit.schema';
import { FinanceAuditService } from './finance-audit.service';
import { LedgerService } from './ledger.service';

const REFUNDABLE_DEPOSIT_STATUSES = [
  DepositStatus.CREDITED,
  DepositStatus.PARTIALLY_REFUNDED,
];
const OPEN_REFUND_STATUSES = [RefundStatus.REQUESTED, RefundStatus.APPROVED];

/**
 * Refund lifecycle: requested → approved → completed, or → rejected /
 * cancelled. Approval is the only step that moves money on the ledger and
 * is restricted to APPROVE holders other than the requester.
 *
 * - rejected_transfer: the rail bounced the sponsor's transfer. Approval
 *   posts a full reversal of the original credit journal (fees included).
 * - sponsor_refund / overpayment / unused_balance: approval reserves the
 *   amount (fund → refund payable); completion pays out (payable → custody).
 *
 * Nothing is deleted: undoing an approval posts a reversal journal.
 */
@Injectable()
export class RefundService {
  constructor(
    @InjectModel(Refund.name)
    private readonly refundModel: Model<RefundDocument>,
    @InjectModel(SponsorDeposit.name)
    private readonly depositModel: Model<SponsorDepositDocument>,
    @InjectModel(FundingRound.name)
    private readonly roundModel: Model<FundingRoundDocument>,
    private readonly ledger: LedgerService,
    private readonly audit: FinanceAuditService,
    private readonly events: EventEmitter2,
  ) {}

  async request(
    organizationId: string,
    dto: RequestRefundDto,
    actorId: string,
  ) {
    let sponsorId: string;
    let programId: string | null;
    let key: string;

    if (dto.type === RefundType.UNUSED_BALANCE) {
      if (!dto.sponsorId || !dto.asset) {
        throw new ValidationDomainException(
          'unused_balance refunds require sponsorId and asset',
        );
      }
      sponsorId = dto.sponsorId;
      programId = dto.programId ?? null;
      key = assetKey({
        code: dto.asset.code,
        issuer: dto.asset.issuer ?? null,
      });
      const openRound = await this.roundModel.exists({
        organizationId,
        programId,
        assetKey: key,
        status: FundingRoundStatus.OPEN,
      });
      if (openRound) {
        throw new BusinessRuleException(
          'Close the open funding round before refunding its unused balance',
          ErrorCode.BIZ_INVALID_STATE_TRANSITION,
        );
      }
      const available = await this.ledger.getBalance(
        organizationId,
        fundAccount(programId),
        key,
      );
      if (available < dto.amountMinor) {
        throw new BusinessRuleException(
          'Refund exceeds the available fund balance',
          ErrorCode.BIZ_INSUFFICIENT_FUNDS,
        );
      }
    } else {
      if (!dto.depositId) {
        throw new ValidationDomainException(
          `${dto.type} refunds require depositId`,
        );
      }
      const deposit = await this.depositModel.findOne({
        _id: this.oid(dto.depositId),
        organizationId,
      });
      if (!deposit) throw new ResourceNotFoundException('Deposit not found');
      if (!REFUNDABLE_DEPOSIT_STATUSES.includes(deposit.status)) {
        throw new BusinessRuleException(
          `Deposit is ${deposit.status} and cannot be refunded`,
          ErrorCode.BIZ_INVALID_STATE_TRANSITION,
        );
      }
      sponsorId = deposit.sponsorId;
      programId = deposit.programId;
      key = deposit.assetKey;

      const openRefunds = await this.refundModel
        .find({
          organizationId,
          depositId: deposit.id,
          status: { $in: OPEN_REFUND_STATUSES },
        })
        .select('amountMinor type')
        .lean();

      if (dto.type === RefundType.REJECTED_TRANSFER) {
        if (
          dto.amountMinor !== deposit.grossMinor ||
          deposit.refundedMinor !== 0 ||
          openRefunds.length
        ) {
          throw new BusinessRuleException(
            'A rejected transfer reverses the whole deposit: amount must equal the gross amount and no other refunds may exist',
            ErrorCode.BIZ_AMOUNT_EXCEEDS_OUTSTANDING,
          );
        }
      } else {
        const pending = openRefunds.reduce((sum, r) => sum + r.amountMinor, 0);
        const refundable =
          (deposit.netMinor ?? 0) - deposit.refundedMinor - pending;
        if (dto.amountMinor > refundable) {
          throw new BusinessRuleException(
            `Refund exceeds the refundable net amount (${refundable})`,
            ErrorCode.BIZ_AMOUNT_EXCEEDS_OUTSTANDING,
          );
        }
      }
    }

    if (dto.type !== RefundType.REJECTED_TRANSFER && !dto.destination) {
      throw new ValidationDomainException(
        'destination is required for this refund type',
      );
    }

    const refund = await this.refundModel.create({
      organizationId,
      type: dto.type,
      depositId: dto.depositId ?? null,
      sponsorId,
      programId,
      assetKey: key,
      amountMinor: dto.amountMinor,
      reason: dto.reason,
      destination:
        dto.type === RefundType.REJECTED_TRANSFER ? null : dto.destination,
      requestedBy: actorId,
    });
    await this.audit.record({
      organizationId,
      entityType: 'refund',
      entityId: refund.id,
      action: 'requested',
      actorId,
      reason: dto.reason,
      details: {
        type: dto.type,
        depositId: refund.depositId,
        amountMinor: dto.amountMinor,
        assetKey: key,
      },
    });
    return refund;
  }

  async approve(organizationId: string, id: string, actorId: string) {
    const refund = await this.getDoc(organizationId, id);
    if (refund.status !== RefundStatus.REQUESTED) {
      throw new BusinessRuleException(
        `Refund is ${refund.status}`,
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    if (refund.requestedBy === actorId) {
      throw new BusinessRuleException(
        'A refund must be approved by someone other than the requester',
        ErrorCode.BIZ_SEPARATION_OF_DUTIES,
      );
    }

    const claimed = await this.refundModel.findOneAndUpdate(
      { _id: refund._id, organizationId, status: RefundStatus.REQUESTED },
      {
        $set: {
          status: RefundStatus.APPROVED,
          approvedBy: actorId,
          approvedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!claimed) {
      throw new BusinessRuleException(
        'Refund was modified concurrently',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }

    const undo: (() => Promise<unknown>)[] = [
      () =>
        this.refundModel.updateOne(
          { _id: refund._id, status: RefundStatus.APPROVED },
          {
            $set: {
              status: RefundStatus.REQUESTED,
              approvedBy: null,
              approvedAt: null,
            },
          },
        ),
    ];

    try {
      let journalId: string;
      if (refund.type === RefundType.REJECTED_TRANSFER) {
        const deposit = await this.depositModel.findOneAndUpdate(
          {
            _id: this.oid(refund.depositId!),
            organizationId,
            status: DepositStatus.CREDITED,
            refundedMinor: 0,
          },
          { $set: { status: DepositStatus.REVERSED } },
          { new: false },
        );
        if (!deposit?.creditJournalId) {
          throw new BusinessRuleException(
            'Deposit can no longer be reversed (already refunded or reversed)',
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
          );
        }
        undo.push(() =>
          this.depositModel.updateOne(
            { _id: deposit._id, status: DepositStatus.REVERSED },
            { $set: { status: DepositStatus.CREDITED } },
          ),
        );
        // Fails with BIZ_INSUFFICIENT_FUNDS if the credited funds were already moved or spent.
        const reversal = await this.ledger.reverse(
          organizationId,
          deposit.creditJournalId,
          {
            sourceType: LedgerSourceType.DEPOSIT_REVERSAL,
            sourceId: refund.id,
            memo: `Rejected transfer: ${refund.reason}`,
            postedBy: actorId,
          },
        );
        journalId = reversal.id;
        if (deposit.fundingRoundId && deposit.netMinor) {
          await this.roundModel.updateOne(
            { _id: this.oid(deposit.fundingRoundId), organizationId },
            { $inc: { raisedNetMinor: -deposit.netMinor } },
          );
        }
      } else {
        if (refund.depositId) {
          await this.adjustDepositRefunded(
            organizationId,
            refund.depositId,
            refund.amountMinor,
          );
          undo.push(() =>
            this.adjustDepositRefunded(
              organizationId,
              refund.depositId!,
              -refund.amountMinor,
            ),
          );
        }
        const journal = await this.ledger.post({
          organizationId,
          assetKey: refund.assetKey,
          idempotencyKey: `refund-reserve:${refund.id}`,
          sourceType: LedgerSourceType.REFUND_RESERVATION,
          sourceId: refund.id,
          lines: [
            {
              account: fundAccount(refund.programId),
              debitMinor: refund.amountMinor,
            },
            {
              account: LedgerAccounts.REFUND_PAYABLE,
              creditMinor: refund.amountMinor,
            },
          ],
          memo: `Refund reserved (${refund.type}): ${refund.reason}`,
          postedBy: actorId,
        });
        journalId = journal.id;
      }

      claimed.approvalJournalId = journalId;
      await claimed.save();
    } catch (err) {
      for (const step of undo.reverse()) await step();
      throw err;
    }

    await this.audit.record({
      organizationId,
      entityType: 'refund',
      entityId: refund.id,
      action: 'approved',
      actorId,
      details: {
        approvalJournalId: claimed.approvalJournalId,
        type: refund.type,
      },
    });
    return claimed;
  }

  async complete(
    organizationId: string,
    id: string,
    dto: CompleteRefundDto,
    actorId: string,
  ) {
    const refund = await this.getDoc(organizationId, id);
    if (refund.status !== RefundStatus.APPROVED) {
      throw new BusinessRuleException(
        'Only approved refunds can be completed',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }

    const claimed = await this.refundModel.findOneAndUpdate(
      { _id: refund._id, organizationId, status: RefundStatus.APPROVED },
      {
        $set: {
          status: RefundStatus.COMPLETED,
          payoutReference: dto.payoutReference,
          completedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!claimed) {
      throw new BusinessRuleException(
        'Refund was modified concurrently',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }

    if (refund.type !== RefundType.REJECTED_TRANSFER) {
      try {
        const journal = await this.ledger.post({
          organizationId,
          assetKey: refund.assetKey,
          idempotencyKey: `refund-payout:${refund.id}`,
          sourceType: LedgerSourceType.REFUND_PAYOUT,
          sourceId: refund.id,
          lines: [
            {
              account: LedgerAccounts.REFUND_PAYABLE,
              debitMinor: refund.amountMinor,
            },
            {
              account: LedgerAccounts.CUSTODY,
              creditMinor: refund.amountMinor,
            },
          ],
          memo: `Refund payout ${dto.payoutReference}`,
          postedBy: actorId,
        });
        claimed.payoutJournalId = journal.id;
        await claimed.save();
      } catch (err) {
        await this.refundModel.updateOne(
          { _id: refund._id, status: RefundStatus.COMPLETED },
          {
            $set: {
              status: RefundStatus.APPROVED,
              payoutReference: null,
              completedAt: null,
            },
          },
        );
        throw err;
      }
    }

    await this.audit.record({
      organizationId,
      entityType: 'refund',
      entityId: refund.id,
      action: 'completed',
      actorId,
      details: {
        payoutReference: dto.payoutReference,
        payoutJournalId: claimed.payoutJournalId,
      },
    });
    this.events.emit(DomainEvents.SCHOLARSHIP_REFUND_COMPLETED, {
      organizationId,
      refundId: refund.id,
      type: refund.type,
      sponsorId: refund.sponsorId,
      assetKey: refund.assetKey,
      amountMinor: refund.amountMinor,
    });
    return claimed;
  }

  /**
   * Rejects a requested refund, or unwinds an approved (not yet paid) one by
   * posting a reversal of its reservation journal. Rejected-transfer
   * reversals are final — the rail has already returned the money.
   */
  async reject(
    organizationId: string,
    id: string,
    reason: string,
    actorId: string,
  ) {
    const refund = await this.getDoc(organizationId, id);

    if (refund.status === RefundStatus.REQUESTED) {
      const updated = await this.transition(
        refund,
        RefundStatus.REQUESTED,
        RefundStatus.REJECTED,
        reason,
      );
      await this.auditResolution(refund, 'rejected', actorId, reason);
      return updated;
    }

    if (
      refund.status !== RefundStatus.APPROVED ||
      refund.type === RefundType.REJECTED_TRANSFER
    ) {
      throw new BusinessRuleException(
        `Refund is ${refund.status} and cannot be rejected`,
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }

    const updated = await this.transition(
      refund,
      RefundStatus.APPROVED,
      RefundStatus.REJECTED,
      reason,
    );
    try {
      await this.ledger.reverse(organizationId, refund.approvalJournalId!, {
        sourceType: LedgerSourceType.REVERSAL,
        sourceId: refund.id,
        memo: `Refund approval reversed: ${reason}`,
        postedBy: actorId,
      });
    } catch (err) {
      await this.refundModel.updateOne(
        { _id: refund._id, status: RefundStatus.REJECTED },
        { $set: { status: RefundStatus.APPROVED, resolutionReason: null } },
      );
      throw err;
    }
    if (refund.depositId) {
      await this.adjustDepositRefunded(
        organizationId,
        refund.depositId,
        -refund.amountMinor,
      );
    }
    await this.auditResolution(refund, 'approval_reversed', actorId, reason);
    return updated;
  }

  /** Requester (or any operator) withdraws a refund before it is approved. */
  async cancel(
    organizationId: string,
    id: string,
    reason: string,
    actorId: string,
  ) {
    const refund = await this.getDoc(organizationId, id);
    if (refund.status !== RefundStatus.REQUESTED) {
      throw new BusinessRuleException(
        'Only requested refunds can be cancelled',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    const updated = await this.transition(
      refund,
      RefundStatus.REQUESTED,
      RefundStatus.CANCELLED,
      reason,
    );
    await this.auditResolution(refund, 'cancelled', actorId, reason);
    return updated;
  }

  list(organizationId: string, query: ListRefundsQueryDto) {
    const filter: Record<string, unknown> = { organizationId };
    if (query.status) filter.status = query.status;
    if (query.depositId) filter.depositId = query.depositId;
    return this.refundModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(query.skip ?? 0)
      .limit(query.limit ?? 50)
      .lean();
  }

  async get(organizationId: string, id: string) {
    return (await this.getDoc(organizationId, id)).toObject();
  }

  private async getDoc(organizationId: string, id: string) {
    const refund = await this.refundModel.findOne({
      _id: this.oid(id),
      organizationId,
    });
    if (!refund) throw new ResourceNotFoundException('Refund not found');
    return refund;
  }

  private async transition(
    refund: RefundDocument,
    from: RefundStatus,
    to: RefundStatus,
    reason: string,
  ) {
    const updated = await this.refundModel.findOneAndUpdate(
      { _id: refund._id, organizationId: refund.organizationId, status: from },
      { $set: { status: to, resolutionReason: reason } },
      { new: true },
    );
    if (!updated) {
      throw new BusinessRuleException(
        'Refund was modified concurrently',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    return updated;
  }

  /**
   * Atomically adjusts a deposit's refunded amount, never letting it exceed
   * the net credited amount or drop below zero, and keeps its status in sync.
   */
  private async adjustDepositRefunded(
    organizationId: string,
    depositId: string,
    delta: number,
  ) {
    const guard =
      delta > 0
        ? { $lte: [{ $add: ['$refundedMinor', delta] }, '$netMinor'] }
        : { $gte: [{ $add: ['$refundedMinor', delta] }, 0] };
    const deposit = await this.depositModel.findOneAndUpdate(
      {
        _id: this.oid(depositId),
        organizationId,
        status: {
          $in: [...REFUNDABLE_DEPOSIT_STATUSES, DepositStatus.REFUNDED],
        },
        $expr: guard,
      },
      { $inc: { refundedMinor: delta } },
      { new: true },
    );
    if (!deposit) {
      throw new BusinessRuleException(
        'Refund exceeds the refundable amount of the deposit',
        ErrorCode.BIZ_AMOUNT_EXCEEDS_OUTSTANDING,
      );
    }
    const status =
      deposit.refundedMinor === 0
        ? DepositStatus.CREDITED
        : deposit.refundedMinor >= (deposit.netMinor ?? 0)
          ? DepositStatus.REFUNDED
          : DepositStatus.PARTIALLY_REFUNDED;
    if (status !== deposit.status) {
      await this.depositModel.updateOne(
        { _id: deposit._id },
        { $set: { status } },
      );
    }
  }

  private auditResolution(
    refund: RefundDocument,
    action: string,
    actorId: string,
    reason: string,
  ) {
    return this.audit.record({
      organizationId: refund.organizationId,
      entityType: 'refund',
      entityId: refund.id,
      action,
      actorId,
      reason,
    });
  }

  private oid(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id))
      throw new ResourceNotFoundException('Resource not found');
    return new Types.ObjectId(id);
  }
}
