import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { VerifierAssignmentStatus } from '../scholarship.constants';

export type VerifierAssignmentDocument = HydratedDocument<VerifierAssignment>;

/** Grants one organization member authority to decide evidence on an award. */
@Schema({ timestamps: true, collection: 'scholarship_verifier_assignments' })
export class VerifierAssignment {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  awardId: string;

  @Prop({ required: true })
  verifierId: string;

  /** Empty means every milestone on the award. */
  @Prop({ type: [String], default: [] })
  milestoneKeys: string[];

  @Prop({
    type: String,
    enum: Object.values(VerifierAssignmentStatus),
    default: VerifierAssignmentStatus.ACTIVE,
  })
  status: VerifierAssignmentStatus;

  @Prop({ required: true })
  assignedBy: string;

  @Prop({ type: String, default: null })
  revokedBy: string | null;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;
}

export const VerifierAssignmentSchema =
  SchemaFactory.createForClass(VerifierAssignment);

VerifierAssignmentSchema.index(
  { awardId: 1, verifierId: 1 },
  {
    unique: true,
    name: 'one_active_assignment_per_verifier',
    partialFilterExpression: { status: VerifierAssignmentStatus.ACTIVE },
  },
);
