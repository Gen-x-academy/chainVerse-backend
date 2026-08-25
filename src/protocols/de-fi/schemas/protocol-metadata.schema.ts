import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProtocolMetadataDocument = HydratedDocument<ProtocolMetadata>;

@Schema({ timestamps: true, collection: 'protocol_metadata' })
export class ProtocolMetadata {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({
    required: true,
    enum: ['lending', 'dex', 'yield', 'staking', 'other'],
  })
  type: string;

  @Prop({ required: true })
  version: string;

  @Prop({ type: [String], required: true })
  supportedChains: string[];

  @Prop({ default: 0 })
  tvl: number;

  @Prop({ default: 0 })
  apy: number;

  @Prop({ type: [String], default: [] })
  audits: string[];

  @Prop({ default: false })
  insurance: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  description?: string;

  @Prop()
  website?: string;
}

export const ProtocolMetadataSchema =
  SchemaFactory.createForClass(ProtocolMetadata);
