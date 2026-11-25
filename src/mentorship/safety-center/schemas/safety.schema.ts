import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum SafetyCaseStatus {
  OPEN = 'open',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum ProfileVisibility {
  EVERYONE = 'everyone',
  MATCHED_ONLY = 'matched_only',
  HIDDEN = 'hidden',
}

@Schema({ _id: false })
export class TrustedContact {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) email!: string;
  @Prop({ type: String, default: null }) relationship!: string | null;
}
const TrustedContactSchema = SchemaFactory.createForClass(TrustedContact);

@Schema({ timestamps: true, collection: 'mentorship_safety_settings' })
export class SafetySettings {
  @Prop({ required: true, unique: true }) userId!: string;
  @Prop({ type: String, enum: Object.values(ProfileVisibility), default: ProfileVisibility.MATCHED_ONLY })
  profileVisibility!: ProfileVisibility;
  @Prop({ default: true }) allowSessionRecordingRequests!: boolean;
  @Prop({ default: false }) shareSessionScheduleWithTrustedContacts!: boolean;
  @Prop({ type: [TrustedContactSchema], default: [] }) trustedContacts!: TrustedContact[];
  @Prop({ type: String, default: null }) acceptedConductVersion!: string | null;
}
export type SafetySettingsDocument = HydratedDocument<SafetySettings>;
export const SafetySettingsSchema = SchemaFactory.createForClass(SafetySettings);

@Schema({ timestamps: true, collection: 'mentorship_safety_cases' })
export class SafetyCase {
  @Prop({ required: true, index: true }) reporterId!: string;
  @Prop({ required: true, index: true }) subjectId!: string;
  @Prop({ required: true }) category!: string;
  @Prop({ required: true }) description!: string;
  @Prop({ type: String, default: null }) sessionId!: string | null;
  @Prop({ required: true }) idempotencyKey!: string;
  @Prop({ type: String, enum: Object.values(SafetyCaseStatus), default: SafetyCaseStatus.OPEN, index: true })
  status!: SafetyCaseStatus;
  @Prop({ type: String, default: null }) assignedTo!: string | null;
  /** Visible to the reporter; internal notes never are. */
  @Prop({ type: String, default: null }) resolutionSummary!: string | null;
  @Prop({ type: [String], default: [] }) internalNotes!: string[];
}
export type SafetyCaseDocument = HydratedDocument<SafetyCase>;
export const SafetyCaseSchema = SchemaFactory.createForClass(SafetyCase);
SafetyCaseSchema.index({ reporterId: 1, idempotencyKey: 1 }, { unique: true });
