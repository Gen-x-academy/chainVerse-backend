import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AcquisitionOrderDocument = HydratedDocument<AcquisitionOrder>;

export enum AcquisitionOrderStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  PARTIALLY_RECEIVED = 'partially_received',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

export enum AcquisitionItemFormat {
  PHYSICAL = 'physical',
  EBOOK = 'ebook',
  AUDIOBOOK = 'audiobook',
}

@Schema({ _id: false })
export class AcquisitionOrderItem {
  @Prop({ required: true, trim: true })
  bookTitle: string;

  @Prop({ required: true, trim: true })
  author: string;

  @Prop({ trim: true, default: '' })
  isbn: string;

  @Prop({ required: true, enum: AcquisitionItemFormat })
  format: AcquisitionItemFormat;

  @Prop({ required: true, min: 1 })
  quantityOrdered: number;

  @Prop({ required: true, min: 0, default: 0 })
  quantityReceived: number;

  @Prop({ required: true, min: 0 })
  unitPriceMinorUnits: number;

  @Prop({ required: true, trim: true, default: 'USD' })
  currency: string;
}

export const AcquisitionOrderItemSchema =
  SchemaFactory.createForClass(AcquisitionOrderItem);

@Schema({ timestamps: true, collection: 'library_acquisition_orders' })
export class AcquisitionOrder {
  @Prop({ required: true, unique: true, trim: true, index: true })
  orderNumber: string;

  @Prop({ required: true, trim: true })
  supplier: string;

  @Prop({ required: true })
  orderDate: Date;

  @Prop({ required: true })
  expectedDeliveryDate: Date;

  @Prop({
    required: true,
    enum: AcquisitionOrderStatus,
    default: AcquisitionOrderStatus.DRAFT,
  })
  status: AcquisitionOrderStatus;

  @Prop({ type: [AcquisitionOrderItemSchema], default: [] })
  items: AcquisitionOrderItem[];

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ required: true })
  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AcquisitionOrderSchema =
  SchemaFactory.createForClass(AcquisitionOrder);
AcquisitionOrderSchema.index({ orderNumber: 1 }, { unique: true });
AcquisitionOrderSchema.index({ status: 1 });
AcquisitionOrderSchema.index({ createdBy: 1 });
