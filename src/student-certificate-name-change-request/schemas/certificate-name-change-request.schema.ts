import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CertificateNameChangeRequestDocument =
  HydratedDocument<CertificateNameChangeRequest>;

export const NAME_CHANGE_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;

export type NameChangeStatus = (typeof NAME_CHANGE_STATUSES)[number];

/**
 * A student's request to have the name printed on their certificates changed.
 *
 * `studentId` is the JWT subject of the requester and is set server-side only,
 * so no caller can file — or read — a request under another student's identity.
 */
@Schema({ timestamps: true, collection: 'certificate_name_change_requests' })
export class CertificateNameChangeRequest {
  @Prop({ required: true, index: true })
  studentId: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  currentName: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  requestedName: string;

  @Prop({ type: String, default: null, maxlength: 1000 })
  reason: string | null;

  @Prop({
    type: String,
    default: 'pending',
    enum: NAME_CHANGE_STATUSES,
    index: true,
  })
  status: NameChangeStatus;

  @Prop({ type: String, default: null })
  reviewedBy: string | null;

  @Prop({ type: Date, default: null })
  reviewedAt: Date | null;

  @Prop({ type: String, default: null, maxlength: 1000 })
  decisionNote: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CertificateNameChangeRequestSchema = SchemaFactory.createForClass(
  CertificateNameChangeRequest,
);

CertificateNameChangeRequestSchema.index({ studentId: 1, status: 1 });
