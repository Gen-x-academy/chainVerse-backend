import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { Keypair } from '@stellar/stellar-sdk';
import { AuditService } from '../../common/audit/audit.service';
import {
  AuditAction,
  AuditOutcome,
} from '../../common/audit/audit-action.enum';
import { AuditContext } from '../../common/audit/audit-context';
import { DomainEvents } from '../../events/event-names';
import { ScholarshipPaymentSettledPayload } from '../../events/payloads/scholarship-payment-settled.payload';
import { ScholarshipPaymentStatus } from '../domain/payment-state';
import {
  ScholarshipAssetStatus,
  ScholarshipAssetType,
} from '../domain/scholarship-asset.rules';
import {
  DisbursementRun,
  DisbursementRunDocument,
  DisbursementRunKind,
  DisbursementRunTrigger,
  IntentOutcome,
  IntentResult,
} from '../schemas/disbursement-run.schema';
import {
  ScholarshipAsset,
  ScholarshipAssetDocument,
} from '../schemas/scholarship-asset.schema';
import {
  ScholarshipPayment,
  ScholarshipPaymentDocument,
} from '../schemas/scholarship-payment.schema';
import { ScholarshipStellarGateway } from '../stellar/scholarship-stellar.gateway';
import { DisbursementLockService } from './disbursement-lock.service';
import { PayoutWalletService } from './payout-wallet.service';

export interface RunOptions {
  trigger: DisbursementRunTrigger;
  actor: AuditContext;
  organizationId?: string;
  batchSize?: number;
}

export interface RunReport {
  runId: string | null;
  kind: DisbursementRunKind;
  started: boolean;
  haltReason: string | null;
  summary: Record<string, number>;
  results: IntentResult[];
}

/** Outcome of one intent plus whether the rest of the batch must stop. */
interface Processed {
  result: IntentResult;
  halt?: string;
}

const LOCK_NAME = 'scholarship-disbursement:execute';

/**
 * Pays due installments in bounded, sequential batches.
 *
 * Per intent: claim with a lease → check asset, verified wallet, destination
 * account and trustline → build and sign → persist the tx hash (write-ahead)
 * with a compare-and-set from `scheduled` to `submitted` → submit. Because the
 * hash is stored before submission, a crash can never lose track of a
 * transaction that might land; the reconciler resolves it by hash or expires
 * it once its `maxTime` has passed.
 *
 * Only one executor runs cluster-wide (payouts share the treasury sequence
 * number), and a submission with an unknown result halts the batch rather
 * than risk building on a sequence number that may already be consumed.
 */
@Injectable()
export class DisbursementExecutorService {
  private readonly logger = new Logger(DisbursementExecutorService.name);

  constructor(
    @InjectModel(ScholarshipPayment.name)
    private readonly paymentModel: Model<ScholarshipPaymentDocument>,
    @InjectModel(ScholarshipAsset.name)
    private readonly assetModel: Model<ScholarshipAssetDocument>,
    @InjectModel(DisbursementRun.name)
    private readonly runModel: Model<DisbursementRunDocument>,
    private readonly wallets: PayoutWalletService,
    private readonly gateway: ScholarshipStellarGateway,
    private readonly locks: DisbursementLockService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async run(options: RunOptions): Promise<RunReport> {
    const signer = this.gateway.treasuryKeypair();
    if (!signer) {
      return notStarted(
        DisbursementRunKind.EXECUTE,
        'SCHOLARSHIP_TREASURY_SECRET is not configured',
      );
    }

    const holder = new Types.ObjectId().toHexString();
    if (!(await this.locks.acquire(LOCK_NAME, holder, this.leaseMs))) {
      return notStarted(
        DisbursementRunKind.EXECUTE,
        'another execution run is in progress',
      );
    }

    try {
      return await this.runLocked(holder, signer, options);
    } finally {
      await this.locks.release(LOCK_NAME, holder);
    }
  }

  private async runLocked(
    runId: string,
    signer: Keypair,
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
      kind: DisbursementRunKind.EXECUTE,
      trigger: options.trigger,
      organizationId: options.organizationId ?? null,
      batchSize,
      startedAt: new Date(),
    });

    const results: IntentResult[] = [];
    const seen: Types.ObjectId[] = [];
    let haltReason: string | null = null;

    while (results.length < batchSize) {
      const payment = await this.claimNext(runId, seen, options.organizationId);
      if (!payment) break;
      seen.push(payment._id);

      let processed: Processed;
      try {
        processed = await this.processOne(runId, signer, payment);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Payment ${payment.id} errored: ${message}`);
        await this.releaseLease(runId, payment, message);
        processed = {
          result: intent(payment, IntentOutcome.ERROR, null, message),
          halt: 'unexpected error while executing a payment',
        };
      }

      results.push(processed.result);
      if (processed.halt) {
        haltReason = processed.halt;
        break;
      }
    }

    const summary = summarise(results);
    run.results = results;
    run.summary = summary;
    run.haltReason = haltReason;
    run.finishedAt = new Date();
    await run.save();

    await this.audit.record({
      action: AuditAction.SCHOLARSHIP_DISBURSEMENT_RUN,
      context: options.actor,
      target: { type: 'scholarship_disbursement_run', id: run.id },
      outcome: haltReason ? AuditOutcome.FAILURE : AuditOutcome.SUCCESS,
      after: { kind: run.kind, trigger: run.trigger, summary },
      reason: haltReason,
    });

    return {
      runId: run.id,
      kind: DisbursementRunKind.EXECUTE,
      started: true,
      haltReason,
      summary,
      results,
    };
  }

  /** Atomically leases the oldest due, unleased scheduled payment. */
  private claimNext(
    runId: string,
    seen: Types.ObjectId[],
    organizationId?: string,
  ): Promise<ScholarshipPaymentDocument | null> {
    const now = new Date();
    const filter: Record<string, unknown> = {
      status: ScholarshipPaymentStatus.SCHEDULED,
      dueAt: { $lte: now },
      _id: { $nin: seen },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }],
    };
    if (organizationId) filter.organizationId = organizationId;

    return this.paymentModel
      .findOneAndUpdate(
        filter,
        {
          $set: {
            leaseOwner: runId,
            leaseUntil: new Date(now.getTime() + this.leaseMs),
          },
        },
        { sort: { dueAt: 1, _id: 1 }, new: true },
      )
      .exec();
  }

  private async processOne(
    runId: string,
    signer: Keypair,
    payment: ScholarshipPaymentDocument,
  ): Promise<Processed> {
    const asset = await this.assetModel
      .findOne({ _id: payment.assetId, organizationId: payment.organizationId })
      .exec();
    if (
      !asset ||
      asset.status !== ScholarshipAssetStatus.ACTIVE ||
      asset.network !== this.gateway.network
    ) {
      return this.skip(
        runId,
        payment,
        IntentOutcome.SKIPPED_ASSET_NOT_ACTIVE,
        'asset is not active on the platform network',
      );
    }

    const wallet = await this.wallets.findVerified(
      payment.organizationId,
      payment.recipientId,
    );
    if (!wallet) {
      return this.skip(
        runId,
        payment,
        IntentOutcome.SKIPPED_NO_VERIFIED_WALLET,
        'recipient has no verified payout wallet',
      );
    }

    const line = await this.gateway.trustlineStatus(wallet.address, asset);
    if (!line.accountExists) {
      return this.skip(
        runId,
        payment,
        IntentOutcome.SKIPPED_DESTINATION_MISSING,
        'destination account does not exist',
      );
    }
    if (
      asset.assetType !== ScholarshipAssetType.NATIVE &&
      (!line.hasTrustline || !line.authorized)
    ) {
      return this.skip(
        runId,
        payment,
        IntentOutcome.SKIPPED_MISSING_TRUSTLINE,
        line.hasTrustline
          ? 'destination trustline is not authorized'
          : 'destination has no trustline for the asset',
      );
    }

    const source = await this.gateway.loadAccount(signer.publicKey());
    if (!source) {
      await this.releaseLease(runId, payment, 'treasury account not found');
      return {
        result: intent(
          payment,
          IntentOutcome.ERROR,
          null,
          'treasury account not found',
        ),
        halt: 'treasury account does not exist on the network',
      };
    }

    const attemptNo = (payment.attempts?.length ?? 0) + 1;
    const memo = this.gateway.paymentMemo(payment.id, attemptNo);
    const built = this.gateway.buildPayment({
      source,
      signer,
      destination: wallet.address,
      asset,
      amount: payment.amount,
      memo,
      timeoutSeconds:
        this.config.get<number>('scholarships.submissionTimeoutSeconds') ?? 180,
      feeStroops: this.config.get<number>('scholarships.baseFeeStroops') ?? 100,
    });
    const submittedAt = new Date();

    // Write-ahead: bind the tx to the payment before it can reach the network.
    const bound = await this.paymentModel
      .findOneAndUpdate(
        {
          _id: payment._id,
          status: ScholarshipPaymentStatus.SCHEDULED,
          leaseOwner: runId,
        },
        {
          $set: {
            status: ScholarshipPaymentStatus.SUBMITTED,
            txHash: built.hash,
            destination: wallet.address,
            sourceAccount: signer.publicKey(),
            memo: memo.toString('base64'),
            submittedAt,
            txMaxTime: built.maxTime,
            includedLedger: null,
            confirmations: 0,
            requiredConfirmations:
              asset.requiredConfirmations ??
              this.config.get<number>('scholarships.requiredConfirmations') ??
              1,
            lastError: null,
            leaseOwner: null,
            leaseUntil: null,
          },
          $push: {
            attempts: {
              txHash: built.hash,
              destination: wallet.address,
              sourceAccount: signer.publicKey(),
              submittedAt,
              maxTime: built.maxTime,
              outcome: null,
              error: null,
            },
          },
        },
        { new: true },
      )
      .exec();
    if (!bound) {
      // Cancelled, held (wallet change) or lease lost since we claimed it.
      return {
        result: intent(
          payment,
          IntentOutcome.UNCHANGED,
          null,
          'payment changed during execution; not submitted',
        ),
      };
    }

    const outcome = await this.gateway.submit(built.tx);

    if (outcome.kind === 'included') {
      await this.paymentModel
        .updateOne(
          { _id: bound._id, status: ScholarshipPaymentStatus.SUBMITTED },
          {
            $set: {
              status: ScholarshipPaymentStatus.PENDING,
              includedLedger: outcome.ledger,
              confirmations: 1,
            },
          },
        )
        .exec();
      return { result: intent(bound, IntentOutcome.PENDING, built.hash, null) };
    }

    if (outcome.kind === 'rejected') {
      const failed = await this.paymentModel
        .findOneAndUpdate(
          { _id: bound._id, status: ScholarshipPaymentStatus.SUBMITTED },
          {
            $set: {
              status: ScholarshipPaymentStatus.FAILED,
              lastError: outcome.reason,
              'attempts.$[a].outcome': ScholarshipPaymentStatus.FAILED,
              'attempts.$[a].error': outcome.reason,
            },
          },
          { arrayFilters: [{ 'a.txHash': built.hash }], new: true },
        )
        .exec();
      if (failed) this.emitSettled(failed);
      // A rejection may be a sequence problem; stop rather than cascade.
      return {
        result: intent(bound, IntentOutcome.FAILED, built.hash, outcome.reason),
        halt: /tx_bad_seq/.test(outcome.reason)
          ? 'treasury sequence number out of sync'
          : undefined,
      };
    }

    // Unknown: leave `submitted`; the reconciler settles it by hash or expiry.
    this.logger.warn(
      `Submission of ${built.hash} for payment ${bound.id} is unconfirmed: ${outcome.reason}`,
    );
    return {
      result: intent(
        bound,
        IntentOutcome.SUBMITTED,
        built.hash,
        outcome.reason,
      ),
      halt: 'submission result unknown; halting to protect the sequence number',
    };
  }

  private async skip(
    runId: string,
    payment: ScholarshipPaymentDocument,
    outcome: IntentOutcome,
    detail: string,
  ): Promise<Processed> {
    await this.releaseLease(runId, payment, detail);
    return { result: intent(payment, outcome, null, detail) };
  }

  private async releaseLease(
    runId: string,
    payment: ScholarshipPaymentDocument,
    lastError: string,
  ): Promise<void> {
    await this.paymentModel
      .updateOne(
        { _id: payment._id, leaseOwner: runId },
        { $set: { leaseOwner: null, leaseUntil: null, lastError } },
      )
      .exec();
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

  private get leaseMs(): number {
    return (this.config.get<number>('scholarships.leaseSeconds') ?? 300) * 1000;
  }
}

export function intent(
  payment: ScholarshipPaymentDocument,
  outcome: IntentOutcome,
  txHash: string | null,
  detail: string | null,
): IntentResult {
  return {
    paymentId: payment.id,
    organizationId: payment.organizationId,
    outcome,
    txHash,
    detail,
  };
}

export function summarise(results: IntentResult[]): Record<string, number> {
  return results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
}

export function notStarted(
  kind: DisbursementRunKind,
  reason: string,
): RunReport {
  return {
    runId: null,
    kind,
    started: false,
    haltReason: reason,
    summary: {},
    results: [],
  };
}
