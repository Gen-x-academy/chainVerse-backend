import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PrivateNoteDocument = HydratedDocument<PrivateNote>;

/**
 * Owner-only researcher note. The title and body are encrypted together as a
 * single AES-256-GCM payload; only routing metadata and a key id are stored in
 * clear text. This collection is never queried by team/shared-note endpoints.
 */
@Schema({ timestamps: true, collection: 'project_private_notes' })
export class PrivateNote {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  projectId!: string;

  @Prop({ required: true, index: true })
  ownerId!: string;

  @Prop({ required: true })
  ciphertext!: string;

  @Prop({ required: true })
  iv!: string;

  @Prop({ required: true })
  authTag!: string;

  @Prop({ required: true })
  keyId!: string;

  @Prop({ required: true, default: 'aes-256-gcm' })
  algorithm!: string;

  @Prop({ required: true, default: 1 })
  version!: number;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;

  @Prop({ type: String, default: null })
  idempotencyKey!: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PrivateNoteSchema = SchemaFactory.createForClass(PrivateNote);
PrivateNoteSchema.index({
  tenantId: 1,
  projectId: 1,
  ownerId: 1,
  archivedAt: 1,
});
PrivateNoteSchema.index(
  { tenantId: 1, projectId: 1, ownerId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);
