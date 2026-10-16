import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LibraryChargePayment,
  LibraryChargePaymentDocument,
} from '../schemas/library-charge-payment.schema';
import { LedgerService } from './ledger.service';
import { LedgerEntryType, CHARGE_ENTRY_TYPES } from '../enums/ledger-entry-type.enum';
import { PayLibraryChargeDto } from '../dto/pay-library-charge.dto';
import { StellarService } from '../../stellar/stellar.service';
import {
  BusinessRuleException,
  ResourceNotFoundException,
  ResourceConflictException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

export interface PayChargeResult {
  payment: LibraryChargePaymentDocument;
  verified: boolean;
  ledgerEntryId: string | null;
}

/**
 * Settles an eligible library charge using an on-chain Stellar transaction.
 *
 * Flow:
 *   1. Validate the charge entry exists and is a chargeable type.
 *   2. Guard against replay: (chargeEntryId, transactionHash) must be unique.
 *   3. Verify the transaction hash on-chain via StellarService.
 *   4. If verified, post a PAYMENT entry to the ledger and link it.
 *   5. Persist the LibraryChargePayment document as an audit trail.
 */
@Injectable()
export class LibraryChargePaymentService {
  constructor(
    @InjectModel(LibraryChargePayment.name)
    private readonly paymentModel: Model<LibraryChargePaymentDocument>,
    private readonly ledgerService: LedgerService,
    private readonly stellarService: StellarService,
  ) {}

  /**
   * Submit a Stellar payment to settle a library charge.
   *
   * Idempotent: if a document already exists for
   * (chargeEntryId + transactionHash), the existing result is returned
   * without re-verifying or double-posting.
   */
  async payCharge(
    dto: PayLibraryChargeDto,
    submittedBy: string,
  ): Promise<PayChargeResult> {
    // ── 1. Resolve and validate the charge entry ───────────────────────────
    const chargeEntry = await this.ledgerService.getEntry(dto.chargeEntryId);

    if (!CHARGE_ENTRY_TYPES.includes(chargeEntry.entryType)) {
      throw new BusinessRuleException(
        `Ledger entry ${dto.chargeEntryId} is not a chargeable entry (type: ${chargeEntry.entryType})`,
        ErrorCode.BIZ_INVALID_CHARGE_ENTRY,
      );
    }

    if (chargeEntry.currency !== dto.currency) {
      throw new ValidationDomainException(
        `Currency mismatch: charge is in ${chargeEntry.currency}, payment DTO specifies ${dto.currency}`,
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    // Ensure the payment amount does not exceed the charge amount.
    if (dto.amountMinorUnits > chargeEntry.amountMinorUnits) {
      throw new BusinessRuleException(
        `Payment amount ${dto.amountMinorUnits} exceeds the charge amount ${chargeEntry.amountMinorUnits}`,
        ErrorCode.BIZ_PAYMENT_AMOUNT_EXCEEDS_CHARGE,
      );
    }

    // ── 2. Idempotency: return existing record if hash already seen ─────────
    const existing = await this.paymentModel
      .findOne({
        chargeEntryId: dto.chargeEntryId,
        transactionHash: dto.transactionHash,
      })
      .exec();

    if (existing) {
      return {
        payment: existing,
        verified: existing.verified,
        ledgerEntryId: existing.ledgerEntryId?.toString() ?? null,
      };
    }

    // Prevent the same transaction hash from settling a different charge.
    const hashConflict = await this.paymentModel
      .findOne({ transactionHash: dto.transactionHash })
      .exec();

    if (hashConflict) {
      throw new ResourceConflictException(
        `Transaction hash ${dto.transactionHash} has already been applied to charge ${hashConflict.chargeEntryId}`,
        ErrorCode.BIZ_PAYMENT_ALREADY_APPLIED,
      );
    }

    // ── 3. Verify on-chain ─────────────────────────────────────────────────
    const verification = await this.stellarService.verifyPayment({
      transactionHash: dto.transactionHash,
      expectedAmount: dto.amountMinorUnits.toString(),
      expectedDestination: dto.destination,
    });

    // ── 4. Post a PAYMENT ledger entry when verified ───────────────────────
    let ledgerEntryId: string | null = null;

    if (verification.verified) {
      const ledgerEntry = await this.ledgerService.postEntry({
        patronId: chargeEntry.patronId,
        loanId: chargeEntry.loanId,
        entryType: LedgerEntryType.PAYMENT,
        // Payments reduce the balance owed: negative amount.
        amountMinorUnits: -dto.amountMinorUnits,
        currency: dto.currency,
        reason: `Stellar payment: txHash ${dto.transactionHash}`,
        referenceEntryId: dto.chargeEntryId,
        createdBy: submittedBy,
        metadata: {
          transactionHash: dto.transactionHash,
          asset: dto.asset,
          destination: dto.destination,
          memo: dto.memo ?? null,
          stellarTimestamp: verification.timestamp,
        },
      });
      ledgerEntryId = ledgerEntry._id?.toString() ?? null;
    }

    // ── 5. Persist the payment record ──────────────────────────────────────
    const payment = await this.paymentModel.create({
      patronId: chargeEntry.patronId,
      chargeEntryId: dto.chargeEntryId,
      asset: dto.asset,
      amountMinorUnits: dto.amountMinorUnits,
      currency: dto.currency,
      destination: dto.destination,
      memo: dto.memo ?? null,
      transactionHash: dto.transactionHash,
      verified: verification.verified,
      ledgerEntryId: ledgerEntryId ?? null,
      submittedBy,
    });

    return { payment, verified: verification.verified, ledgerEntryId };
  }

  /**
   * List payment records for a patron, newest first.
   */
  async listForPatron(
    patronId: string,
    limit = 50,
  ): Promise<LibraryChargePaymentDocument[]> {
    return this.paymentModel
      .find({ patronId })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .exec();
  }

  /**
   * Retrieve a single payment record by ID.
   */
  async getById(id: string): Promise<LibraryChargePaymentDocument> {
    const doc = await this.paymentModel.findById(id).exec();
    if (!doc) {
      throw new ResourceNotFoundException(
        `Library charge payment ${id} not found`,
        ErrorCode.RES_LIBRARY_CHARGE_PAYMENT_NOT_FOUND,
      );
    }
    return doc;
  }
}
