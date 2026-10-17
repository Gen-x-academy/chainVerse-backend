import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ProgramReviewerDocument = HydratedDocument<ProgramReviewer>;

export const REVIEWER_ROLES = ['reviewer', 'lead'] as const;
export type ReviewerRole = (typeof REVIEWER_ROLES)[number];

/**
 * Scopes a user as a reviewer of one program (MENTOR-034).
 *
 * `activeAssignments` is a reservation counter updated atomically on
 * assign/unassign/decide; together with `capacity` it makes capacity checks
 * race-free. The review sweeper reconciles it against applications to heal
 * drift after crashes.
 */
@Schema({ collection: 'mentorship_program_reviewers', timestamps: true })
export class ProgramReviewer {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  programId: string;

  @Prop({ required: true, index: true })
  reviewerId: string;

  @Prop({ required: true, enum: REVIEWER_ROLES, default: 'reviewer' })
  role: ReviewerRole;

  @Prop({ required: true, min: 0, max: 500, default: 10 })
  capacity: number;

  @Prop({ required: true, min: 0, default: 0 })
  activeAssignments: number;

  @Prop({ required: true, default: true })
  active: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProgramReviewerSchema = SchemaFactory.createForClass(ProgramReviewer);

ProgramReviewerSchema.index({ programId: 1, reviewerId: 1 }, { unique: true });
ProgramReviewerSchema.index({ reviewerId: 1, active: 1 });
