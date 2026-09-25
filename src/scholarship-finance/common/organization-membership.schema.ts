import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrganizationMembershipDocument =
  HydratedDocument<OrganizationMembership>;

/**
 * Read-only view of the `organizationmembers` collection owned by the
 * organization-member module, used only for tenant authorization checks.
 * This module never writes memberships.
 */
@Schema({
  collection: 'organizationmembers',
  autoCreate: false,
  autoIndex: false,
})
export class OrganizationMembership {
  @Prop() organizationId: string;
  @Prop() userId: string;
  @Prop() role: string;
  @Prop({ type: Date, default: null }) deletedAt?: Date | null;
}

export const OrganizationMembershipSchema = SchemaFactory.createForClass(
  OrganizationMembership,
);
