import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import {
  AuditAction,
  AuditOutcome,
} from '../../common/audit/audit-action.enum';
import { systemAuditContext } from '../../common/audit/audit-context';
import { DomainEvents } from '../../events/event-names';
import { ScholarshipPaymentSettledPayload } from '../../events/payloads/scholarship-payment-settled.payload';
import {
  confirmationsFor,
  verifyPayoutEvidence,
} from '../domain/payment-evidence';
import {
  IN_FLIGHT_STATUSES,
  ScholarshipPaymentStatus,
} from '../domain/payment-state';
import {
  DisbursementLedgerEntry,
  DisbursementLedgerEntryDocument,
  LedgerEntryType,
} from '../schemas/disbursement-ledger-entry.schema';
import {
  DisbursementRun,
  DisbursementRunDocument,
  DisbursementRunKind,
  IntentOutcome,
  IntentResult,
} from '../schemas/disbursement-run.schema';
import {
  ScholarshipAsset,
  ScholarshipAssetDocument,
} from '../schemas/scholarship-asset.schema';
import {
  LedgerReference,
  ScholarshipPayment,
  ScholarshipPaymentDocument,
} from '../schemas/scholarship-payment.schema';
import {
  LedgerTip,
  ScholarshipStellarGateway,
} from '../stellar/scholarship-stellar.gateway';
import { DisbursementLockService } from './disbursement-lock.service';
import {
  intent,
  notStarted,
  RunOptions,
  RunReport,
  summarise,
} from './disbursement-executor.service';

const LOCK_NAME = 'scholarship-disbursement:reconcile';

/**
 * Moves in-flight payments forward on verified Horizon evidence only.
 *
 *  - `submitted` + tx found successful and matching → `pending`
 *  - `pending` + confirmations ≥ required        → `successful` (ledger entry)
 *  - tx found but failed on-chain                 → `failed`
 *  - tx not found and the network closed a ledger
 *    past `maxTime` + grace                       → `expired`
 *
 * Expiry is judged by ledger close time, not the local clock, so a lagging
 * Horizon can never expire a transaction that might still be included.
 * Finalization writes the ledger entry first (idempotent upsert) and then
 * compare-and-sets `pending` → `successful`, so a payment finalizes at most
 * once no matter how many reconcilers run or crash mid-way.
 */
@Injectable()
export class DisbursementReconcilerService {
  private readonly logger = new Logger(DisbursementReconcilerService.name);

  constructor(
    @InjectModel(ScholarshipPayment.name)
    private readonly paymentModel: Model<ScholarshipPaymentDocument>,
    @InjectModel(ScholarshipAsset.name)
    private readonly assetModel: Model<ScholarshipAssetDocument>,
    @InjectModel(DisbursementLedgerEntry.name)
    private readonly ledgerModel: Model<DisbursementLedgerEntryDocument>,
    @InjectModel(DisbursementRun.name)
    private readonly runModel: Model<DisbursementRunDocument>,
    private readonly gateway: ScholarshipStellarGateway,
    private readonly locks: DisbursementLockService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async run(options: RunOptions): Promise<RunReport> {
    const holder = new Types.ObjectId().toHexString();
    const leaseMs =
      (this.config.get<number>('scholarships.leaseSeconds') ?? 300) * 1000;
    if (!(await this.locks.acquire(LOCK_NAME, holder, leaseMs))) {
      return notStarted(
        DisbursementRunKind.RECONCILE,
        'another reconciliation run is in progress',
      );
    }

    try {
      return await this.runLocked(holder, options);
    } finally {
      await this.locks.release(LOCK_NAME, holder);
    }
  }

  private async runLocked(
    runId: string,
    options: RunOptions,
  ): Promise<RunReport> {
    const batchSize = Math.min(
      options.batchSize ??
        this.config.get<number>('scholarships.batchSize') ??
        25,
      100,
    );
    const run = await this.runModel.create({
      _id: new Types.ObjectId(runId),
      kind: DisbursementRunKind.RECONCILE,
      trigger: options.trigger,
      organizationId: options.organizationId ?? null,
      batchSize,
      startedAt: new Date(),
    });

    const filter: Record<string, unknown> = {
      status: { $in: IN_FLIGHT_STATUSES },
    };
    if (options.organizationId) filter.organizationId = options.organizationId;

    // Least recently touched first, so a stuck payment cannot starve others.
    const payments = await this.paymentModel
      .find(filter)
      .sort({ updatedAt: 1, _id: 1 })
      .limit(batchSize)
      .exec();

    const results: IntentResult[] = [];
    let haltReason: string | null = null;

    if (payments.length > 0) {
      let tip: LedgerTip | null = null;
      try {
        tip = await this.gateway.latestLedger();
      } catch (err) {
        haltReason = `could not load latest ledger: ${errorMessage(err)}`;
      }

      if (tip) {
        for (const payment of payments) {
          try {
            results.push(await this.reconcileOne(payment, tip));
          } catch (err) {
            const message = errorMessage(err);
            this.logger.warn(`Reconcile ${payment.id} failed: ${message}`);
            // Touch updatedAt so the next run moves on to other payments.
            await this.paymentModel
              .updateOne({ _id: payment._id }, { $set: { lastError: message } })
              .exec();
            results.push(
              intent(payment, IntentOutcome.ERROR, payment.txHash, message),
            );
          }
        }
      }
    }

    const summary = summarise(results);
    run.results = results;
    run.summary = summary;
    run.haltReason = haltReason;
    run.finishedAt = new Date();
    await run.save();

    if (results.length > 0 || haltReason) {
      await this.audit.record({
        action: AuditAction.SCHOLARSHIP_DISBURSEMENT_RUN,
        context: options.actor,
        target: { type: 'scholarship_disbursement_run', id: run.id },
        outcome: haltReason ? AuditOutcome.FAILURE : AuditOutcome.SUCCESS,
        after: { kind: run.kind, trigger: run.trigger, summary },
        reason: haltReason,
      });
    }

    return {
      runId: run.id,
      kind: DisbursementRunKind.RECONCILE,
      started: true,
      haltReason,
      summary,
      results,
    };
  }

  private async reconcileOne(
    payment: ScholarshipPaymentDocument,
    tip: LedgerTip,
  ): Promise<IntentResult> {
    const hash = payment.txHash!;
    const tx = await this.gateway.getTransaction(hash);

    if (!tx) {
      const grace =
        (this.config.get<number>('scholarships.expiryGraceSeconds') ?? 60) *
        1000;
      const deadline = (payment.txMaxTime?.getTime() ?? 0) + grace;
      if (
        payment.status === ScholarshipPaymentStatus.SUBMITTED &&
        tip.closedAt.getTime() > deadline
      ) {
        const expired = await this.settle(
          payment,
          ScholarshipPaymentStatus.EXPIRED,
          'transaction was not included before maxTime',
        );
        return intent(
          payment,
          expired ? IntentOutcome.EXPIRED : IntentOutcome.UNCHANGED,
          hash,
          null,
        );
      }
      // Rotate to the back of the queue so other in-flight payments get checked.
      await this.paymentModel
        .updateOne({ _id: payment._id }, { $set: { updatedAt: new Date() } })
        .exec();
      return intent(
        payment,
        IntentOutcome.UNCHANGED,
        hash,
        'not yet seen on network',
      );
    }

    if (!tx.successful) {
      const failed = await this.settle(
        payment,
        ScholarshipPaymentStatus.FAILED,
        'transaction failed on-chain',
      );
      return intent(
        payment,
        failed ? IntentOutcome.FAILED : IntentOutcome.UNCHANGED,
        hash,
        'transaction failed on-chain',
      );
    }

    const asset = await this.assetModel.findById(payment.assetId).exec();
    if (!asset) {
      return this.mismatch(payment, 'asset configuration missing');
    }
    const ops = await this.gateway.getOperations(hash);
    const evidence = verifyPayoutEvidence(tx, ops, {
      sourceAccount: payment.sourceAccount!,
      destination: payment.destination!,
      amount: payment.amount,
      asset,
      memo: payment.memo!,
    });
    if (!evidence.ok) {
      return this.mismatch(payment, evidence.reason);
    }

    const includedLedger = tx.ledger_attr;
    const confirmations = confirmationsFor(includedLedger, tip.sequence);
    const required =
      payment.requiredConfirmations ??
      this.config.get<number>('scholarships.requiredConfirmations') ??
      1;

    if (confirmations < required) {
      await this.paymentModel
        .updateOne(
          { _id: payment._id, status: { $in: IN_FLIGHT_STATUSES } },
          {
            $set: {
              status: ScholarshipPaymentStatus.PENDING,
              includedLedger,
              confirmations,
              lastError: null,
            },
          },
        )
        .exec();
      return intent(
        payment,
        IntentOutcome.PENDING,
        hash,
        `${confirmations}/${required} confirmations`,
      );
    }

    const reference: LedgerReference = {
      txHash: tx.hash,
      ledger: includedLedger,
      operationId: evidence.operation.id,
      pagingToken:
        (evidence.operation.paging_token as string | undefined) ?? null,
      closedAt: tx.created_at ? new Date(tx.created_at) : null,
    };

    // Ledger entry first (idempotent), then the single-winner status flip.
    await this.ledgerModel
      .updateOne(
        { paymentId: payment.id, type: LedgerEntryType.PAYOUT },
        {
          $setOnInsert: {
            organizationId: payment.organizationId,
            paymentId: payment.id,
            type: LedgerEntryType.PAYOUT,
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

    const finalized = await this.paymentModel
      .findOneAndUpdate(
        {
          _id: payment._id,
          txHash: hash,
          status: { $in: IN_FLIGHT_STATUSES },
        },
        {
          $set: {
            status: ScholarshipPaymentStatus.SUCCESSFUL,
            includedLedger,
            confirmations,
            finalizedAt: new Date(),
            ledgerReference: reference,
            lastError: null,
            'attempts.$[a].outcome': ScholarshipPaymentStatus.SUCCESSFUL,
          },
        },
        { arrayFilters: [{ 'a.txHash': hash }], new: true },
      )
      .exec();

    if (!finalized) {
      return intent(
        payment,
        IntentOutcome.UNCHANGED,
        hash,
        'already finalized',
      );
    }

    await this.audit.record({
      action: AuditAction.SCHOLARSHIP_PAYMENT_FINALIZED,
      context: systemAuditContext('scholarship-reconciler'),
      target: { type: 'scholarship_payment', id: finalized.id },
      before: { status: payment.status },
      after: { status: finalized.status, ledgerReference: reference },
    });
    this.emitSettled(finalized);
    return intent(payment, IntentOutcome.SUCCESSFUL, hash, null);
  }

  /** Terminal failure/expiry of the current attempt; returns the updated doc. */
  private async settle(
    payment: ScholarshipPaymentDocument,
    status: ScholarshipPaymentStatus.FAILED | ScholarshipPaymentStatus.EXPIRED,
    reason: string,
  ): Promise<ScholarshipPaymentDocument | null> {
    const from =
      status === ScholarshipPaymentStatus.EXPIRED
        ? [ScholarshipPaymentStatus.SUBMITTED]
        : IN_FLIGHT_STATUSES;
    const updated = await this.paymentModel
      .findOneAndUpdate(
        { _id: payment._id, txHash: payment.txHash, status: { $in: from } },
        {
          $set: {
            status,
            lastError: reason,
            'attempts.$[a].outcome': status,
            'attempts.$[a].error': reason,
          },
        },
        { arrayFilters: [{ 'a.txHash': payment.txHash }], new: true },
      )
      .exec();
    if (updated) this.emitSettled(updated);
    return updated;
  }

  /**
   * A successful transaction that is not the payout we built is never
   * finalized. The payment stays in flight with the reason recorded so an
   * operator can investigate; the reconciler keeps reporting it.
   */
  private async mismatch(
    payment: ScholarshipPaymentDocument,
    reason: string,
  ): Promise<IntentResult> {
    this.logger.error(
      `Evidence mismatch for payment ${payment.id} tx ${payment.txHash}: ${reason}`,
    );
    await this.paymentModel
      .updateOne(
        { _id: payment._id },
        { $set: { lastError: `evidence mismatch: ${reason}` } },
      )
      .exec();
    return intent(
      payment,
      IntentOutcome.EVIDENCE_MISMATCH,
      payment.txHash,
      reason,
    );
  }

  private emitSettled(payment: ScholarshipPaymentDocument): void {
    this.events.emit(
      DomainEvents.SCHOLARSHIP_PAYMENT_SETTLED,
      Object.assign(new ScholarshipPaymentSettledPayload(), {
        paymentId: payment.id,
        organizationId: payment.organizationId,
        recipientId: payment.recipientId,
        status: payment.status,
        txHash: payment.txHash,
      }),
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
