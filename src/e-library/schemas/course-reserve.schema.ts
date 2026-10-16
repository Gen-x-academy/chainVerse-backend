import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CourseReserveDocument = HydratedDocument<CourseReserve>;

/**
 * Lifecycle status of a course reserve record.
 *
 * - ACTIVE:    Reserve is in effect; special loan period applies.
 * - EXPIRED:   endDate has passed; normal circulation rules are restored.
 * - CANCELLED: Manually cancelled by a librarian or admin before expiry.
 */
export enum ReserveStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/**
 * A course reserve ties one or more library items (a physical copy or a
 * digital edition) to a specific course for a defined date range.
 *
 * While an ACTIVE reserve exists:
 *  - The linked copy/edition is placed under a reduced special loan period
 *    (specialLoanPeriodDays) to ensure high turnover for enrolled students.
 *  - Conflicting reserves for the same resource and overlapping dates are
 *    rejected at creation time.
 *
 * When endDate passes the `expireStale()` scheduler transitions the record
 * to EXPIRED, restoring normal circulation rules automatically.
 */
@Schema({ timestamps: true, collection: 'library_course_reserves' })
export class CourseReserve {
  /** The course this reserve serves. */
  @Prop({ required: true, index: true })
  courseId: string;

  /** Librarian user ID who created the reserve. */
  @Prop({ required: true })
  requestedBy: string;

  /**
   * Physical book copy placed on reserve.
   * Either copyId or editionId (or both) must be provided.
   */
  @Prop({ type: Types.ObjectId, ref: 'BookCopy', default: null })
  copyId: Types.ObjectId | null;

  /**
   * Digital edition/license placed on reserve.
   * Either copyId or editionId (or both) must be provided.
   */
  @Prop({ type: String, default: null })
  editionId: string | null;

  /** Date from which the reserve takes effect (inclusive). */
  @Prop({ type: Date, required: true })
  startDate: Date;

  /** Date on which the reserve expires (inclusive). After this date the record
   *  is transitioned to EXPIRED by the scheduler. */
  @Prop({ type: Date, required: true })
  endDate: Date;

  /**
   * Shortened loan period (in days) that applies while this reserve is ACTIVE.
   * Must be between 1 and 90 days.
   */
  @Prop({ required: true, min: 1 })
  specialLoanPeriodDays: number;

  /** Optional librarian notes (rationale, instructor contact, etc.). */
  @Prop({ type: String, default: null })
  notes: string | null;

  @Prop({ required: true, enum: ReserveStatus, default: ReserveStatus.ACTIVE })
  status: ReserveStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CourseReserveSchema = SchemaFactory.createForClass(CourseReserve);

// Compound indexes for common query patterns and conflict detection
CourseReserveSchema.index({ courseId: 1, status: 1 });
CourseReserveSchema.index({ copyId: 1, status: 1 });
CourseReserveSchema.index({ endDate: 1, status: 1 });
