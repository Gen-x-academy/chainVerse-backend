import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RenditionIntegrityDocument = HydratedDocument<RenditionIntegrity>;

export enum RenditionIntegrityStatus {
  UNVERIFIED = 'unverified',
  PASSED = 'passed',
  QUARANTINED = 'quarantined',
  CLEARED = 'cleared',
}

@Schema({ timestamps: true, collection: 'library_rendition_integrity' })
export class RenditionIntegrity {
  @Prop({ required: true, index: true })
  editionId: string;

  @Prop({ required: true })
  renditionId: string;

  @Prop({ required: true })
  sha256: string;

  @Prop({ required: true, min: 0 })
  sizeBytes: number;

  @Prop({
    required: true,
    enum: RenditionIntegrityStatus,
    default: RenditionIntegrityStatus.UNVERIFIED,
    index: true,
  })
  status: RenditionIntegrityStatus;

  @Prop()
  lastVerifiedAt?: Date;

  @Prop()
  lastFailureReason?: string;

  @Prop()
  actualSha256?: string;

  @Prop()
  quarantinedAt?: Date;

  @Prop()
  quarantinedReason?: string;

  @Prop()
  clearedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RenditionIntegritySchema =
  SchemaFactory.createForClass(RenditionIntegrity);
RenditionIntegritySchema.index({ editionId: 1, renditionId: 1 }, { unique: true });
RenditionIntegritySchema.index({ renditionId: 1 }, { unique: true });
RenditionIntegritySchema.index({ status: 1, updatedAt: -1 });