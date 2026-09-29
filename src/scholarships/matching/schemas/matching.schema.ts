import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  RankableSignalKind,
  PROTECTED_TRAIT_TERMS,
  normalizeInterest,
  containsProtectedTrait,
} from '../matching-fairness';

export type ScholarshipInterestProfileDocument =
  HydratedDocument<ScholarshipInterestProfile>;

/**
 * A student's own stated interests, used only to rank scholarship programs
 * (#1176).
 *
 * Ownership:
 *   - Owned exclusively by the student (`studentId`, taken from the verified JWT
 *     `sub`).  No sponsor or organization can read it.
 *
 * Privacy:
 *   - `interests` are normalized, de-duplicated and screened against
 *     {@link PROTECTED_TRAIT_TERMS} on write, so a protected characteristic can
 *     never enter the ranking pipeline.  `rejectedInterests` keeps the raw text
 *     of refused tags purely so the student can be told which tag was dropped;
 *     it is never read by the ranker and never leaves the profile endpoint.
 *   - This document stores no verified facts.  Eligibility is read from the
 *     existing `EligibilityAttestation` collection, which already owns that
 *     data, so there is exactly one source of truth per fact.
 *   - Erasure: deleting the profile removes every interest the student stated.
 *     See docs/scholarships/personalized-matching.md.
 */
@Schema({ timestamps: true, collection: 'scholarship_interest_profiles' })
export class ScholarshipInterestProfile {
  @Prop({ required: true, unique: true, index: true })
  studentId: string;

  /** Normalized, screened interests.  Max 25 enforced by the DTO. */
  @Prop({ type: [String], default: [] })
  interests: string[];

  /** Raw tags refused by the protected-trait screen, for user feedback only. */
  @Prop({ type: [String], default: [] })
  rejectedInterests: string[];

  /**
   * Explicit opt-out from personalized ranking.  When true the ranker falls
   * back to cold-start ordering and never reads `interests`.
   */
  @Prop({ required: true, default: false })
  matchingOptedOut: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ScholarshipInterestProfileSchema =
  SchemaFactory.createForClass(ScholarshipInterestProfile);

/**
 * Belt-and-braces enforcement at the persistence layer.
 *
 * The service already screens tags, but a direct `save()` from a future code
 * path (a seed script, an admin tool, a data import) would otherwise be able to
 * write a protected trait into the ranking input.  Validators below reject the
 * document rather than silently coercing it, so the bug is loud.
 */
ScholarshipInterestProfileSchema.pre('validate', function () {
  const interests = (this as ScholarshipInterestProfile).interests ?? [];
  const offender = interests.find((tag) => containsProtectedTrait(tag));
  if (offender) {
    throw new Error(
      `Interest "${offender}" names a protected characteristic and cannot be used for ranking`,
    );
  }
  const unnormalized = interests.filter(
    (tag) => tag !== normalizeInterest(tag),
  );
  if (unnormalized.length > 0) {
    throw new Error(
      `Interests must be normalized before persistence: ${unnormalized.join(', ')}`,
    );
  }
});

export type ScholarshipMatchDismissalDocument =
  HydratedDocument<ScholarshipMatchDismissal>;

/** Why a student dismissed a recommendation. Drives cold-start diversity. */
export enum MatchDismissalReason {
  /** "Not interested in this subject." */
  NOT_INTERESTED = 'not_interested',
  /** "I already have funding for this." */
  ALREADY_FUNDED = 'already_funded',
  /** "I do not meet the requirements." */
  NOT_ELIGIBLE = 'not_eligible',
  /** "I do not want to see this sponsor again." */
  SPONSOR_NOT_WANTED = 'sponsor_not_wanted',
  /** Free-text reason supplied by the student. */
  OTHER = 'other',
}

/**
 * One student's decision that a program should stop being recommended
 * (#1176).
 *
 * Dismissal is a hard filter, not a score penalty: a dismissed program is
 * removed from the candidate set before scoring, so it can never reappear
 * through a scoring change or a tie-break.
 *
 * Ownership / tenancy:
 *   - `studentId` is the owner.  `organizationId` is denormalized from the
 *     program purely so the `SPONSOR_NOT_WANTED` rule can hide a whole sponsor
 *     without a second query.  A dismissal never reveals anything about another
 *     student.
 *
 * Privacy:
 *   - `note` is free text the student chose to type; it is never surfaced to
 *     sponsors and is included in the student's data export/erasure scope.
 *   - Withdrawn on erasure, together with the profile.
 */
@Schema({ timestamps: true, collection: 'scholarship_match_dismissals' })
export class ScholarshipMatchDismissal {
  @Prop({ required: true, index: true })
  studentId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ScholarshipProgram' })
  programId: Types.ObjectId;

  /** Denormalized from the program for sponsor-level suppression. */
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, enum: MatchDismissalReason })
  reason: MatchDismissalReason;

  @Prop({ trim: true, maxlength: 500 })
  note?: string;

  @Prop({ type: [String], default: [] })
  /** Which signal kinds the student objected to, when known. */
  flaggedSignals: RankableSignalKind[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const ScholarshipMatchDismissalSchema =
  SchemaFactory.createForClass(ScholarshipMatchDismissal);

// A student dismisses a program once; re-dismissing updates the reason.
ScholarshipMatchDismissalSchema.index(
  { studentId: 1, programId: 1 },
  { unique: true },
);
ScholarshipMatchDismissalSchema.index({ studentId: 1, organizationId: 1 });
