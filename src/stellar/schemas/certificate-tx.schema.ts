import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CertificateTxDocument = HydratedDocument<CertificateTx>;

@Schema({ timestamps: true, collection: 'certificate_txs' })
export class CertificateTx {
  @Prop({ required: true })
  certificateId: string;

  @Prop({ required: true })
  studentId: string;

  @Prop({ required: true })
  transactionHash: string;

  @Prop({ default: 'pending', enum: ['pending', 'confirmed', 'failed'] })
  status: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CertificateTxSchema = SchemaFactory.createForClass(CertificateTx);
CertificateTxSchema.index({ status: 1 });
