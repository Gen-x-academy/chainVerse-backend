import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrganizationInvitationDocument =
  HydratedDocument<OrganizationInvitation>;

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Schema({ timestamps: true, collection: 'organization_invitations' })
export class OrganizationInvitation {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  invitedBy: string;

  @Prop({ required: true, unique: true })
  token: string;

  @Prop({
    type: String,
    required: true,
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  status: InvitationStatus;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  acceptedAt?: Date | null;
}

export const OrganizationInvitationSchema = SchemaFactory.createForClass(
  OrganizationInvitation,
);

OrganizationInvitationSchema.index(
  { organizationId: 1, email: 1, status: 1 },
  { partialFilterExpression: { status: InvitationStatus.PENDING } },
);
