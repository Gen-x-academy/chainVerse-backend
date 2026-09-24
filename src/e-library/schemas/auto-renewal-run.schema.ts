import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AutoRenewalRunDocument = HydratedDocument<AutoRenewalRun>;

export type AutoRenewalDecision = 'renewed' | 'declined';

/**
 * One claim ticket per (loan, run date). The unique index below is the
 * locking mechanism: inserting a duplicate throws E11000, which the job
 * treats as "already claimed by another run/instance" and skips — giving
 * idempotent, exactly-once-per-day processing without a Redis lock.
 */
@Schema({ timestamps: true, collection: 'library_auto_renewal_runs' })
export class AutoRenewalRun {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Loan' })
  loanId: Types.ObjectId;

  /** Calendar date (YYYY-MM-DD, UTC) the auto-renewal job ran on. */
  @Prop({ required: true })
  runDate: string;

  @Prop({ enum: ['renewed', 'declined'] })
  decision?: AutoRenewalDecision;

  @Prop()
  reason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AutoRenewalRunSchema =
  SchemaFactory.createForClass(AutoRenewalRun);
AutoRenewalRunSchema.index({ loanId: 1, runDate: 1 }, { unique: true });
