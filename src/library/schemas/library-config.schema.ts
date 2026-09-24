import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LibraryConfigDocument = HydratedDocument<LibraryConfig>;

/**
 * Singleton document that holds library policy defaults.
 * A single record (key = 'default') is upserted on first use.
 */
@Schema({ timestamps: true })
export class LibraryConfig {
  /** Logical identifier – always 'default'. */
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  /** Maximum number of items a patron may borrow at once. */
  @Prop({ default: 5 })
  maxBorrowLimit: number;

  /** Loan duration in days. */
  @Prop({ default: 14 })
  loanPeriodDays: number;

  /** Grace period in days before a fine is raised. */
  @Prop({ default: 3 })
  gracePeriodDays: number;

  /** Fine amount per day (in platform currency units). */
  @Prop({ default: 0 })
  dailyFineAmount: number;

  /** How many days before due to send a reminder notification. */
  @Prop({ default: 2 })
  reminderDaysBeforeDue: number;

  /** Whether the library is currently open for borrowing. */
  @Prop({ default: true })
  borrowingEnabled: boolean;

  /** Free-text operational notes visible only to staff. */
  @Prop({ default: '' })
  operationalNotes: string;

  /** Incremented on every update for optimistic-concurrency checks. */
  @Prop({ default: 0 })
  version: number;
}

export const LibraryConfigSchema = SchemaFactory.createForClass(LibraryConfig);
