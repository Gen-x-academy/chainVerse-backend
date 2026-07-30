import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdminRefreshTokenDocument = HydratedDocument<AdminRefreshToken>;

@Schema({ timestamps: true })
export class AdminRefreshToken {
  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true })
  tokenFamily: string;

  @Prop({ required: true })
  adminId: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  isRevoked: boolean;
}

export const AdminRefreshTokenSchema = SchemaFactory.createForClass(AdminRefreshToken);

AdminRefreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
AdminRefreshTokenSchema.index({ tokenFamily: 1 });
AdminRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });