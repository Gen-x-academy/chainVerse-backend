import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IdempotencyKeyDocument = HydratedDocument<IdempotencyKey>;

/**
 * Stores the cached response for a previously processed idempotent request.
 *
 * Records expire automatically via the `expiresAt` TTL index (24 hours by
 * default). Once expired MongoDB removes the document, allowing the same key
 * to be reused after the expiry window.
 */
@Schema({ timestamps: true })
export class IdempotencyKey {
  /** The raw key value supplied by the client in X-Idempotency-Key. */
  @Prop({ required: true, unique: true, index: true })
  key: string;

  /** Originating user id – prevents cross-user key collisions. */
  @Prop({ required: true })
  userId: string;

  /** Request path the key was first used on. */
  @Prop({ required: true })
  path: string;

  /** HTTP status code of the original response. */
  @Prop({ required: true })
  statusCode: number;

  /** Serialised response body of the original request. */
  @Prop({ type: Object, required: true })
  responseBody: Record<string, unknown>;

  /** TTL field – MongoDB removes the document at this time. */
  @Prop({ required: true, type: Date })
  expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const IdempotencyKeySchema =
  SchemaFactory.createForClass(IdempotencyKey);

// Let MongoDB automatically remove expired records.
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
