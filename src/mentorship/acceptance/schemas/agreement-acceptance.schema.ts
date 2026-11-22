import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type AgreementTermsDocument = HydratedDocument<AgreementTerms>;
export type AgreementAcceptanceDocument = HydratedDocument<AgreementAcceptance>;

/**
 * Deterministic SHA-256 over a canonical JSON representation of the terms.
 * The same logical terms always hash to the same value regardless of key
 * order, so a client can commit to the exact document it reviewed.
 */
export function computeTermsHash(terms: Record<string, unknown>): string {
  const canonical = JSON.stringify(terms, Object.keys(terms).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * An immutable, versioned snapshot of the agreement terms. New versions are
 * appended; older versions are never edited, so a previously recorded
 * acceptance can always be re-verified against the snapshot it referenced.
 * The private `terms` body lives only here — acceptance evidence stores just
 * the hash and the individual term versions.
 */
@Schema({ timestamps: true, collection: 'mentorship_agreement_terms' })
export class AgreementTerms {
  @Prop({ required: true, index: true })
  agreementId: string;

  @Prop({ required: true })
  version: number;

  @Prop({ required: true, type: [String] })
  participantIds: string[];

  /** Private agreement body. Never copied into acceptance proofs. */
  @Prop({ required: true, type: Object })
  terms: Record<string, unknown>;

  @Prop({ required: true })
  termsHash: string;

  @Prop({ required: true })
  effectiveAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AgreementTermsSchema = SchemaFactory.createForClass(AgreementTerms);
AgreementTermsSchema.index({ agreementId: 1, version: 1 }, { unique: true });

export enum AcceptanceIntent {
  ACCEPT = 'ACCEPT',
}

/**
 * Append-only evidence of an explicit acceptance. There are no update or
 * delete paths in the service: correcting a mistake requires a new terms
 * version and a new acceptance record.
 */
@Schema({ timestamps: true, collection: 'mentorship_agreement_acceptance' })
export class AgreementAcceptance {
  @Prop({ required: true, index: true })
  agreementId: string;

  @Prop({ required: true })
  version: number;

  @Prop({ required: true, index: true })
  actorId: string;

  /** Commitment to the exact terms snapshot that was accepted. */
  @Prop({ required: true })
  termsHash: string;

  /** Version of each individual term component that was reviewed. */
  @Prop({ required: true, type: Object, default: {} })
  termVersions: Record<string, number>;

  /** Random one-time value that makes an acceptance intent replay-resistant. */
  @Prop({ required: true })
  nonce: string;

  @Prop({ required: true, enum: AcceptanceIntent, default: AcceptanceIntent.ACCEPT })
  intent: AcceptanceIntent;

  @Prop({ required: true })
  acceptedAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AgreementAcceptanceSchema =
  SchemaFactory.createForClass(AgreementAcceptance);
// Idempotency: the same actor can only have one acceptance per terms version.
AgreementAcceptanceSchema.index(
  { agreementId: 1, version: 1, actorId: 1 },
  { unique: true },
);
// Replay resistance: a nonce may be used for exactly one acceptance.
AgreementAcceptanceSchema.index({ nonce: 1 }, { unique: true });
