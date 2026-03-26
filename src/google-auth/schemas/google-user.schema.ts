import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GoogleUserDocument = HydratedDocument<GoogleUser>;

@Schema({ timestamps: true })
export class GoogleUser {
  @Prop({ required: true, unique: true })
  googleId: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  displayName: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ default: 'student' })
  role: string;
}

export const GoogleUserSchema = SchemaFactory.createForClass(GoogleUser);
