import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MentorshipSessionConsentDocument =
  HydratedDocument<MentorshipSessionConsent>;

export enum RecordingMode {
  PROHIBITED = 'prohibited',
  OPTIONAL = 'optional',
  REQUIRED = 'required',
}

export enum ConsentStatus {
  PENDING = 'pending',
  GRANTED = 'granted',
  REVOKED = 'revoked',
}

/** Explicit consent per participant per session; raw media never public. */
@Schema({ timestamps: true, collection: 'mentorship_session_consent' })
export class MentorshipSessionConsent {
  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true, index: true })
  participantId: string;

  @Prop({ required: true, enum: RecordingMode })
  mode: RecordingMode;

  @Prop({ required: true, enum: ConsentStatus, default: ConsentStatus.PENDING })
  status: ConsentStatus;

  @Prop({ default: null })
  grantedAt: Date | null;

  @Prop({ default: null })
  revokedAt: Date | null;

  @Prop({ default: null })
  retentionPolicy: string | null;

  @Prop({ required: true, default: false })
  isMinor: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MentorshipSessionConsentSchema = SchemaFactory.createForClass(
  MentorshipSessionConsent,
);
MentorshipSessionConsentSchema.index(
  { sessionId: 1, participantId: 1 },
  { unique: true },
);
