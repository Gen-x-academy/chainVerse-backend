import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PasswordResetTokenDocument = HydratedDocument<PasswordResetToken>;

@Schema({ timestamps: true, expires: 0 })
export class PasswordResetToken {
  @Prop({ required: true })
  tokenHash: string;

  @Prop({ required: true })
  studentId: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  used: boolean;

  @Prop({ type: Date, default: null })
  usedAt?: Date | null;

  @Prop({ type: String, default: null })
  ipAddress?: string | null;

  @Prop({ type: String, default: null })
  userAgent?: string | null;
}

export const PasswordResetTokenSchema =
  SchemaFactory.createForClass(PasswordResetToken);

// Index for efficient lookups
PasswordResetTokenSchema.index({ tokenHash: 1 });
PasswordResetTokenSchema.index({ studentId: 1, expiresAt: -1 });

// TTL index to automatically delete expired tokens
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
