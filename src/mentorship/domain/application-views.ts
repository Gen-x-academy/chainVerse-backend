import { allowedDecisions } from './application-transitions';
import {
  ApplicationStatus,
  ReservationStatus,
} from '../enums/mentorship.enums';
import { MentorshipApplication } from '../schemas/mentorship-application.schema';
import { MentorshipApplicationDecision } from '../schemas/mentorship-application-decision.schema';

type WithId<T> = T & { _id: { toString(): string } };
type ApplicationRecord = WithId<MentorshipApplication>;
type DecisionRecord = WithId<MentorshipApplicationDecision>;

const idOf = (value: { toString(): string } | null | undefined) =>
  value ? value.toString() : null;

/**
 * A decision is visible to the applicant once it takes effect. Withdrawals by
 * the applicant are always effective immediately.
 */
export function isEffective(
  decision: { effectiveAt: Date },
  now: Date,
): boolean {
  return new Date(decision.effectiveAt).getTime() <= now.getTime();
}

/**
 * Status as the applicant is allowed to see it: the stored status, unless a
 * decision has been recorded that has not taken effect yet, in which case the
 * status from just before the first pending decision.
 */
export function applicantVisibleStatus(
  application: Pick<MentorshipApplication, 'status'>,
  decisions: Pick<
    MentorshipApplicationDecision,
    'effectiveAt' | 'fromStatus' | 'sequence'
  >[],
  now: Date,
): ApplicationStatus {
  const firstPending = [...decisions]
    .sort((a, b) => a.sequence - b.sequence)
    .find((decision) => !isEffective(decision, now));
  return firstPending ? firstPending.fromStatus : application.status;
}

/** Decision as the applicant sees it: no internal reason, note or actor. */
export function toApplicantDecision(decision: DecisionRecord) {
  return {
    id: decision._id.toString(),
    type: decision.type,
    status: decision.toStatus,
    reasonCode: decision.applicantReasonCode,
    message: decision.applicantMessage ?? null,
    effectiveAt: decision.effectiveAt,
  };
}

/** Full decision for reviewers and staff. */
export function toInternalDecision(decision: DecisionRecord) {
  return {
    id: decision._id.toString(),
    applicationId: idOf(decision.applicationId),
    sequence: decision.sequence,
    type: decision.type,
    fromStatus: decision.fromStatus,
    toStatus: decision.toStatus,
    applicantReasonCode: decision.applicantReasonCode,
    applicantMessage: decision.applicantMessage ?? null,
    internalReasonCode: decision.internalReasonCode ?? null,
    internalNote: decision.internalNote ?? null,
    effectiveAt: decision.effectiveAt,
    communicationPolicy: decision.communicationPolicy,
    actor: {
      id: idOf(decision.actorId),
      role: decision.actorRole,
      kind: decision.actorKind,
    },
    recordedAt: decision.createdAt ?? null,
  };
}

/**
 * Application as the applicant sees it. The concurrency `version` and the
 * seat reservation are omitted: both change when a not-yet-effective
 * decision is recorded and would leak it.
 */
export function toApplicantApplication(
  application: ApplicationRecord,
  decisions: DecisionRecord[],
  now: Date,
) {
  const status = applicantVisibleStatus(application, decisions, now);
  return {
    id: application._id.toString(),
    programId: idOf(application.programId),
    status,
    attemptNumber: application.attemptNumber,
    previousApplicationId: idOf(application.previousApplicationId),
    supersededByApplicationId: idOf(application.supersededByApplicationId),
    motivation: application.motivation,
    goals: application.goals,
    consent: {
      version: application.consent.version,
      acceptedAt: application.consent.acceptedAt,
    },
    informationResponses: application.informationResponses,
    withdrawnAt: application.withdrawnAt,
    decisions: decisions
      .filter((decision) => isEffective(decision, now))
      .sort((a, b) => a.sequence - b.sequence)
      .map(toApplicantDecision),
    createdAt: application.createdAt ?? null,
    updatedAt: application.updatedAt ?? null,
  };
}

/** Application for reviewers and staff, including what they may do next. */
export function toInternalApplication(
  application: ApplicationRecord,
  decisions?: DecisionRecord[],
) {
  return {
    id: application._id.toString(),
    programId: idOf(application.programId),
    applicantId: idOf(application.applicantId),
    status: application.status,
    isActive: application.isActive,
    version: application.version,
    allowedDecisions: allowedDecisions(application.status),
    attemptNumber: application.attemptNumber,
    previousApplicationId: idOf(application.previousApplicationId),
    rootApplicationId: idOf(application.rootApplicationId),
    supersededByApplicationId: idOf(application.supersededByApplicationId),
    motivation: application.motivation,
    goals: application.goals,
    consent: {
      version: application.consent.version,
      acceptedAt: application.consent.acceptedAt,
    },
    reservation: {
      status: application.reservation?.status ?? ReservationStatus.NONE,
      heldAt: application.reservation?.heldAt ?? null,
      releasedAt: application.reservation?.releasedAt ?? null,
    },
    informationResponses: application.informationResponses,
    withdrawnAt: application.withdrawnAt,
    closedAt: application.closedAt,
    ...(decisions
      ? {
          decisions: [...decisions]
            .sort((a, b) => a.sequence - b.sequence)
            .map(toInternalDecision),
        }
      : {}),
    createdAt: application.createdAt ?? null,
    updatedAt: application.updatedAt ?? null,
  };
}
