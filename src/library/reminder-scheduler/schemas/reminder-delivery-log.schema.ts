import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReminderDeliveryLogDocument = HydratedDocument<ReminderDeliveryLog>;

export type ReminderType = 'due-soon' | 'overdue';

@Schema({ timestamps: true })
export class ReminderDeliveryLog {
  /** The loan this reminder is associated with. */
  @Prop({ required: true, index: true })
  loanId: string;

  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true, enum: ['due-soon', 'overdue'] })
  type: ReminderType;

  /**
   * Idempotency key: prevents duplicate delivery for the same loan+type+window.
   * Format: `{loanId}:{type}:{windowKey}` e.g. `abc123:due-soon:48h`
   */
  @Prop({ required: true, unique: true })
  idempotencyKey: string;

  @Prop({ default: 'pending', enum: ['pending', 'sent', 'skipped'] })
  status: string;

  @Prop({ type: String, default: null })
  failureReason: string | null;
}

export const ReminderDeliveryLogSchema =
  SchemaFactory.createForClass(ReminderDeliveryLog);