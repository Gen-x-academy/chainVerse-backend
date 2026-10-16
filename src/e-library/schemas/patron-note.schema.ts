import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PatronNoteDocument = HydratedDocument<PatronNote>;

export enum NoteClassification {
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
}

@Schema({ _id: false })
export class AccessAuditEntry {
  @Prop({ required: true })
  accessedBy: string;

  @Prop({ required: true })
  accessedAt: Date;
}

export const AccessAuditEntrySchema =
  SchemaFactory.createForClass(AccessAuditEntry);

@Schema({ timestamps: true, collection: 'library_patron_notes' })
export class PatronNote {
  @Prop({ required: true, index: true })
  patronId: string;

  @Prop({ required: true })
  authorId: string;

  @Prop({ required: true, enum: NoteClassification })
  classification: NoteClassification;

  @Prop({ required: true, maxlength: 2000 })
  content: string;

  @Prop({ required: true })
  retentionExpiry: Date;

  @Prop({ type: [AccessAuditEntrySchema], default: [] })
  accessAuditLog: AccessAuditEntry[];

  @Prop({ default: false, index: true })
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PatronNoteSchema = SchemaFactory.createForClass(PatronNote);
PatronNoteSchema.index({ patronId: 1, isDeleted: 1 });
PatronNoteSchema.index({ retentionExpiry: 1 });
