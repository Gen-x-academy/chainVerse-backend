import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum CohortStatus { OPEN = 'open', CLOSED = 'closed' }
export enum EnrollmentStatus { CONFIRMED = 'confirmed', CANCELLED = 'cancelled' }
export enum WaitlistStatus { WAITING = 'waiting', OFFERED = 'offered', PROMOTED = 'promoted', EXPIRED = 'expired', REMOVED = 'removed' }
export enum OfferStatus { RESERVED = 'reserved', CONFIRMED = 'confirmed', EXPIRED = 'expired', CANCELLED = 'cancelled' }
export type CohortDocument = HydratedDocument<Cohort>;
export type EnrollmentDocument = HydratedDocument<CohortEnrollment>;
export type WaitlistDocument = HydratedDocument<CohortWaitlistEntry>;
export type OfferDocument = HydratedDocument<CohortOffer>;
export type EligibilityVersionDocument = HydratedDocument<EligibilityRuleVersion>;
export type CohortAuditDocument = HydratedDocument<CohortAudit>;

@Schema({ timestamps: true, collection: 'mentorship_cohorts' })
export class Cohort {
  @Prop({ required: true, index: true }) programId!: string;
  @Prop({ required: true, trim: true, maxlength: 160 }) name!: string;
  @Prop({ required: true, min: 1, max: 10000 }) capacity!: number;
  @Prop({ required: true, default: 0, min: 0 }) confirmedCount!: number;
  @Prop({ required: true, type: Date }) enrollmentStartsAt!: Date;
  @Prop({ required: true, type: Date }) enrollmentEndsAt!: Date;
  @Prop({ required: true, default: CohortStatus.OPEN, enum: CohortStatus, index: true }) status!: CohortStatus;
  @Prop({ required: true, type: [String], default: [] }) coordinatorIds!: string[];
  @Prop({ type: Object, default: {} }) calendar!: Record<string, unknown>;
  @Prop({ type: Object, default: {} }) settings!: Record<string, unknown>;
  @Prop({ required: true, index: true }) createdBy!: string;
}
export const CohortSchema = SchemaFactory.createForClass(Cohort);
CohortSchema.index({ programId: 1, name: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'mentorship_cohort_enrollments' })
export class CohortEnrollment {
  @Prop({ required: true, index: true }) cohortId!: string;
  @Prop({ required: true, index: true }) participantId!: string;
  @Prop({ required: true, enum: EnrollmentStatus, default: EnrollmentStatus.CONFIRMED }) status!: EnrollmentStatus;
  @Prop({ type: Date, required: true }) enrolledAt!: Date;
  @Prop({ type: Date, default: null }) cancelledAt!: Date | null;
}
export const CohortEnrollmentSchema = SchemaFactory.createForClass(CohortEnrollment);
CohortEnrollmentSchema.index({ cohortId: 1, participantId: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'mentorship_cohort_waitlist' })
export class CohortWaitlistEntry {
  @Prop({ required: true, index: true }) cohortId!: string;
  @Prop({ required: true, index: true }) participantId!: string;
  @Prop({ required: true, index: true }) position!: number;
  @Prop({ required: true, enum: WaitlistStatus, default: WaitlistStatus.WAITING, index: true }) status!: WaitlistStatus;
  @Prop({ type: Date, default: null }) offeredAt!: Date | null;
  @Prop({ type: Date, default: null }) expiresAt!: Date | null;
}
export const CohortWaitlistEntrySchema = SchemaFactory.createForClass(CohortWaitlistEntry);
CohortWaitlistEntrySchema.index({ cohortId: 1, participantId: 1 }, { unique: true });
CohortWaitlistEntrySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { status: WaitlistStatus.OFFERED } });

@Schema({ timestamps: true, collection: 'mentorship_cohort_offers' })
export class CohortOffer {
  @Prop({ required: true, index: true }) cohortId!: string;
  @Prop({ required: true, index: true }) participantId!: string;
  @Prop({ required: true, enum: OfferStatus, default: OfferStatus.RESERVED, index: true }) status!: OfferStatus;
  @Prop({ required: true, type: Date, index: true }) expiresAt!: Date;
  @Prop({ type: Date, default: null }) confirmedAt!: Date | null;
}
export const CohortOfferSchema = SchemaFactory.createForClass(CohortOffer);
CohortOfferSchema.index({ cohortId: 1, participantId: 1, status: 1 });

@Schema({ timestamps: true, collection: 'mentorship_eligibility_versions' })
export class EligibilityRuleVersion {
  @Prop({ required: true, index: true }) programId!: string;
  @Prop({ required: true, min: 1 }) version!: number;
  @Prop({ required: true, type: [Object], default: [] }) rules!: Array<Record<string, unknown>>;
  @Prop({ required: true, default: false, index: true }) active!: boolean;
  @Prop({ required: true }) createdBy!: string;
}
export const EligibilityRuleVersionSchema = SchemaFactory.createForClass(EligibilityRuleVersion);
EligibilityRuleVersionSchema.index({ programId: 1, version: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'mentorship_cohort_audits' })
export class CohortAudit {
  @Prop({ required: true, index: true }) cohortId!: string;
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) actorId!: string;
  @Prop({ type: Object, default: {} }) details!: Record<string, unknown>;
}
export const CohortAuditSchema = SchemaFactory.createForClass(CohortAudit);
CohortAuditSchema.index({ cohortId: 1, createdAt: -1 });
