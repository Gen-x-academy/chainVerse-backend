import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdminDocument = HydratedDocument<Admin>;

@Schema({ timestamps: true })
export class Admin {
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: true })
  emailVerified: boolean; // Admins are pre-verified

  @Prop({ default: 'admin' })
  role: string;

  @Prop({ type: Number, default: 0 })
  loginAttempts: number;

  @Prop({ type: Date, default: null })
  lockedUntil: Date | null;

  @Prop({ default: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);

AdminSchema.index({ email: 1 }, { unique: true });
AdminSchema.index({ isActive: 1 });