import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { ErrorCode, ResourceNotFoundException } from '../../common/errors';
import { AuthenticatedUser } from '../common/authenticated-user';
import { fromMinorUnits } from '../common/money';
import { TenantAccessService } from '../common/tenant-access.service';
import {
  HorizonClient,
  HorizonTransaction,
} from '../integrations/horizon.client';
import {
  PayoutAttempt,
  PayoutIntentDocument,
} from '../payouts/payout-intent.schema';
import { ScholarshipProgramDocument } from '../programs/scholarship-program.schema';
import {
  ReceiptIssuedPayload,
  ScholarshipFinanceEvents,
} from '../scholarship-finance.events';
import {
  PaymentReceipt,
  PaymentReceiptDocument,
  ReceiptVerification,
} from './payment-receipt.schema';

export function presentReceipt(r: PaymentReceipt & { _id?: unknown }) {
  return {
    id: String(r._id),
    receiptNumber: r.receiptNumber,
    organizationId: r.organizationId,
    programId: r.programId,
    programName: r.programName,
    awardId: r.awardId,
    installmentId: r.installmentId,
    recipientId: r.recipientId,
    asset: r.asset,
    amount: fromMinorUnits(BigInt(r.amount)),
    network: r.network,
    transactionHash: r.transactionHash,
    ledger: r.ledger,
    memo: r.memo,
    sourceAccount: r.sourceAccount,
    destination: r.destination,
    completedAt: r.completedAt,
    issuedAt: r.issuedAt,
    evidence: r.evidence,
    latestVerification: r.verifications.at(-1) ?? null,
  };
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    @InjectModel(PaymentReceipt.name)
    private readonly receiptModel: Model<PaymentReceiptDocument>,
    private readonly horizon: HorizonClient,
    private readonly tenant: TenantAccessService,
    private readonly events: EventEmitter2,
  ) {}

  /** Idempotent: one receipt per payout intent. */
  async issue(
    program: ScholarshipProgramDocument,
    intent: PayoutIntentDocument,
    attempt: PayoutAttempt,
    tx: HorizonTransaction,
  ) {
    const existing = await this.receiptModel
      .findOne({ payoutIntentId: intent.id })
      .lean()
      .exec();
    if (existing) return existing;

    const completedAt = new Date(tx.createdAt);
    const doc: PaymentReceipt = {
      receiptNumber: this.receiptNumber(completedAt, intent.id),
      organizationId: intent.organizationId,
      programId: intent.programId,
      programName: program.name,
      awardId: intent.awardId,
      installmentId: intent.installmentId,
      recipientId: intent.recipientId,
      payoutIntentId: intent.id,
      asset: intent.asset,
      amount: intent.amount,
      network: intent.network,
      transactionHash: tx.hash,
      ledger: tx.ledger,
      memo: intent.memo,
      sourceAccount: tx.sourceAccount,
      destination: attempt.destination,
      completedAt,
      evidence: {
        horizonUrl: this.horizon.transactionUrl(intent.network, tx.hash),
        explorerUrl: this.horizon.explorerUrl(intent.network, tx.hash),
      },
      verifications: [
        {
          status: 'verified',
          checkedAt: new Date(),
          detail: 'Verified at issue',
        },
      ],
    };

    try {
      const created = await this.receiptModel.create(doc);
      const payload: ReceiptIssuedPayload = {
        organizationId: doc.organizationId,
        receiptId: created.id,
        receiptNumber: doc.receiptNumber,
        recipientId: doc.recipientId,
        amount: fromMinorUnits(BigInt(doc.amount)),
        assetCode: doc.asset.code,
      };
      this.events.emit(ScholarshipFinanceEvents.RECEIPT_ISSUED, payload);
      this.logger.log(
        `Receipt ${doc.receiptNumber} issued for payout ${intent.id}`,
      );
      return created.toObject();
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        const raced = await this.receiptModel
          .findOne({ payoutIntentId: intent.id })
          .lean()
          .exec();
        if (raced) return raced;
      }
      throw err;
    }
  }

  async listMine(user: AuthenticatedUser) {
    const receipts = await this.receiptModel
      .find({ recipientId: user.id })
      .sort({ completedAt: -1 })
      .lean()
      .exec();
    return receipts.map(presentReceipt);
  }

  async listForOrganization(
    organizationId: string,
    filter: { programId?: string; recipientId?: string; limit?: number },
  ) {
    const q: Record<string, unknown> = { organizationId };
    if (filter.programId) q.programId = filter.programId;
    if (filter.recipientId) q.recipientId = filter.recipientId;
    const receipts = await this.receiptModel
      .find(q)
      .sort({ completedAt: -1 })
      .limit(filter.limit ?? 50)
      .lean()
      .exec();
    return receipts.map(presentReceipt);
  }

  /** Recipients can read their own receipts; finance staff can read their organization's. */
  async getAuthorized(user: AuthenticatedUser, receiptId: string) {
    const receipt = isValidObjectId(receiptId)
      ? await this.receiptModel.findById(receiptId).lean().exec()
      : null;
    const allowed =
      receipt &&
      (receipt.recipientId === user.id ||
        (await this.tenant.canRead(user, receipt.organizationId)));
    if (!receipt || !allowed) {
      // Same response whether missing or foreign, to avoid leaking existence.
      throw new ResourceNotFoundException(
        'Receipt not found',
        ErrorCode.RES_RECEIPT_NOT_FOUND,
      );
    }
    return receipt;
  }

  /** Re-checks the receipt's transaction on Horizon and appends the outcome. */
  async verify(user: AuthenticatedUser, receiptId: string) {
    const receipt = await this.getAuthorized(user, receiptId);
    const tx = await this.horizon.getTransaction(
      receipt.network,
      receipt.transactionHash,
    );

    let verification: ReceiptVerification;
    if (!tx) {
      verification = {
        status: 'not_found',
        checkedAt: new Date(),
        detail: 'Transaction not found on Horizon',
      };
    } else if (
      !tx.successful ||
      tx.memo !== receipt.memo ||
      tx.ledger !== receipt.ledger
    ) {
      verification = {
        status: 'mismatch',
        checkedAt: new Date(),
        detail: `successful=${tx.successful} memo=${tx.memo ?? ''} ledger=${tx.ledger}`,
      };
    } else {
      verification = { status: 'verified', checkedAt: new Date() };
    }

    const updated = await this.receiptModel
      .findByIdAndUpdate(
        receipt._id,
        { $push: { verifications: verification } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (verification.status !== 'verified') {
      this.logger.error(
        `Receipt ${receipt.receiptNumber} failed verification: ${verification.status} ${verification.detail ?? ''}`,
      );
    }
    return presentReceipt(updated!);
  }

  private receiptNumber(completedAt: Date, intentId: string) {
    const day = completedAt.toISOString().slice(0, 10).replace(/-/g, '');
    return `SCH-${day}-${intentId.slice(-10).toUpperCase()}`;
  }
}
