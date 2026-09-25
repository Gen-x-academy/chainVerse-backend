import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BusinessRuleException,
  ErrorCode,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors';
import { DomainEvents } from '../../events/event-names';
import {
  DepositRail,
  DepositStatus,
  FeeEvent,
  FundingRoundStatus,
  LedgerSourceType,
} from '../domain/finance.enums';
import {
  assetKey,
  fundAccount,
  LedgerAccounts,
} from '../domain/ledger-accounts';
import {
  CreateFundingRoundDto,
  ListDepositsQueryDto,
  ReallocateFundsDto,
  RecordDepositDto,
} from '../dto/funding.dto';
import {
  AllocationChange,
  AllocationChangeDocument,
} from '../schemas/allocation-change.schema';
import {
  FundingRound,
  FundingRoundDocument,
} from '../schemas/funding-round.schema';
import {
  SponsorDeposit,
  SponsorDepositDocument,
} from '../schemas/sponsor-deposit.schema';
import { FinanceAuditService } from './finance-audit.service';
import { FeeService } from './fee.service';
import { JournalLineInput, LedgerService } from './ledger.service';

const DUPLICATE_KEY = 11000;

@Injectable()
export class FundingService {
  constructor(
    @InjectModel(FundingRound.name)
    private readonly roundModel: Model<FundingRoundDocument>,
    @InjectModel(SponsorDeposit.name)
    private readonly depositModel: Model<SponsorDepositDocument>,
    @InjectModel(AllocationChange.name)
    private readonly allocationModel: Model<AllocationChangeDocument>,
    private readonly ledger: LedgerService,
    private readonly fees: FeeService,
    private readonly audit: FinanceAuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Funding rounds ─────────────────────────────────────────────────────────

  async createRound(
    organizationId: string,
    dto: CreateFundingRoundDto,
    actorId: string,
  ) {
    const opensAt = new Date(dto.opensAt);
    const closesAt = new Date(dto.closesAt);
    if (closesAt <= opensAt) {
      throw new ValidationDomainException('closesAt must be after opensAt');
    }
    if (closesAt.getTime() <= Date.now()) {
      throw new ValidationDomainException('closesAt must be in the future');
    }
    const asset = {
      code: dto.asset.code.toUpperCase(),
      issuer: dto.asset.issuer ?? null,
    };

    const round = await this.roundModel.create({
      organizationId,
      name: dto.name,
      programId: dto.programId ?? null,
      asset,
      assetKey: assetKey(asset),
      targetMinor: dto.targetMinor ?? null,
      opensAt,
      closesAt,
      createdBy: actorId,
    });
    await this.audit.record({
      organizationId,
      entityType: 'funding_round',
      entityId: round.id,
      action: 'created',
      actorId,
      details: {
        programId: round.programId,
        assetKey: round.assetKey,
        targetMinor: round.targetMinor,
      },
    });
    return round;
  }

  listRounds(organizationId: string, status?: FundingRoundStatus) {
    const filter: Record<string, unknown> = { organizationId };
    if (status) filter.status = status;
    return this.roundModel.find(filter).sort({ opensAt: -1 }).lean();
  }

  async getRound(organizationId: string, id: string) {
    const round = await this.roundModel
      .findOne({ _id: this.oid(id), organizationId })
      .lean();
    if (!round) throw new ResourceNotFoundException('Funding round not found');
    return round;
  }

  async closeRound(
    organizationId: string,
    id: string,
    reason: string,
    actorId: string,
  ) {
    const round = await this.roundModel.findOneAndUpdate(
      { _id: this.oid(id), organizationId, status: FundingRoundStatus.OPEN },
      { $set: { status: FundingRoundStatus.CLOSED } },
      { new: true },
    );
    if (!round) {
      await this.getRound(organizationId, id);
      throw new BusinessRuleException(
        'Funding round is already closed',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    await this.audit.record({
      organizationId,
      entityType: 'funding_round',
      entityId: round.id,
      action: 'closed',
      actorId,
      reason,
      details: { raisedNetMinor: round.raisedNetMinor },
    });
    return round;
  }

  // ── Deposits ───────────────────────────────────────────────────────────────

  /**
   * Records an incoming sponsor transfer as `pending`. The asset and rail
   * reference are bound at this point and the (rail, reference, asset)
   * unique index guarantees the same transfer can never be recorded — and
   * therefore never credited — twice.
   */
  async recordDeposit(
    organizationId: string,
    dto: RecordDepositDto,
    actorId: string,
  ) {
    const asset = {
      code: dto.asset.code.toUpperCase(),
      issuer: dto.asset.issuer ?? null,
    };
    const key = assetKey(asset);
    const receivedAt = new Date(dto.receivedAt);
    if (receivedAt.getTime() > Date.now() + 5 * 60_000) {
      throw new ValidationDomainException('receivedAt cannot be in the future');
    }

    let programId = dto.programId ?? null;
    let fundingRoundId: string | null = null;
    if (dto.fundingRoundId) {
      const round = await this.getRound(organizationId, dto.fundingRoundId);
      if (
        round.status !== FundingRoundStatus.OPEN ||
        receivedAt > round.closesAt
      ) {
        throw new BusinessRuleException(
          'Funding round is closed',
          ErrorCode.BIZ_FUNDING_ROUND_CLOSED,
        );
      }
      if (round.assetKey !== key) {
        throw new BusinessRuleException(
          `Deposit asset ${key} does not match funding round asset ${round.assetKey}`,
          ErrorCode.BIZ_ASSET_MISMATCH,
        );
      }
      programId = round.programId;
      fundingRoundId = String(round._id);
    }

    let deposit: SponsorDepositDocument;
    try {
      deposit = await this.depositModel.create({
        organizationId,
        sponsorId: dto.sponsorId,
        fundingRoundId,
        programId,
        asset,
        assetKey: key,
        source: {
          rail: dto.source.rail,
          reference: dto.source.reference,
          sourceAccount: dto.source.sourceAccount ?? null,
        },
        grossMinor: dto.amountMinor,
        receivedAt,
        recordedBy: actorId,
      });
    } catch (err) {
      if ((err as { code?: number }).code === DUPLICATE_KEY) {
        throw new ResourceConflictException(
          'This transfer has already been recorded',
          ErrorCode.BIZ_DEPOSIT_ALREADY_RECORDED,
        );
      }
      throw err;
    }

    await this.audit.record({
      organizationId,
      entityType: 'sponsor_deposit',
      entityId: deposit.id,
      action: 'recorded',
      actorId,
      details: {
        assetKey: key,
        grossMinor: dto.amountMinor,
        rail: dto.source.rail,
        fundingRoundId,
        programId,
      },
    });
    return deposit;
  }

  /**
   * Credits a pending deposit: applies the fee schedule in force when the
   * funds arrived, then posts custody / fund / fee-revenue entries. The
   * status transition is claimed atomically before posting, and the journal
   * key is derived from the deposit id, so a deposit is credited once.
   */
  async creditDeposit(organizationId: string, id: string, actorId: string) {
    const deposit = await this.getDepositDoc(organizationId, id);
    if (deposit.status !== DepositStatus.PENDING) {
      throw new BusinessRuleException(
        `Deposit is ${deposit.status}; only pending deposits can be credited`,
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    if (
      deposit.source.rail === DepositRail.MANUAL &&
      deposit.recordedBy === actorId
    ) {
      throw new BusinessRuleException(
        'Manually recorded deposits must be credited by a different user',
        ErrorCode.BIZ_SEPARATION_OF_DUTIES,
      );
    }

    const fee = await this.fees.calculate(
      organizationId,
      deposit.assetKey,
      FeeEvent.DEPOSIT,
      deposit.grossMinor,
      deposit.receivedAt,
    );

    const claimed = await this.depositModel.findOneAndUpdate(
      { _id: deposit._id, organizationId, status: DepositStatus.PENDING },
      {
        $set: {
          status: DepositStatus.CREDITED,
          netMinor: fee.netMinor,
          fee: {
            feeScheduleId: fee.feeScheduleId,
            feeScheduleVersion: fee.feeScheduleVersion,
            rounding: fee.rounding,
            platformFeeMinor: fee.platformFeeMinor,
            networkFeeMinor: fee.networkFeeMinor,
            lines: fee.lines,
          },
          creditedBy: actorId,
          creditedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!claimed) {
      throw new BusinessRuleException(
        'Deposit was modified concurrently',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }

    const lines: JournalLineInput[] = [
      { account: LedgerAccounts.CUSTODY, debitMinor: fee.grossMinor },
      { account: fundAccount(deposit.programId), creditMinor: fee.netMinor },
    ];
    if (fee.platformFeeMinor > 0) {
      lines.push({
        account: LedgerAccounts.PLATFORM_FEE_REVENUE,
        creditMinor: fee.platformFeeMinor,
      });
    }
    if (fee.networkFeeMinor > 0) {
      lines.push({
        account: LedgerAccounts.NETWORK_FEE_PAYABLE,
        creditMinor: fee.networkFeeMinor,
      });
    }

    let journalId: string;
    try {
      const journal = await this.ledger.post({
        organizationId,
        assetKey: deposit.assetKey,
        idempotencyKey: `deposit-credit:${deposit.id}`,
        sourceType: LedgerSourceType.DEPOSIT_CREDIT,
        sourceId: deposit.id,
        lines,
        memo: `Sponsor deposit ${deposit.source.rail}:${deposit.source.reference}`,
        postedBy: actorId,
      });
      journalId = journal.id;
    } catch (err) {
      await this.depositModel.updateOne(
        {
          _id: deposit._id,
          status: DepositStatus.CREDITED,
          creditJournalId: null,
        },
        {
          $set: {
            status: DepositStatus.PENDING,
            netMinor: null,
            fee: null,
            creditedBy: null,
            creditedAt: null,
          },
        },
      );
      throw err;
    }

    claimed.creditJournalId = journalId;
    await claimed.save();

    if (deposit.fundingRoundId) {
      await this.roundModel.updateOne(
        { _id: this.oid(deposit.fundingRoundId), organizationId },
        { $inc: { raisedNetMinor: fee.netMinor } },
      );
    }

    await this.audit.record({
      organizationId,
      entityType: 'sponsor_deposit',
      entityId: deposit.id,
      action: 'credited',
      actorId,
      details: {
        journalId,
        grossMinor: fee.grossMinor,
        netMinor: fee.netMinor,
        platformFeeMinor: fee.platformFeeMinor,
        networkFeeMinor: fee.networkFeeMinor,
        feeScheduleVersion: fee.feeScheduleVersion,
      },
    });
    this.events.emit(DomainEvents.SCHOLARSHIP_DEPOSIT_CREDITED, {
      organizationId,
      depositId: deposit.id,
      sponsorId: deposit.sponsorId,
      programId: deposit.programId,
      assetKey: deposit.assetKey,
      netMinor: fee.netMinor,
    });
    return claimed;
  }

  async rejectDeposit(
    organizationId: string,
    id: string,
    reason: string,
    actorId: string,
  ) {
    const deposit = await this.depositModel.findOneAndUpdate(
      { _id: this.oid(id), organizationId, status: DepositStatus.PENDING },
      { $set: { status: DepositStatus.REJECTED, rejectionReason: reason } },
      { new: true },
    );
    if (!deposit) {
      await this.getDepositDoc(organizationId, id);
      throw new BusinessRuleException(
        'Only pending deposits can be rejected; use a refund for credited deposits',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    await this.audit.record({
      organizationId,
      entityType: 'sponsor_deposit',
      entityId: deposit.id,
      action: 'rejected',
      actorId,
      reason,
    });
    return deposit;
  }

  listDeposits(organizationId: string, query: ListDepositsQueryDto) {
    const filter: Record<string, unknown> = { organizationId };
    if (query.status) filter.status = query.status;
    if (query.fundingRoundId) filter.fundingRoundId = query.fundingRoundId;
    return this.depositModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(query.skip ?? 0)
      .limit(query.limit ?? 50)
      .lean();
  }

  async getDeposit(organizationId: string, id: string) {
    return (await this.getDepositDoc(organizationId, id)).toObject();
  }

  async getDepositDoc(organizationId: string, id: string) {
    const deposit = await this.depositModel.findOne({
      _id: this.oid(id),
      organizationId,
    });
    if (!deposit) throw new ResourceNotFoundException('Deposit not found');
    return deposit;
  }

  // ── Allocation changes ─────────────────────────────────────────────────────

  /**
   * Moves available funds between programs / the pool. Requires APPROVE
   * permission and a reason; the ledger guard prevents moving more than the
   * source fund holds, and each move is recorded as its own journal.
   */
  async reallocate(
    organizationId: string,
    dto: ReallocateFundsDto,
    actorId: string,
  ) {
    const from = dto.fromProgramId ?? null;
    const to = dto.toProgramId ?? null;
    if (from === to) {
      throw new ValidationDomainException(
        'Source and destination allocations must differ',
      );
    }
    const key = assetKey({
      code: dto.asset.code,
      issuer: dto.asset.issuer ?? null,
    });

    if (dto.depositId) {
      const deposit = await this.getDepositDoc(organizationId, dto.depositId);
      if (deposit.assetKey !== key) {
        throw new BusinessRuleException(
          'Asset does not match the referenced deposit',
          ErrorCode.BIZ_ASSET_MISMATCH,
        );
      }
      if (
        ![DepositStatus.CREDITED, DepositStatus.PARTIALLY_REFUNDED].includes(
          deposit.status,
        )
      ) {
        throw new BusinessRuleException(
          'Only credited deposits can be reallocated',
          ErrorCode.BIZ_INVALID_STATE_TRANSITION,
        );
      }
    }

    const changeId = new Types.ObjectId();
    const journal = await this.ledger.post({
      organizationId,
      assetKey: key,
      idempotencyKey: `reallocation:${changeId.toHexString()}`,
      sourceType: LedgerSourceType.REALLOCATION,
      sourceId: changeId.toHexString(),
      lines: [
        { account: fundAccount(from), debitMinor: dto.amountMinor },
        { account: fundAccount(to), creditMinor: dto.amountMinor },
      ],
      memo: `Reallocation: ${dto.reason}`,
      postedBy: actorId,
    });

    const change = await this.allocationModel.create({
      _id: changeId,
      organizationId,
      assetKey: key,
      fromProgramId: from,
      toProgramId: to,
      amountMinor: dto.amountMinor,
      depositId: dto.depositId ?? null,
      reason: dto.reason,
      approvedBy: actorId,
      journalId: journal.id,
    });
    await this.audit.record({
      organizationId,
      entityType: 'allocation_change',
      entityId: change.id,
      action: 'reallocated',
      actorId,
      reason: dto.reason,
      details: {
        from,
        to,
        amountMinor: dto.amountMinor,
        assetKey: key,
        journalId: journal.id,
      },
    });
    return change;
  }

  listAllocationChanges(organizationId: string, limit = 50, skip = 0) {
    return this.allocationModel
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  /** Background job: close rounds whose window has ended. */
  async closeExpiredRounds(now = new Date()): Promise<number> {
    const expired = await this.roundModel
      .find({ status: FundingRoundStatus.OPEN, closesAt: { $lt: now } })
      .select('_id organizationId')
      .lean();
    let closed = 0;
    for (const r of expired) {
      const res = await this.roundModel.updateOne(
        { _id: r._id, status: FundingRoundStatus.OPEN },
        { $set: { status: FundingRoundStatus.CLOSED } },
      );
      if (res.modifiedCount === 1) {
        closed++;
        await this.audit.record({
          organizationId: r.organizationId,
          entityType: 'funding_round',
          entityId: String(r._id),
          action: 'closed',
          actorId: 'system',
          reason: 'Funding window ended',
        });
      }
    }
    return closed;
  }

  private oid(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id))
      throw new ResourceNotFoundException('Resource not found');
    return new Types.ObjectId(id);
  }
}
