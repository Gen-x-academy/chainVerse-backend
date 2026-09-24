import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import { AuditAction } from '../../common/audit/audit-action.enum';
import { AuditContext } from '../../common/audit/audit-context';
import {
  BusinessRuleException,
  DomainException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { PaginatedResponse } from '../../common/interfaces/pagination.interface';
import { DomainEvents } from '../../events/event-names';
import { ScholarshipPaymentSettledPayload } from '../../events/payloads/scholarship-payment-settled.payload';
import {
  OrganizationMember,
  OrganizationMemberDocument,
} from '../../organization-member/schemas/organization-member.schema';
import {
  confirmationsFor,
  findReversalOperation,
} from '../domain/payment-evidence';
import { ScholarshipPaymentStatus, sourcesOf } from '../domain/payment-state';
import { canonicalAmount } from '../domain/scholarship-asset.rules';
import {
  ListPaymentsQueryDto,
  RecordReversalDto,
  SchedulePaymentDto,
} from '../dto/scholarship-payment.dto';
import {
  DisbursementLedgerEntry,
  DisbursementLedgerEntryDocument,
  LedgerEntryType,
} from '../schemas/disbursement-ledger-entry.schema';
import {
  ScholarshipPayment,
  ScholarshipPaymentDocument,
} from '../schemas/scholarship-payment.schema';
import { ScholarshipStellarGateway } from '../stellar/scholarship-stellar.gateway';
import {
  isDuplicateKey,
  ScholarshipAssetService,
} from './scholarship-asset.service';
import { PayoutWalletService } from './payout-wallet.service';

/** Fields safe to return to organization staff and the recipient. */
export function toPaymentView(p: ScholarshipPaymentDocument) {
  return {
    id: p.id,
    organizationId: p.organizationId,
    programId: p.programId,
    recipientId: p.recipientId,
    assetId: p.assetId,
    amount: p.amount,
    dueAt: p.dueAt,
    externalReference: p.externalReference,
    status: p.status,
    holdReason: p.holdReason,
    txHash: p.txHash,
    destination: p.destination,
    submittedAt: p.submittedAt,
    includedLedger: p.includedLedger,
    confirmations: p.confirmations,
    requiredConfirmations: p.requiredConfirmations,
    finalizedAt: p.finalizedAt,
    ledgerReference: p.ledgerReference,
    reversalReference: p.reversalReference,
    lastError: p.lastError,
    attempts: (p.attempts ?? []).map((a) => ({
      txHash: a.txHash,
      submittedAt: a.submittedAt,
      maxTime: a.maxTime,
      outcome: a.outcome,
      error: a.error,
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export type PaymentView = ReturnType<typeof toPaymentView>;

/**
 * Staff-facing management of scheduled installments: scheduling, holds,
 * cancellation, retries after a failed/expired attempt, and recording
 * verified reversals. Network-driven transitions live in the executor and
 * reconciler; every mutation here is a compare-and-set on `status`.
 */
@Injectable()
export class ScholarshipPaymentService {
  constructor(
    @InjectModel(ScholarshipPayment.name)
    private readonly paymentModel: Model<ScholarshipPaymentDocument>,
    @InjectModel(DisbursementLedgerEntry.name)
    private readonly ledgerModel: Model<DisbursementLedgerEntryDocument>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMemberDocument>,
    private readonly assets: ScholarshipAssetService,
    private readonly wallets: PayoutWalletService,
    private readonly gateway: ScholarshipStellarGateway,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async schedule(
    organizationId: string,
    dto: SchedulePaymentDto,
    actor: AuditContext,
  ): Promise<PaymentView> {
    const asset = await this.assets.requireActiveForProgram(
      organizationId,
      dto.programId,
      dto.assetId,
    );

    const amount = canonicalAmount(dto.amount, asset.decimals);
    if (!amount) {
      throw new BusinessRuleException(
        `amount must be positive with at most ${asset.decimals} decimal place(s) for ${asset.code}`,
        ErrorCode.BIZ_SCHOLARSHIP_AMOUNT_INVALID,
      );
    }

    const member = await this.memberModel
      .findOne({ organizationId, userId: dto.recipientId, deletedAt: null })
      .exec();
    if (!member) {
      throw new BusinessRuleException(
        'Recipient is not a member of this organization',
        ErrorCode.BIZ_SCHOLARSHIP_RECIPIENT_NOT_MEMBER,
      );
    }

    let payment: ScholarshipPaymentDocument;
    try {
      payment = await this.paymentModel.create({
        organizationId,
        programId: dto.programId,
        recipientId: dto.recipientId,
        assetId: asset.id,
        amount,
        dueAt: dto.dueAt,
        externalReference: dto.externalReference,
        status: ScholarshipPaymentStatus.SCHEDULED,
        createdBy: actor.actorId,
      });
    } catch (err) {
      if (isDuplicateKey(err)) {
        throw new ResourceConflictException(
          'A payment with this externalReference already exists',
        );
      }
      throw err;
    }

    await this.audit.record({
      action: AuditAction.SCHOLARSHIP_PAYMENT_SCHEDULED,
      context: actor,
      target: { type: 'scholarship_payment', id: payment.id },
      after: {
        programId: payment.programId,
        recipientId: payment.recipientId,
        assetId: payment.assetId,
        amount: payment.amount,
        dueAt: payment.dueAt,
      },
    });
    return toPaymentView(payment);
  }

  async list(
    organizationId: string,
    query: ListPaymentsQueryDto,
    recipientId?: string,
  ): Promise<PaginatedResponse<PaymentView>> {
    const filter: Record<string, unknown> = { organizationId };
    if (query.status) filter.status = query.status;
    if (query.programId) filter.programId = query.programId;
    const recipient = recipientId ?? query.recipientId;
    if (recipient) filter.recipientId = recipient;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [docs, total] = await Promise.all([
      this.paymentModel
        .find(filter)
        .sort({ dueAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.paymentModel.countDocuments(filter).exec(),
    ]);

    return {
      data: docs.map(toPaymentView),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Recipients may read their own payments; staff (owner/admin) any payment in
   * the organization. Anything else is reported as not found so ids of other
   * people's payments are not confirmed.
   */
  async getVisible(
    organizationId: string,
    paymentId: string,
    viewerId: string,
    isStaff: boolean,
  ): Promise<PaymentView> {
    const payment = await this.findOwned(organizationId, paymentId);
    if (!isStaff && payment.recipientId !== viewerId) {
      throw notFound();
    }
    return toPaymentView(payment);
  }

  async cancel(
    organizationId: string,
    paymentId: string,
    reason: string,
    actor: AuditContext,
  ): Promise<PaymentView> {
    const updated = await this.transition(
      organizationId,
      paymentId,
      ScholarshipPaymentStatus.CANCELLED,
      { holdReason: null, leaseOwner: null, leaseUntil: null },
    );
    await this.audit.record({
      action: AuditAction.SCHOLARSHIP_PAYMENT_CANCELLED,
      context: actor,
      target: { type: 'scholarship_payment', id: updated.id },
      after: { status: updated.status },
      reason,
    });
    return toPaymentView(updated);
  }

  /**
   * Returns a held payment to the schedule. Requires a verified wallet: the
   * executor will pay the *current* verified address, which the releasing
   * admin is confirming is legitimate.
   */
  async releaseHold(
    organizationId: string,
    paymentId: string,
    reason: string,
    actor: AuditContext,
  ): Promise<PaymentView> {
    const payment = await this.findOwned(organizationId, paymentId);
    const wallet = await this.wallets.findVerified(
      organizationId,
      payment.recipientId,
    );
    if (!wallet) {
      throw new BusinessRuleException(
        'Recipient has no verified payout wallet',
        ErrorCode.BIZ_SCHOLARSHIP_PAYMENT_STATE,
      );
    }

    const updated = await this.transition(
      organizationId,
      paymentId,
      ScholarshipPaymentStatus.SCHEDULED,
      { holdReason: null },
      [ScholarshipPaymentStatus.ON_HOLD],
    );
    await this.audit.record({
      action: AuditAction.SCHOLARSHIP_PAYMENT_HOLD_RELEASED,
      context: actor,
      target: { type: 'scholarship_payment', id: updated.id },
      after: { status: updated.status, payoutAddress: wallet.address },
      reason,
    });
    return toPaymentView(updated);
  }

  /**
   * Re-queues a failed or expired payment. Before clearing the previous
   * attempt we confirm with the network that it cannot still land: it must
   * not exist as a successful transaction, and the ledger must have closed
   * past its `maxTime`.
   */
  async retry(
    organizationId: string,
    paymentId: string,
    reason: string,
    actor: AuditContext,
  ): Promise<PaymentView> {
    const payment = await this.findOwned(organizationId, paymentId);
    if (
      payment.status !== ScholarshipPaymentStatus.FAILED &&
      payment.status !== ScholarshipPaymentStatus.EXPIRED
    ) {
      throw stateError(payment.status, 'retried');
    }

    if (payment.txHash) {
      await this.withNetwork(async () => {
        const tx = await this.gateway.getTransaction(payment.txHash!);
        if (tx?.successful) {
          throw new ResourceConflictException(
            'The previous attempt succeeded on-chain; it will not be retried',
          );
        }
        const tip = await this.gateway.latestLedger();
        if (payment.txMaxTime && tip.closedAt <= payment.txMaxTime) {
          throw new BusinessRuleException(
            `The previous attempt can still be included until ${payment.txMaxTime.toISOString()}; retry after that`,
            ErrorCode.BIZ_SCHOLARSHIP_PAYMENT_STATE,
          );
        }
      });
    }

    const updated = await this.transition(
      organizationId,
      paymentId,
      ScholarshipPaymentStatus.SCHEDULED,
      {
        txHash: null,
        destination: null,
        sourceAccount: null,
        memo: null,
        submittedAt: null,
        txMaxTime: null,
        includedLedger: null,
        confirmations: 0,
        lastError: null,
      },
      [payment.status],
    );
    await this.audit.record({
      action: AuditAction.SCHOLARSHIP_PAYMENT_RETRIED,
      context: actor,
      target: { type: 'scholarship_payment', id: updated.id },
      before: { status: payment.status, txHash: payment.txHash },
      after: { status: updated.status },
      reason,
    });
    return toPaymentView(updated);
  }

  /**
   * Records that a successful payout was reversed, but only on verified
   * network evidence: a confirmed transaction that claws back or returns the
   * full amount from the address that was paid.
   */
  async recordReversal(
    organizationId: string,
    paymentId: string,
    dto: RecordReversalDto,
    actor: AuditContext,
  ): Promise<PaymentView> {
    const payment = await this.findOwned(organizationId, paymentId);
    if (payment.status !== ScholarshipPaymentStatus.SUCCESSFUL) {
      throw stateError(payment.status, 'reversed');
    }
    const asset = await this.assets.findOwned(organizationId, payment.assetId);

    const evidence = await this.withNetwork(async () => {
      const tx = await this.gateway.getTransaction(dto.transactionHash);
      if (!tx || !tx.successful) return null;
      if (tx.ledger_attr < (payment.includedLedger ?? 0)) return null;

      const ops = await this.gateway.getOperations(dto.transactionHash);
      const op = findReversalOperation(ops, {
        recipientAddress: payment.destination!,
        treasuryAddress: payment.sourceAccount!,
        amount: payment.amount,
        asset,
      });
      if (!op) return null;

      const tip = await this.gateway.latestLedger();
      const required =
        payment.requiredConfirmations ?? this.defaultConfirmations;
      if (confirmationsFor(tx.ledger_attr, tip.sequence) < required)
        return null;
      return { tx, op };
    });

    if (!evidence) {
      throw new BusinessRuleException(
        'Transaction does not evidence a confirmed clawback or full return of this payment',
        ErrorCode.BIZ_SCHOLARSHIP_REVERSAL_UNVERIFIED,
      );
    }

    const reference = {
      txHash: evidence.tx.hash,
      ledger: evidence.tx.ledger_attr,
      operationId: evidence.op.id,
      pagingToken: (evidence.op.paging_token as string | undefined) ?? null,
      closedAt: evidence.tx.created_at
        ? new Date(evidence.tx.created_at)
        : null,
    };

    try {
      await this.ledgerModel
        .updateOne(
          { paymentId: payment.id, type: LedgerEntryType.REVERSAL },
          {
            $setOnInsert: {
              organizationId,
              paymentId: payment.id,
              type: LedgerEntryType.REVERSAL,
              recipientId: payment.recipientId,
              amount: payment.amount,
              assetCode: asset.code,
              assetIssuer: asset.issuer,
              network: asset.network,
              txHash: reference.txHash,
              ledger: reference.ledger,
              operationId: reference.operationId,
            },
          },
          { upsert: true },
        )
        .exec();
    } catch (err) {
      if (isDuplicateKey(err)) {
        throw new ResourceConflictException(
          'This transaction already evidences another reversal',
        );
      }
      throw err;
    }

    const updated = await this.transition(
      organizationId,
      paymentId,
      ScholarshipPaymentStatus.REVERSED,
      { reversalReference: reference, reversalReason: dto.reason },
      [ScholarshipPaymentStatus.SUCCESSFUL],
    );

    await this.audit.record({
      action: AuditAction.SCHOLARSHIP_PAYMENT_REVERSED,
      context: actor,
      target: { type: 'scholarship_payment', id: updated.id },
      before: { status: ScholarshipPaymentStatus.SUCCESSFUL },
      after: { status: updated.status, reversalTx: reference.txHash },
      reason: dto.reason,
    });
    this.events.emit(
      DomainEvents.SCHOLARSHIP_PAYMENT_SETTLED,
      Object.assign(new ScholarshipPaymentSettledPayload(), {
        paymentId: updated.id,
        organizationId,
        recipientId: updated.recipientId,
        status: updated.status,
        txHash: reference.txHash,
      }),
    );
    return toPaymentView(updated);
  }

  async findOwned(
    organizationId: string,
    paymentId: string,
  ): Promise<ScholarshipPaymentDocument> {
    const payment = await this.paymentModel
      .findOne({ _id: paymentId, organizationId })
      .exec();
    if (!payment) throw notFound();
    return payment;
  }

  /**
   * Compare-and-set status change, scoped to the organization. `from`
   * defaults to every status the state machine allows into `to`.
   */
  private async transition(
    organizationId: string,
    paymentId: string,
    to: ScholarshipPaymentStatus,
    set: Record<string, unknown>,
    from: ScholarshipPaymentStatus[] = sourcesOf(to),
  ): Promise<ScholarshipPaymentDocument> {
    const updated = await this.paymentModel
      .findOneAndUpdate(
        { _id: paymentId, organizationId, status: { $in: from } },
        { $set: { ...set, status: to } },
        { new: true },
      )
      .exec();
    if (updated) return updated;

    const current = await this.findOwned(organizationId, paymentId);
    throw stateError(current.status, `moved to ${to}`);
  }

  private get defaultConfirmations(): number {
    return this.config.get<number>('scholarships.requiredConfirmations') ?? 1;
  }

  private async withNetwork<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof DomainException) throw err;
      throw new DomainException(
        'Could not reach the Stellar network; try again shortly',
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SYS_SERVICE_UNAVAILABLE,
      );
    }
  }
}

function notFound(): ResourceNotFoundException {
  return new ResourceNotFoundException(
    'Scholarship payment not found',
    ErrorCode.RES_SCHOLARSHIP_PAYMENT_NOT_FOUND,
  );
}

function stateError(
  status: ScholarshipPaymentStatus,
  action: string,
): BusinessRuleException {
  return new BusinessRuleException(
    `A ${status} payment cannot be ${action}`,
    ErrorCode.BIZ_SCHOLARSHIP_PAYMENT_STATE,
  );
}
