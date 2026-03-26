import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrganizationMemberDocument = HydratedDocument<OrganizationMember>;

@Schema({ timestamps: true })
export class OrganizationMember {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  role: string;
}

export const OrganizationMemberSchema =
  SchemaFactory.createForClass(OrganizationMember);

OrganizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
