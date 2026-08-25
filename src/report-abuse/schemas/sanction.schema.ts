import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SanctionDocument = HydratedDocument<Sanction>;

export enum SanctionType {
  WARNING = 'warning',
  CONTENT_REMOVAL = 'content_removal',
  SUSPENSION = 'suspension',
  BAN = 'ban',
}

export enum SanctionStatus {
  ACTIVE = 'active',
  APPEALED = 'appealed',
  OVERTURNED = 'overturned',
  UPHELD = 'upheld',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true })
export class Sanction {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, enum: SanctionType })
  type: SanctionType;

  @Prop({ required: true, enum: SanctionStatus, default: SanctionStatus.ACTIVE })
  status: SanctionStatus;

  @Prop({ required: true })
  reason: string;

  @Prop()
  contentId?: string;

  @Prop()
  contentType?: string;

  @Prop({ required: true })
  issuedBy: string;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop()
  appealReason?: string;

  @Prop()
  appealReviewedBy?: string;

  @Prop()
  appealNotes?: string;
}

export const SanctionSchema = SchemaFactory.createForClass(Sanction);
