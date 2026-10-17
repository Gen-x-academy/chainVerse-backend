import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type MentorshipAuditEventDocument = HydratedDocument<MentorshipAuditEvent>;

/**
 * Append-only audit trail for mentorship form, eligibility and review actions.
 *
 * Privacy: `metadata` must never contain applicant answers or conflict-of-
 * interest reasons – only ids, enum values and version numbers.
 */
@Schema({ collection: 'mentorship_audit_events', timestamps: { createdAt: true, updatedAt: false } })
export class MentorshipAuditEvent {
  @Prop({ required: true, index: true })
  action: string;

  @Prop({ required: true, index: true })
  actorId: string;

  @Prop({ required: true })
  actorRole: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true, default: null })
  programId: string | null;

  @Prop({ required: true })
  subjectType: string;

  @Prop({ required: true, index: true })
  subjectId: string;

  @Prop({ type: String, default: null })
  requestId: string | null;

  /** Dedupe key so retried operations do not write duplicate audit rows. */
  @Prop({ type: String, default: undefined })
  dedupeKey?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt?: Date;
}

export const MentorshipAuditEventSchema = SchemaFactory.createForClass(MentorshipAuditEvent);

MentorshipAuditEventSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);
MentorshipAuditEventSchema.index({ subjectType: 1, subjectId: 1, createdAt: 1 });

// Append-only: refuse in-place edits and deletes at the model layer.
const refuse = function () {
  throw new Error('mentorship_audit_events is append-only');
};
MentorshipAuditEventSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  { document: false, query: true },
  refuse,
);
