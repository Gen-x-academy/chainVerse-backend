import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ConflictDeclarationDocument = HydratedDocument<ConflictDeclaration>;

/**
 * A reviewer's conflict-of-interest declaration for one application.
 *
 * A decision requires a declaration with `hasConflict: false` from the
 * deciding reviewer. `reason` is private: visible only to the declarant,
 * the program owner and admins – never to applicants or other reviewers.
 */
@Schema({ collection: 'mentorship_conflict_declarations', timestamps: true })
export class ConflictDeclaration {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  applicationId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  programId: string;

  @Prop({ required: true })
  reviewerId: string;

  @Prop({ required: true })
  hasConflict: boolean;

  @Prop({ type: String, default: null, maxlength: 500 })
  reason: string | null;

  @Prop({ required: true, type: Date })
  declaredAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConflictDeclarationSchema = SchemaFactory.createForClass(ConflictDeclaration);

ConflictDeclarationSchema.index({ applicationId: 1, reviewerId: 1 }, { unique: true });
