import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LibraryAuditLogDocument = HydratedDocument<LibraryAuditLog>;

/**
 * Immutable audit record for every privileged staff mutation in the e-library.
 * Records are append-only; updates and deletes on this collection are forbidden
 * at the application layer.
 */
@Schema({ timestamps: true })
export class LibraryAuditLog {
  /** The staff member who performed the action. */
  @Prop({ required: true, index: true })
  actorId: string;

  /** Role or permission used to authorise the action (e.g. "librarian"). */
  @Prop({ required: true })
  actorPermission: string;

  /**
   * What was mutated (e.g. "catalog.book", "circulation.loan",
   * "patron.status", "config", "digital.takedown").
   */
  @Prop({ required: true, index: true })
  targetType: string;

  /** ID of the mutated resource. */
  @Prop({ required: true })
  targetId: string;

  /** Action performed (e.g. "create", "update", "delete", "override"). */
  @Prop({ required: true })
  action: string;

  /** Correlation / idempotency ID from the originating HTTP request. */
  @Prop({ required: true, index: true })
  requestId: string;

  /** Human-readable reason supplied by the actor (required for overrides). */
  @Prop({ type: String, default: null })
  reason: string | null;

  /**
   * Snapshot of the resource before the mutation, with sensitive fields
   * redacted (e.g. passwords, tokens replaced with "[REDACTED]").
   */
  @Prop({ type: Object, default: null })
  beforeState: Record<string, unknown> | null;

  /**
   * Snapshot of the resource after the mutation, with sensitive fields
   * redacted.
   */
  @Prop({ type: Object, default: null })
  afterState: Record<string, unknown> | null;
}

export const LibraryAuditLogSchema =
  SchemaFactory.createForClass(LibraryAuditLog);

// Prevent updates and deletes at the mongoose middleware level.
LibraryAuditLogSchema.pre(['updateOne', 'findOneAndUpdate', 'deleteOne', 'findOneAndDelete', 'deleteMany'], function () {
  throw new Error('Library audit logs are immutable and cannot be modified.');
});