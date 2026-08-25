import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PatronLookupAuditDocument = HydratedDocument<PatronLookupAudit>;

/** Every staff lookup of a patron's circulation record is audited. */
@Schema({ timestamps: true })
export class PatronLookupAudit {
  @Prop({ required: true, index: true })
  staffId: string;

  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true, min: 0 })
  resultCount: number;

  @Prop({ type: String, default: null })
  requestId?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PatronLookupAuditSchema = SchemaFactory.createForClass(PatronLookupAudit);
