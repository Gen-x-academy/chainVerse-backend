import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  website?: string;

  @Prop()
  logoUrl?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
