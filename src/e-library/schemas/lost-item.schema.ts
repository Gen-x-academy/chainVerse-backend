import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LostItemDocument = HydratedDocument<LostItem>;

export enum LostItemStatus {
  /** Declared lost; replacement cost has been charged to the patron. */
  DECLARED = 'declared',
  /** The copy was returned after being declared lost; charges may be partially reversed. */
  RETURNED = 'returned',
  /** Charges have been waived or reconciled and the case is closed. */
  CLOSED = 'closed',
}

/**
 * Tracks the lifecycle of a copy that has been declared lost.
 *
 * On declaration:
 *   - The BookCopy status is set to LOST.
 *   - Any active hold on that copy is cancelled.
 *   - Two LedgerEntries are posted: LOST_ITEM_FEE (processing) and
 *     REPLACEMENT_COST_FEE (item price).
 *
 * On late return:
 *   - A compensating REPLACEMENT_COST_REVERSAL entry is posted for the
 *     replacement cost only if policy allows it (processingFeeNonRefundable
 *     is always true per policy).
 *   - The BookCopy status is restored to AVAILABLE.
 *   - `status` transitions to RETURNED.
 */
@Schema({ timestamps: true, collection: 'library_lost_items' })
export class LostItem {
  /** Patron who had the copy at the time of declaration. */
  @Prop({ required: true, index: true })
  patronId: string;

  /** Copy that was declared lost. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'BookCopy', index: true })
  copyId: Types.ObjectId;

  /** The loan associated with this lost declaration. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Loan', index: true })
  loanId: Types.ObjectId;

  @Prop({ required: true, enum: LostItemStatus, default: LostItemStatus.DECLARED })
  status: LostItemStatus;

  /** Processing/administrative fee in minor currency units. Non-refundable. */
  @Prop({ required: true, min: 0 })
  processingFeeMinorUnits: number;

  /** Replacement cost of the book in minor currency units. */
  @Prop({ required: true, min: 0 })
  replacementCostMinorUnits: number;

  /** ISO 4217 currency code for both fees. */
  @Prop({ required: true })
  currency: string;

  /** LedgerEntry ID for the LOST_ITEM_FEE (processing fee) charge. */
  @Prop({ type: Types.ObjectId, ref: 'LedgerEntry', default: null })
  processingFeeEntryId: Types.ObjectId | null;

  /** LedgerEntry ID for the REPLACEMENT_COST_FEE charge. */
  @Prop({ type: Types.ObjectId, ref: 'LedgerEntry', default: null })
  replacementCostEntryId: Types.ObjectId | null;

  /** LedgerEntry ID for the REPLACEMENT_COST_REVERSAL (if returned). */
  @Prop({ type: Types.ObjectId, ref: 'LedgerEntry', default: null })
  reversalEntryId: Types.ObjectId | null;

  /** Staff member or system actor that declared the item lost. */
  @Prop({ required: true })
  declaredBy: string;

  /** Reason/notes supplied at the time of declaration. */
  @Prop({ type: String, default: null })
  declarationNote: string | null;

  /** Date the copy was actually returned (if returned after declaration). */
  @Prop({ type: Date, default: null })
  returnedAt: Date | null;

  /** Staff member who processed the late return. */
  @Prop({ type: String, default: null })
  returnProcessedBy: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LostItemSchema = SchemaFactory.createForClass(LostItem);
LostItemSchema.index({ patronId: 1, status: 1 });
LostItemSchema.index({ copyId: 1, status: 1 });
LostItemSchema.index({ loanId: 1 }, { unique: true });
