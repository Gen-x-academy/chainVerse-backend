import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LostItem,
  LostItemDocument,
  LostItemStatus,
} from '../schemas/lost-item.schema';
import {
  BookCopy,
  BookCopyDocument,
  CopyPhysicalStatus,
} from '../schemas/book-copy.schema';
import { Loan, LoanDocument, LoanStatus, CopyStatus } from '../schemas/loan.schema';
import { Hold, HoldDocument } from '../schemas/hold.schema';
import { LedgerService } from './ledger.service';
import { LedgerEntryType } from '../enums/ledger-entry-type.enum';
import { DeclareLostItemDto, ProcessLostItemReturnDto } from '../dto/lost-item.dto';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

/**
 * Manages the lost-item declaration workflow:
 *
 *   1. Declare a copy lost (#1038) — marks the copy LOST, cancels any active
 *      hold on it, posts LOST_ITEM_FEE and REPLACEMENT_COST_FEE ledger entries.
 *   2. Process a late return — reverses the REPLACEMENT_COST_FEE via a
 *      compensating REPLACEMENT_COST_REVERSAL entry (processing fee is
 *      non-refundable per policy), restores the copy to AVAILABLE.
 */
@Injectable()
export class LostItemService {
  private readonly logger = new Logger(LostItemService.name);

  constructor(
    @InjectModel(LostItem.name)
    private readonly lostItemModel: Model<LostItemDocument>,
    @InjectModel(BookCopy.name)
    private readonly copyModel: Model<BookCopyDocument>,
    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,
    @InjectModel(Hold.name)
    private readonly holdModel: Model<HoldDocument>,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Declare a copy lost.
   *
   * Guards:
   *  - The loan must exist and be ACTIVE or OVERDUE (not already RETURNED).
   *  - A LostItem record must not already exist for the same loan.
   *
   * Side effects:
   *  - Sets Loan.copyStatus = LOST.
   *  - Sets BookCopy.status = LOST.
   *  - Cancels any active hold on that copy.
   *  - Posts LOST_ITEM_FEE and REPLACEMENT_COST_FEE to the ledger.
   */
  async declareLost(
    dto: DeclareLostItemDto,
    declaredBy: string,
  ): Promise<LostItemDocument> {
    // ── 1. Resolve and validate the loan ──────────────────────────────────
    const loan = await this.loanModel.findById(dto.loanId).exec();
    if (!loan) {
      throw new ResourceNotFoundException(
        `Loan ${dto.loanId} not found`,
        ErrorCode.RES_LOAN_NOT_FOUND,
      );
    }

    if (loan.status === LoanStatus.RETURNED) {
      throw new BusinessRuleException(
        `Loan ${dto.loanId} has already been returned and cannot be declared lost`,
        ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
      );
    }

    // ── 2. Guard against duplicate declaration ────────────────────────────
    const existing = await this.lostItemModel
      .findOne({ loanId: dto.loanId })
      .exec();

    if (existing) {
      throw new ResourceConflictException(
        `Loan ${dto.loanId} has already been declared lost (lostItem: ${existing._id.toString()})`,
        ErrorCode.BIZ_LOST_ITEM_ALREADY_DECLARED,
      );
    }

    // ── 3. Resolve the physical copy ──────────────────────────────────────
    // The copy id is stored on the loan's bookId relationship; we use
    // copyStatus field to track per-copy state. We resolve the BookCopy
    // document via barcode/loan association from the loan's bookId.
    // For simplicity, we query by the most recently checked-out copy
    // associated with this loan's bookId that is currently checked_out.
    const copy = await this.copyModel
      .findOne({
        bookId: loan.bookId,
        status: CopyPhysicalStatus.CHECKED_OUT,
      })
      .exec();

    if (!copy) {
      this.logger.warn(
        `No checked-out copy found for loan ${dto.loanId}, bookId ${loan.bookId.toString()}. ` +
          `Proceeding with declaration without a resolved copy.`,
      );
    }

    // ── 4. Update loan copy status ────────────────────────────────────────
    await this.loanModel.findByIdAndUpdate(dto.loanId, {
      $set: { copyStatus: CopyStatus.LOST },
    });

    // ── 5. Mark the physical copy LOST ────────────────────────────────────
    if (copy) {
      await this.copyModel.findByIdAndUpdate(copy._id, {
        $set: { status: CopyPhysicalStatus.LOST },
      });
    }

    // ── 6. Cancel any active hold on this copy ────────────────────────────
    if (copy) {
      const cancelledHolds = await this.holdModel.updateMany(
        { copyId: copy._id, status: 'active' },
        { $set: { status: 'cancelled', cancelledAt: new Date() } },
      );
      if (cancelledHolds.modifiedCount > 0) {
        this.logger.log(
          `Cancelled ${cancelledHolds.modifiedCount} active hold(s) for copy ${copy._id.toString()} (declared lost)`,
        );
      }
    }

    // ── 7. Post ledger entries ────────────────────────────────────────────
    let processingFeeEntryId: string | null = null;
    let replacementCostEntryId: string | null = null;

    if (dto.processingFeeMinorUnits > 0) {
      const feeEntry = await this.ledgerService.postEntry({
        patronId: loan.patronId,
        loanId: dto.loanId,
        entryType: LedgerEntryType.LOST_ITEM_FEE,
        amountMinorUnits: dto.processingFeeMinorUnits,
        currency: dto.currency,
        reason: `Lost item processing fee for loan ${dto.loanId}${dto.declarationNote ? ': ' + dto.declarationNote : ''}`,
        createdBy: declaredBy,
        metadata: {
          copyId: copy?._id?.toString() ?? null,
          bookId: loan.bookId.toString(),
        },
      });
      processingFeeEntryId = feeEntry._id?.toString() ?? null;
    }

    if (dto.replacementCostMinorUnits > 0) {
      const replacementEntry = await this.ledgerService.postEntry({
        patronId: loan.patronId,
        loanId: dto.loanId,
        entryType: LedgerEntryType.REPLACEMENT_COST_FEE,
        amountMinorUnits: dto.replacementCostMinorUnits,
        currency: dto.currency,
        reason: `Replacement cost for lost copy, loan ${dto.loanId}`,
        createdBy: declaredBy,
        metadata: {
          copyId: copy?._id?.toString() ?? null,
          bookId: loan.bookId.toString(),
        },
      });
      replacementCostEntryId = replacementEntry._id?.toString() ?? null;
    }

    // ── 8. Persist the LostItem record ────────────────────────────────────
    return this.lostItemModel.create({
      patronId: loan.patronId,
      copyId: copy?._id ?? null,
      loanId: dto.loanId,
      status: LostItemStatus.DECLARED,
      processingFeeMinorUnits: dto.processingFeeMinorUnits,
      replacementCostMinorUnits: dto.replacementCostMinorUnits,
      currency: dto.currency,
      processingFeeEntryId: processingFeeEntryId ?? null,
      replacementCostEntryId: replacementCostEntryId ?? null,
      reversalEntryId: null,
      declaredBy,
      declarationNote: dto.declarationNote ?? null,
      returnedAt: null,
      returnProcessedBy: null,
    });
  }

  /**
   * Process a late return of a copy that was previously declared lost.
   *
   * Policy rule: only the REPLACEMENT_COST_FEE is reversible; the
   * LOST_ITEM_FEE (processing) is always retained.
   *
   * Side effects:
   *  - Posts a REPLACEMENT_COST_REVERSAL compensating ledger entry.
   *  - Sets BookCopy.status = AVAILABLE.
   *  - Transitions LostItem.status to RETURNED.
   */
  async processReturn(
    lostItemId: string,
    dto: ProcessLostItemReturnDto,
    processedBy: string,
  ): Promise<LostItemDocument> {
    const lostItem = await this.lostItemModel.findById(lostItemId).exec();
    if (!lostItem) {
      throw new ResourceNotFoundException(
        `Lost item record ${lostItemId} not found`,
        ErrorCode.RES_LOST_ITEM_NOT_FOUND,
      );
    }

    if (lostItem.status !== LostItemStatus.DECLARED) {
      throw new BusinessRuleException(
        `Lost item ${lostItemId} is already in status '${lostItem.status}' and cannot be processed again`,
        ErrorCode.BIZ_LOST_ITEM_ALREADY_PROCESSED,
      );
    }

    // ── 1. Post replacement cost reversal if applicable ───────────────────
    let reversalEntryId: string | null = null;

    if (
      lostItem.replacementCostMinorUnits > 0 &&
      lostItem.replacementCostEntryId
    ) {
      const reversalEntry = await this.ledgerService.postEntry({
        patronId: lostItem.patronId,
        loanId: lostItem.loanId.toString(),
        entryType: LedgerEntryType.REPLACEMENT_COST_REVERSAL,
        // Negative amount reduces the patron's outstanding balance.
        amountMinorUnits: -lostItem.replacementCostMinorUnits,
        currency: lostItem.currency,
        reason:
          `Replacement cost reversed: copy returned late for lost item ${lostItemId}` +
          (dto.note ? `: ${dto.note}` : ''),
        referenceEntryId: lostItem.replacementCostEntryId.toString(),
        createdBy: processedBy,
        metadata: {
          lostItemId,
          copyId: lostItem.copyId?.toString() ?? null,
        },
      });
      reversalEntryId = reversalEntry._id?.toString() ?? null;
    }

    // ── 2. Restore copy to AVAILABLE ─────────────────────────────────────
    if (lostItem.copyId) {
      await this.copyModel.findByIdAndUpdate(lostItem.copyId, {
        $set: { status: CopyPhysicalStatus.AVAILABLE },
      });
    }

    // ── 3. Update the LostItem record ─────────────────────────────────────
    const updated = await this.lostItemModel
      .findByIdAndUpdate(
        lostItemId,
        {
          $set: {
            status: LostItemStatus.RETURNED,
            reversalEntryId: reversalEntryId ?? null,
            returnedAt: new Date(),
            returnProcessedBy: processedBy,
          },
        },
        { new: true },
      )
      .exec();

    return updated!;
  }

  /** Retrieve a single lost-item record by its ID. */
  async getById(id: string): Promise<LostItemDocument> {
    const doc = await this.lostItemModel.findById(id).exec();
    if (!doc) {
      throw new ResourceNotFoundException(
        `Lost item record ${id} not found`,
        ErrorCode.RES_LOST_ITEM_NOT_FOUND,
      );
    }
    return doc;
  }

  /** List lost-item records for a patron, newest first. */
  async listForPatron(
    patronId: string,
    status?: LostItemStatus,
    limit = 50,
  ): Promise<LostItemDocument[]> {
    const filter: Record<string, unknown> = { patronId };
    if (status) filter['status'] = status;

    return this.lostItemModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .exec();
  }
}
