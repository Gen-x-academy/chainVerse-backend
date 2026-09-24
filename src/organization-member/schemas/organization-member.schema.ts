import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { applySoftDeleteSchema } from '../../common/soft-delete/soft-delete.schema';
import {
  ORGANIZATION_ROLE_HIERARCHY,
  OrganizationRole,
} from '../../common/enums/organization-role.enum';

export type OrganizationMemberDocument = HydratedDocument<OrganizationMember>;

@Schema({ timestamps: true })
export class OrganizationMember {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  userId: string;

  /**
   * Organization-scoped role. Constrained to {@link OrganizationRole} so a
   * membership can never carry an unrecognised value that the authorization
   * guard would then have to interpret.
   */
  @Prop({
    type: String,
    required: true,
    enum: ORGANIZATION_ROLE_HIERARCHY,
    default: OrganizationRole.MEMBER,
  })
  role: OrganizationRole;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: String, default: null })
  deletedBy?: string | null;

  @Prop({ type: String, default: null })
  deletionReason?: string | null;

  @Prop({ type: Date, default: null })
  restoreBy?: Date | null;
}

export const OrganizationMemberSchema =
  SchemaFactory.createForClass(OrganizationMember);
applySoftDeleteSchema(OrganizationMemberSchema);

OrganizationMemberSchema.index(
  { organizationId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
  },
);
