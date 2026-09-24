import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PatronNoteDocument = HydratedDocument<PatronNote>;

/** Classification controls which staff roles may read a note. */
export enum NoteClassification {
  /** Visible to all library staff. */
  GENERAL = 'general',
  /** Visible only to librarians and admins – e.g. damage history. */
  RESTRICTED = 'restricted',
}

/**
 * Staff-only note attached to a patron (user) record.
 * Students, tutors, and general admins cannot read RESTRICTED notes.
 */
@Schema({ timestamps: true })
export class PatronNote {
  /** User ID of the patron this note relates to. */
  @Prop({ required: true, index: true })
  patronId: string;

  /** Staff member who authored the note. */
  @Prop({ required: true })
  authorId: string;

  /** Note text – bounded to 1 000 characters to discourage PII dumps. */
  @Prop({ required: true, maxlength: 1000 })
  content: string;

  /** Access classification. */
  @Prop({ enum: NoteClassification, default: NoteClassification.GENERAL })
  classification: NoteClassification;

  /** Soft-delete timestamp; null means the note is active. */
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const PatronNoteSchema = SchemaFactory.createForClass(PatronNote);
