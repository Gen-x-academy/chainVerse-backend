import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import {
  CheckOutcome,
  ConflictCategory,
  ConflictSeverity,
} from '../conflict.constants';

export type ConflictCheckDocument = HydratedDocument<ConflictCheck>;

/** Public-safe finding: a code, a category and a generic explanation. */
export interface ConflictFinding {
  code: string;
  category: ConflictCategory;
  severity: ConflictSeverity;
  publicMessage: string;
}

/**
 * Immutable, versioned result of a conflict evaluation (MENTOR-040).
 *
 * Checks are append-only: a new input hash produces a new `checkVersion`, so a
 * prior decision can always be explained. `findings` contains only public-safe
 * codes/messages; private free text is kept separately in `privateNotes`,
 * which is only exposed to staff.
 */
@Schema({
  collection: 'mentorship_conflict_checks',
  timestamps: { createdAt: true, updatedAt: false },
})
export class ConflictCheck {
  @Prop({ required: true, index: true })
  proposalId: string;

  @Prop({ required: true, index: true })
  mentorId: string;

  @Prop({ required: true, index: true })
  menteeId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true, default: null })
  programId: string | null;

  @Prop({ required: true, type: Number })
  rulesVersion: number;

  @Prop({ required: true, type: Number })
  checkVersion: number;

  @Prop({ required: true })
  inputHash: string;

  @Prop({ required: true, enum: Object.values(CheckOutcome) })
  outcome: CheckOutcome;

  @Prop({ type: [Object], default: [] })
  findings: ConflictFinding[];

  /** Private to staff: concatenated declared-relationship notes. */
  @Prop({ type: String, default: null, maxlength: 2000 })
  privateNotes: string | null;

  @Prop({ required: true, type: Date })
  checkedAt: Date;

  @Prop({ required: true })
  checkedBy: string;

  createdAt?: Date;
}

export const ConflictCheckSchema = SchemaFactory.createForClass(ConflictCheck);

// Idempotent retries of the same input return the same row.
ConflictCheckSchema.index(
  { proposalId: 1, inputHash: 1, rulesVersion: 1 },
  { unique: true },
);
ConflictCheckSchema.index({ proposalId: 1, checkVersion: -1 });
