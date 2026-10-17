import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum MentorshipFacilitatorRole {
  COORDINATOR = 'coordinator',
  APPLICATION_REVIEWER = 'application_reviewer',
  SAFEGUARDING_CONTACT = 'safeguarding_contact',
  FINANCE_APPROVER = 'finance_approver',
}

@Schema({ timestamps: true, collection: 'mentorship_facilitators' })
export class MentorshipFacilitator {
  @Prop({ required: true, index: true }) programId: string;
  @Prop({ required: true, index: true }) organizationId: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, enum: MentorshipFacilitatorRole, index: true }) role: MentorshipFacilitatorRole;
  @Prop({ required: true }) startsAt: Date;
  @Prop({ required: true }) endsAt: Date;
  @Prop({ default: true, index: true }) active: boolean;
  @Prop({ default: null }) revokedAt: Date | null;
  @Prop({ trim: true, maxlength: 64 }) idempotencyKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
export type MentorshipFacilitatorDocument = HydratedDocument<MentorshipFacilitator>;
export const MentorshipFacilitatorSchema = SchemaFactory.createForClass(MentorshipFacilitator);
MentorshipFacilitatorSchema.index({ programId: 1, userId: 1, role: 1 }, { unique: true });
MentorshipFacilitatorSchema.index({ endsAt: 1, active: 1 });
