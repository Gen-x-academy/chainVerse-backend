import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StellarNetwork = 'testnet' | 'public';
export const STELLAR_NETWORKS: StellarNetwork[] = ['testnet', 'public'];

export interface StellarAsset {
  /** Asset code, e.g. "USDC". Use "XLM" with no issuer for the native asset. */
  code: string;
  issuer?: string | null;
}

export type ExternalBalanceSource = 'horizon' | 'manual';
export type ProgramStatus = 'active' | 'suspended' | 'closed';

export type ScholarshipProgramDocument = HydratedDocument<ScholarshipProgram>;

/**
 * A funded scholarship program owned by an organization (tenant).
 * Each program has exactly one ledger, denominated in one asset, backed by
 * one on-chain treasury account.
 */
@Schema({ timestamps: true, collection: 'scholarship_programs' })
export class ScholarshipProgram {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: Object, required: true })
  asset: StellarAsset;

  @Prop({ required: true, enum: STELLAR_NETWORKS })
  network: StellarNetwork;

  /** Stellar account (G...) that holds the program's funds. */
  @Prop({ required: true })
  treasuryAccount: string;

  /** Where reconciliation obtains the external balance. */
  @Prop({ required: true, enum: ['horizon', 'manual'], default: 'horizon' })
  externalBalanceSource: ExternalBalanceSource;

  @Prop({
    required: true,
    enum: ['active', 'suspended', 'closed'],
    default: 'active',
  })
  status: ProgramStatus;

  @Prop({ required: true })
  createdBy: string;

  /** Short-lived lease that serialises ledger postings for this program. */
  @Prop({ type: Object, default: null, select: false })
  ledgerLock?: { token: string; until: Date } | null;
}

export const ScholarshipProgramSchema =
  SchemaFactory.createForClass(ScholarshipProgram);
