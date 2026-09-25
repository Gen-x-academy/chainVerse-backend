import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomUUID } from 'crypto';
import { Error as MongooseError, isValidObjectId, Model } from 'mongoose';
import {
  BusinessRuleException,
  DomainException,
  ErrorCode,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors';
import { AppConfig } from '../../config/app.config';
import { fromMinorUnits, toMinorUnits } from '../common/money';
import {
  HorizonClient,
  HorizonTransaction,
} from '../integrations/horizon.client';
import { LedgerQueryService } from '../ledger/ledger-query.service';
import { LedgerService } from '../ledger/ledger.service';
import { ScholarshipProgramDocument } from '../programs/scholarship-program.schema';
import { ScholarshipProgramService } from '../programs/scholarship-program.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { ReconciliationAlertsService } from '../reconciliation/reconciliation-alerts.service';
import {
  PayoutFailedPayload,
  ScholarshipFinanceEvents,
} from '../scholarship-finance.events';
import {
  CreatePayoutDto,
  ListPayoutsQuery,
  MarkAttemptSubmittedDto,
  ReportAttemptResultDto,
  RetryPayoutDto,
} from './dto/payout.dto';
import {
  classifyPayoutFailure,
  PayoutFailureDiagnosis,
} from './payout-failure.classifier';
import {
  PayoutAttempt,
  PayoutIntent,
  PayoutIntentDocument,
} from './payout-intent.schema';

/** Time after an envelope's time bound before it is considered definitively dead. */
const EXPIRY_GRACE_MS = 60_000;
const OPEN_STATUSES = ['pending', 'submitted', 'failed'];

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @InjectModel(PayoutIntent.name)
    private readonly payoutModel: Model<PayoutIntentDocument>,
    private readonly programs: ScholarshipProgramService,
    private readonly ledger: LedgerService,
    private readonly ledgerQuery: LedgerQueryService,
    private readonly receipts: ReceiptsService,
    private readonly alerts: ReconciliationAlertsService,
    private readonly horizon: HorizonClient,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  // ── operator API ───────────────────────────────────────────────────────────

  async create(
    program: ScholarshipProgramDocument,
    dto: CreatePayoutDto,
    userId: string,
  ) {
    const amount = toMinorUnits(dto.amount);
    const programId = String(program._id);

    const existing = await this.payoutModel
      .findOne({
        organizationId: program.organizationId,
        awardId: dto.awardId,
        installmentId: dto.installmentId,
      })
      .exec();
    if (existing) {
      const same =
        existing.programId === programId &&
        existing.amount === amount.toString() &&
        existing.recipientId === dto.recipientId;
      if (!same) {
        throw new ResourceConflictException(
          'A payout already exists for this award installment with different details',
        );
      }
      return this.present(existing);
    }

    // The award must have enough unpaid, awarded balance to cover this and any
    // other open installments.
    const [payable, open] = await Promise.all([
      this.ledgerQuery.awardPayable(programId, dto.awardId),
      this.payoutModel
        .find(
          { programId, awardId: dto.awardId, status: { $in: OPEN_STATUSES } },
          { amount: 1 },
        )
        .lean()
        .exec(),
    ]);
    const committed = open.reduce((acc, p) => acc + BigInt(p.amount), 0n);
    if (payable - committed < amount) {
      throw new BusinessRuleException(
        `Award ${dto.awardId} has ${fromMinorUnits(payable - committed)} ${program.asset.code} payable; cannot pay ${dto.amount}`,
        ErrorCode.BIZ_INSUFFICIENT_FUNDS,
      );
    }

    const intent = new this.payoutModel({
      organizationId: program.organizationId,
      programId,
      awardId: dto.awardId,
      installmentId: dto.installmentId,
      recipientId: dto.recipientId,
      destination: dto.destination,
      asset: program.asset,
      network: program.network,
      amount: amount.toString(),
      memo: '',
      status: 'pending',
      createdBy: userId,
    });
    intent.memo = this.memoFor(intent.id);
    this.pushAttempt(intent, userId);

    try {
      await intent.save();
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        throw new ResourceConflictException(
          'A payout already exists for this award installment',
        );
      }
      throw err;
    }
    this.emitAttemptReady(intent);
    return this.present(intent);
  }

  async list(program: ScholarshipProgramDocument, q: ListPayoutsQuery) {
    const filter: Record<string, unknown> = { programId: String(program._id) };
    if (q.status) filter.status = q.status;
    if (q.awardId) filter.awardId = q.awardId;
    const intents = await this.payoutModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(q.limit ?? 50)
      .exec();
    return intents.map((i) => this.present(i));
  }

  async get(program: ScholarshipProgramDocument, payoutId: string) {
    return this.present(await this.load(payoutId, String(program._id)));
  }

  /**
   * Operator-initiated retry after a failure. Creates a new attempt (fresh
   * envelope) under the same intent. Award eligibility is untouched.
   */
  async retry(
    program: ScholarshipProgramDocument,
    payoutId: string,
    dto: RetryPayoutDto,
    userId: string,
  ) {
    const intent = await this.load(payoutId, String(program._id));
    this.assertRetryable(intent);

    if (
      intent.lastFailure?.category === 'bad_destination' &&
      (!dto.destination || dto.destination === intent.destination)
    ) {
      throw new BusinessRuleException(
        'The last attempt failed with a bad destination; provide a corrected destination',
        ErrorCode.BIZ_PAYOUT_RETRY_NOT_ALLOWED,
      );
    }
    if (dto.destination && dto.destination !== intent.destination) {
      intent.destinationHistory.push({
        from: intent.destination,
        to: dto.destination,
        changedBy: userId,
        changedAt: new Date(),
        note: dto.note,
      });
      intent.destination = dto.destination;
    }

    await this.createNextAttempt(intent, userId);
    return this.present(intent);
  }

  async cancel(
    program: ScholarshipProgramDocument,
    payoutId: string,
    reason: string,
  ) {
    const intent = await this.load(payoutId, String(program._id));
    const current = intent.attempts.at(-1);
    if (
      !['pending', 'failed'].includes(intent.status) ||
      current?.status === 'submitted'
    ) {
      throw new BusinessRuleException(
        `A ${intent.status} payout cannot be cancelled`,
        ErrorCode.BIZ_PAYOUT_INVALID_STATE,
      );
    }
    if (current?.status === 'ready') current.status = 'abandoned';
    intent.status = 'cancelled';
    intent.cancelledReason = reason;
    intent.nextRetryAt = null;
    intent.markModified('attempts');
    await this.save(intent);
    return this.present(intent);
  }

  // ── signer API ─────────────────────────────────────────────────────────────

  /** Attempts waiting for the custody signer to build and submit an envelope. */
  async readyForSigning(limit = 50) {
    const intents = await this.payoutModel
      .find({ status: 'pending' })
      .sort({ updatedAt: 1 })
      .limit(limit)
      .exec();
    const now = Date.now();
    const out: unknown[] = [];
    for (const intent of intents) {
      const attempt = intent.attempts.at(-1);
      if (
        !attempt ||
        attempt.status !== 'ready' ||
        attempt.validUntil.getTime() <= now
      )
        continue;
      const program = await this.programs.getById(intent.programId);
      out.push({
        payoutId: intent.id,
        attemptId: attempt.attemptId,
        attemptNumber: attempt.number,
        network: intent.network,
        sourceAccount: program.treasuryAccount,
        destination: attempt.destination,
        asset: intent.asset,
        amount: fromMinorUnits(BigInt(intent.amount)),
        memo: intent.memo,
        /** Use as the envelope's maxTime time bound (unix seconds). */
        maxTime: Math.floor(attempt.validUntil.getTime() / 1000),
      });
    }
    return out;
  }

  async markSubmitted(
    payoutId: string,
    attemptId: string,
    dto: MarkAttemptSubmittedDto,
  ) {
    const intent = await this.load(payoutId);
    const attempt = this.currentAttempt(intent, attemptId);
    if (attempt.status !== 'ready') {
      if (
        attempt.status === 'submitted' &&
        attempt.envelopeHash === dto.envelopeHash
      ) {
        return this.present(intent);
      }
      throw new BusinessRuleException(
        `Attempt is ${attempt.status}`,
        ErrorCode.BIZ_PAYOUT_INVALID_STATE,
      );
    }
    if (attempt.validUntil.getTime() <= Date.now()) {
      throw new BusinessRuleException(
        'Attempt time bound has passed; wait for a fresh attempt',
        ErrorCode.BIZ_PAYOUT_INVALID_STATE,
      );
    }
    const reused = await this.payoutModel
      .exists({
        $or: [
          { 'attempts.envelopeHash': dto.envelopeHash },
          { 'attempts.transactionHash': dto.transactionHash },
        ],
      })
      .exec();
    if (reused) {
      throw new ResourceConflictException(
        'Every attempt must use a new transaction envelope',
        ErrorCode.BIZ_PAYOUT_ENVELOPE_REUSED,
      );
    }

    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    attempt.envelopeHash = dto.envelopeHash;
    attempt.transactionHash = dto.transactionHash;
    intent.status = 'submitted';
    intent.markModified('attempts');
    await this.save(intent);
    return this.present(intent);
  }

  async reportResult(
    payoutId: string,
    attemptId: string,
    dto: ReportAttemptResultDto,
  ) {
    const intent = await this.load(payoutId);
    const attempt = this.currentAttempt(intent, attemptId);

    if (attempt.status === 'succeeded' || attempt.status === 'failed') {
      // Duplicate report: answer idempotently if consistent.
      if (attempt.status === dto.outcome) return this.present(intent);
      throw new BusinessRuleException(
        `Attempt already ${attempt.status}`,
        ErrorCode.BIZ_PAYOUT_INVALID_STATE,
      );
    }

    if (dto.outcome === 'failed') {
      await this.recordFailure(
        intent,
        attempt,
        classifyPayoutFailure(dto.resultCodes, dto.signerError),
        dto,
      );
      return this.present(intent);
    }

    if (
      attempt.status !== 'submitted' ||
      attempt.transactionHash !== dto.transactionHash
    ) {
      throw new BusinessRuleException(
        'Success must reference the transaction hash recorded at submission',
        ErrorCode.BIZ_PAYOUT_INVALID_STATE,
      );
    }
    const tx = await this.horizon.getTransaction(
      intent.network,
      dto.transactionHash!,
    );
    if (!tx || !tx.successful || tx.memo !== intent.memo) {
      throw new DomainException(
        'Transaction is not (yet) visible as a successful payment on Horizon; report again once confirmed',
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.BIZ_PAYOUT_INVALID_STATE,
      );
    }
    await this.complete(intent, attempt, tx);
    return this.present(intent);
  }

  // ── jobs ───────────────────────────────────────────────────────────────────

  /** Creates new attempts for failures whose category allows automatic retry. */
  async runAutoRetries(limit = 50) {
    const due = await this.payoutModel
      .find({ status: 'failed', nextRetryAt: { $ne: null, $lte: new Date() } })
      .limit(limit)
      .exec();
    for (const intent of due) {
      try {
        await this.createNextAttempt(intent, 'system:payout-retry-job');
      } catch (err) {
        this.logger.warn(
          `Auto-retry skipped for payout ${intent.id}: ${String(err)}`,
        );
      }
    }
    return due.length;
  }

  /**
   * Resolves attempts whose time bound has passed: ready-but-never-submitted
   * attempts expire; submitted ones are checked on Horizon so an envelope that
   * did land is recorded as a success rather than retried.
   */
  async sweepExpiredAttempts(limit = 50) {
    const cutoff = new Date(Date.now() - EXPIRY_GRACE_MS);
    const stale = await this.payoutModel
      .find({
        status: { $in: ['pending', 'submitted'] },
        'attempts.validUntil': { $lt: cutoff },
      })
      .limit(limit)
      .exec();

    for (const intent of stale) {
      const attempt = intent.attempts.at(-1);
      if (!attempt || attempt.validUntil >= cutoff) continue;
      try {
        if (attempt.status === 'ready') {
          attempt.status = 'abandoned';
          await this.recordFailure(
            intent,
            attempt,
            classifyPayoutFailure({ transaction: 'tx_too_late' }),
            {
              signerError: 'Attempt was never submitted before its time bound',
            },
          );
        } else if (attempt.status === 'submitted' && attempt.transactionHash) {
          const tx = await this.horizon.getTransaction(
            intent.network,
            attempt.transactionHash,
          );
          if (tx?.successful && tx.memo === intent.memo) {
            await this.complete(intent, attempt, tx);
          } else if (tx) {
            await this.recordFailure(
              intent,
              attempt,
              classifyPayoutFailure(
                {},
                'Transaction failed on-chain; inspect it on Horizon',
              ),
              {},
            );
          } else {
            await this.recordFailure(
              intent,
              attempt,
              classifyPayoutFailure({ transaction: 'tx_too_late' }),
              {},
            );
          }
        }
      } catch (err) {
        this.logger.warn(
          `Expiry sweep failed for payout ${intent.id}: ${String(err)}`,
        );
      }
    }
    return stale.length;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async complete(
    intent: PayoutIntentDocument,
    attempt: PayoutAttempt,
    tx: HorizonTransaction,
  ) {
    const program = await this.programs.getById(intent.programId);

    // Record the outflow. Idempotent by reference, so a repeated report is safe.
    try {
      const { entry } = await this.ledger.post(
        program,
        {
          reference: `payout:${intent.id}`,
          entryType: 'disbursement',
          amount: fromMinorUnits(BigInt(intent.amount)),
          awardId: intent.awardId,
          installmentId: intent.installmentId,
          payoutIntentId: intent.id,
          transactionHash: tx.hash,
          effectiveAt: new Date(tx.createdAt),
          description: `Payout of installment ${intent.installmentId}`,
        },
        'system:payouts',
      );
      intent.ledgerEntryId = entry.id;
    } catch (err) {
      // The money has left the treasury; never lose that fact. Mark the payout
      // succeeded and raise a critical alert so finance reconciles the ledger.
      this.logger.error(
        `Disbursement posting failed for payout ${intent.id}: ${String(err)}`,
      );
      await this.alerts.raise(intent.organizationId, intent.programId, {
        type: 'payout_posting_failed',
        severity: 'critical',
        message: `Payout ${intent.id} succeeded on-chain but its disbursement entry could not be posted.`,
        details: {
          payoutId: intent.id,
          transactionHash: tx.hash,
          error: String(err),
        },
      });
    }

    const receipt = await this.receipts.issue(program, intent, attempt, tx);

    attempt.status = 'succeeded';
    attempt.ledger = tx.ledger;
    attempt.completedAt = new Date(tx.createdAt);
    intent.status = 'succeeded';
    intent.receiptId = String(receipt._id);
    intent.nextRetryAt = null;
    intent.markModified('attempts');
    await this.save(intent);

    this.events.emit(ScholarshipFinanceEvents.PAYOUT_SUCCEEDED, {
      organizationId: intent.organizationId,
      programId: intent.programId,
      payoutId: intent.id,
      receiptId: intent.receiptId,
    });
  }

  private async recordFailure(
    intent: PayoutIntentDocument,
    attempt: PayoutAttempt,
    diagnosis: PayoutFailureDiagnosis,
    report: Partial<ReportAttemptResultDto>,
  ) {
    if (attempt.status !== 'abandoned') attempt.status = 'failed';
    attempt.failure = diagnosis;
    attempt.resultCodes = report.resultCodes;
    attempt.signerError = report.signerError;
    attempt.completedAt = new Date();

    const remaining = this.maxAttempts() - intent.attempts.length;
    intent.status = 'failed';
    intent.lastFailure = {
      ...diagnosis,
      retryable: diagnosis.retryable && remaining > 0,
    };
    intent.nextRetryAt =
      diagnosis.autoRetry && remaining > 0
        ? new Date(
            Date.now() +
              Math.min(60_000 * 2 ** (intent.attempts.length - 1), 3_600_000),
          )
        : null;
    intent.markModified('attempts');
    await this.save(intent);

    this.logger.warn(
      `Payout ${intent.id} attempt ${attempt.number} failed: ${diagnosis.category} (${remaining} attempts left)`,
    );
    const payload: PayoutFailedPayload = {
      organizationId: intent.organizationId,
      programId: intent.programId,
      payoutId: intent.id,
      awardId: intent.awardId,
      category: diagnosis.category,
      operatorAction: diagnosis.operatorAction,
      retryable: intent.lastFailure.retryable,
    };
    this.events.emit(ScholarshipFinanceEvents.PAYOUT_FAILED, payload);
  }

  private async createNextAttempt(intent: PayoutIntentDocument, by: string) {
    this.assertRetryable(intent);
    await this.assertPreviousEnvelopeDead(intent);
    this.pushAttempt(intent, by);
    intent.status = 'pending';
    intent.nextRetryAt = null;
    await this.save(intent);
    this.emitAttemptReady(intent);
  }

  private assertRetryable(intent: PayoutIntentDocument) {
    if (intent.status !== 'failed') {
      throw new BusinessRuleException(
        `Only failed payouts can be retried (status: ${intent.status})`,
        ErrorCode.BIZ_PAYOUT_RETRY_NOT_ALLOWED,
      );
    }
    if (
      intent.attempts.length >= this.maxAttempts() ||
      !intent.lastFailure?.retryable
    ) {
      throw new BusinessRuleException(
        'Retry limit reached for this payout; cancel it and create a new installment payout after review',
        ErrorCode.BIZ_PAYOUT_RETRY_NOT_ALLOWED,
      );
    }
  }

  /**
   * Guarantees a previous envelope can no longer land before another is
   * created, so one intent can never be paid twice.
   */
  private async assertPreviousEnvelopeDead(intent: PayoutIntentDocument) {
    const previous = intent.attempts.at(-1);
    if (!previous?.transactionHash) return;
    const tx = await this.horizon.getTransaction(
      intent.network,
      previous.transactionHash,
    );
    if (tx?.successful) {
      throw new BusinessRuleException(
        `Transaction ${previous.transactionHash} for this payout succeeded on-chain; it will be recorded by the expiry sweep`,
        ErrorCode.BIZ_PAYOUT_RETRY_NOT_ALLOWED,
      );
    }
    // A transaction included in a ledger as failed is final. One that is not
    // on-chain could still land until its time bound passes.
    if (!tx && previous.validUntil.getTime() + EXPIRY_GRACE_MS > Date.now()) {
      throw new BusinessRuleException(
        `The previous envelope is valid until ${previous.validUntil.toISOString()}; retry after it expires`,
        ErrorCode.BIZ_PAYOUT_RETRY_NOT_ALLOWED,
      );
    }
  }

  private pushAttempt(intent: PayoutIntentDocument, by: string) {
    const ttl =
      this.config.get<AppConfig['scholarshipFinance']>('scholarshipFinance')
        ?.payoutEnvelopeTtlSeconds ?? 300;
    const now = new Date();
    intent.attempts.push({
      attemptId: randomUUID(),
      number: intent.attempts.length + 1,
      status: 'ready',
      destination: intent.destination,
      validUntil: new Date(now.getTime() + ttl * 1000),
      createdAt: now,
      createdBy: by,
    });
    intent.markModified('attempts');
  }

  private currentAttempt(
    intent: PayoutIntentDocument,
    attemptId: string,
  ): PayoutAttempt {
    const attempt = intent.attempts.find((a) => a.attemptId === attemptId);
    if (!attempt) {
      throw new ResourceNotFoundException(
        'Payout attempt not found',
        ErrorCode.RES_PAYOUT_NOT_FOUND,
      );
    }
    if (
      attempt !== intent.attempts.at(-1) &&
      !['succeeded', 'failed'].includes(attempt.status)
    ) {
      throw new BusinessRuleException(
        'Attempt has been superseded',
        ErrorCode.BIZ_PAYOUT_INVALID_STATE,
      );
    }
    return attempt;
  }

  private async load(payoutId: string, programId?: string) {
    const filter: Record<string, unknown> = { _id: payoutId };
    if (programId) filter.programId = programId;
    const intent = isValidObjectId(payoutId)
      ? await this.payoutModel.findOne(filter).exec()
      : null;
    if (!intent) {
      throw new ResourceNotFoundException(
        'Payout not found',
        ErrorCode.RES_PAYOUT_NOT_FOUND,
      );
    }
    return intent;
  }

  private async save(intent: PayoutIntentDocument) {
    try {
      await intent.save();
    } catch (err) {
      if (err instanceof MongooseError.VersionError) {
        throw new ResourceConflictException(
          'Payout was modified concurrently; reload and retry',
          ErrorCode.BIZ_DUPLICATE_REQUEST,
        );
      }
      throw err;
    }
  }

  private maxAttempts() {
    return (
      this.config.get<AppConfig['scholarshipFinance']>('scholarshipFinance')
        ?.payoutMaxAttempts ?? 5
    );
  }

  /** 28-byte Stellar text memo, stable for every attempt of the intent. */
  private memoFor(intentId: string) {
    return `SCH-${createHash('sha256').update(intentId).digest('hex').slice(0, 24)}`;
  }

  private emitAttemptReady(intent: PayoutIntentDocument) {
    this.events.emit(ScholarshipFinanceEvents.PAYOUT_ATTEMPT_READY, {
      payoutId: intent.id,
      attemptId: intent.attempts.at(-1)?.attemptId,
    });
  }

  present(intent: PayoutIntentDocument) {
    const remaining = Math.max(this.maxAttempts() - intent.attempts.length, 0);
    return {
      id: intent.id,
      organizationId: intent.organizationId,
      programId: intent.programId,
      awardId: intent.awardId,
      installmentId: intent.installmentId,
      recipientId: intent.recipientId,
      destination: intent.destination,
      asset: intent.asset,
      network: intent.network,
      amount: fromMinorUnits(BigInt(intent.amount)),
      memo: intent.memo,
      status: intent.status,
      ledgerEntryId: intent.ledgerEntryId,
      receiptId: intent.receiptId,
      cancelledReason: intent.cancelledReason,
      destinationHistory: intent.destinationHistory,
      diagnostics: {
        lastFailure: intent.lastFailure ?? null,
        attemptsUsed: intent.attempts.length,
        attemptsRemaining: remaining,
        nextAutomaticRetryAt: intent.nextRetryAt ?? null,
        canRetry:
          intent.status === 'failed' &&
          remaining > 0 &&
          !!intent.lastFailure?.retryable,
        /** Failed/cancelled payouts never reduce the award's payable balance. */
        awardPayableRetained: intent.status !== 'succeeded',
      },
      attempts: intent.attempts.map((a) => ({
        attemptId: a.attemptId,
        number: a.number,
        status: a.status,
        destination: a.destination,
        validUntil: a.validUntil,
        createdAt: a.createdAt,
        createdBy: a.createdBy,
        submittedAt: a.submittedAt,
        envelopeHash: a.envelopeHash,
        transactionHash: a.transactionHash,
        resultCodes: a.resultCodes,
        signerError: a.signerError,
        failure: a.failure,
        ledger: a.ledger,
        completedAt: a.completedAt,
      })),
      createdAt: (intent as unknown as { createdAt?: Date }).createdAt,
      updatedAt: (intent as unknown as { updatedAt?: Date }).updatedAt,
    };
  }
}
