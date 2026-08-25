import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { VerificationStatus } from '../interfaces/verification.interface';

export type VerificationLogDocument = HydratedDocument<VerificationLogModel>;

@Schema({ timestamps: true, collection: 'verification_logs' })
export class VerificationLogModel {
  /**
   * Foreign key to the ticket record (nullable when code is unrecognised).
   */
  @Prop({ type: String, default: null })
  ticketId: string | null;

  /**
   * Raw barcode / QR value submitted by the scanner.
   * Retained for forensic replay.
   */
  @Prop({ type: String, required: true, maxlength: 512 })
  ticketCode: string;

  /** The event this scan was attempted against. */
  @Prop({ type: String, required: true, index: true })
  eventId: string;

  /**
   * Staff member or device that performed the scan (nullable for anonymous scans).
   */
  @Prop({ type: String, default: null })
  verifierId: string | null;

  /** Outcome of the verification attempt. */
  @Prop({
    type: String,
    enum: Object.values(VerificationStatus),
    required: true,
  })
  status: VerificationStatus;

  /** Human-readable description of the outcome. */
  @Prop({ type: String, required: true })
  message: string;
}

export const VerificationLogSchema =
  SchemaFactory.createForClass(VerificationLogModel);

// Compound index for efficient event-scoped queries
VerificationLogSchema.index({ eventId: 1, createdAt: -1 });
VerificationLogSchema.index({ ticketId: 1 });
