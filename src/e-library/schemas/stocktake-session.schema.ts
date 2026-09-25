import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StocktakeSessionDocument = HydratedDocument<StocktakeSession>;

export enum StocktakeStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ScanResult {
  FOUND = 'found',
  MISSING = 'missing',
  MISHELVED = 'misshelved',
  DAMAGED = 'damaged',
  EXTRA = 'extra',
}

@Schema({ _id: false })
export class StocktakeScanEntry {
  @Prop({ required: true, type: Types.ObjectId, ref: 'BookCopy' })
  copyId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  barcode: string;

  @Prop({ required: true, enum: ScanResult })
  result: ScanResult;

  @Prop({ required: true })
  scannedAt: Date;

  @Prop({ required: true })
  scannedBy: string;

  @Prop({ trim: true })
  expectedLocation?: string;

  @Prop({ trim: true })
  actualLocation?: string;

  @Prop({ trim: true })
  note?: string;
}

export const StocktakeScanEntrySchema =
  SchemaFactory.createForClass(StocktakeScanEntry);

@Schema({ timestamps: true, collection: 'library_stocktake_sessions' })
export class StocktakeSession {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: StocktakeStatus, default: StocktakeStatus.IN_PROGRESS, index: true })
  status: StocktakeStatus;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ required: true })
  startedBy: string;

  @Prop({ trim: true })
  branch?: string;

  @Prop({ type: [StocktakeScanEntrySchema], default: [] })
  scans: StocktakeScanEntry[];

  @Prop({ default: 0 })
  totalScanned: number;

  @Prop({ default: 0 })
  totalMissing: number;

  @Prop({ default: 0 })
  totalMisshelved: number;

  @Prop({ default: 0 })
  totalDamaged: number;

  @Prop({ default: 0 })
  totalExtra: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StocktakeSessionSchema =
  SchemaFactory.createForClass(StocktakeSession);
StocktakeSessionSchema.index({ status: 1 });
StocktakeSessionSchema.index({ branch: 1, status: 1 });
