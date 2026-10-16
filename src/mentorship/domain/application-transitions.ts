import { ApplicationStatus, DecisionType } from '../enums/mentorship.enums';

/** Status each decision moves an application into. */
export const DECISION_TARGET_STATUS: Readonly<
  Record<DecisionType, ApplicationStatus>
> = {
  [DecisionType.ACCEPT]: ApplicationStatus.ACCEPTED,
  [DecisionType.REJECT]: ApplicationStatus.REJECTED,
  [DecisionType.WAITLIST]: ApplicationStatus.WAITLISTED,
  [DecisionType.REQUEST_INFORMATION]: ApplicationStatus.INFORMATION_REQUESTED,
  [DecisionType.WITHDRAW]: ApplicationStatus.WITHDRAWN,
};

/**
 * The full transition table. Anything not listed is rejected, so adding a
 * status is a compile-time prompt to decide where it may go.
 */
const ALLOWED_DECISIONS: Readonly<
  Record<ApplicationStatus, readonly DecisionType[]>
> = {
  [ApplicationStatus.SUBMITTED]: [
    DecisionType.ACCEPT,
    DecisionType.REJECT,
    DecisionType.WAITLIST,
    DecisionType.REQUEST_INFORMATION,
    DecisionType.WITHDRAW,
  ],
  [ApplicationStatus.INFORMATION_REQUESTED]: [
    DecisionType.ACCEPT,
    DecisionType.REJECT,
    DecisionType.WAITLIST,
    DecisionType.WITHDRAW,
  ],
  [ApplicationStatus.WAITLISTED]: [
    DecisionType.ACCEPT,
    DecisionType.REJECT,
    DecisionType.REQUEST_INFORMATION,
    DecisionType.WITHDRAW,
  ],
  // An accepted applicant may still withdraw (subject to the cutoff); no
  // review decision can reopen an acceptance.
  [ApplicationStatus.ACCEPTED]: [DecisionType.WITHDRAW],
  [ApplicationStatus.REJECTED]: [],
  [ApplicationStatus.WITHDRAWN]: [],
};

/** Statuses from which no reviewer action is possible. */
export const CLOSED_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
]);

/** Statuses that still count as the applicant's live application. */
export const ACTIVE_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.INFORMATION_REQUESTED,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.ACCEPTED,
];

export function allowedDecisions(
  status: ApplicationStatus,
): readonly DecisionType[] {
  return ALLOWED_DECISIONS[status] ?? [];
}

export function canApplyDecision(
  status: ApplicationStatus,
  decision: DecisionType,
): boolean {
  return allowedDecisions(status).includes(decision);
}

export function isActiveStatus(status: ApplicationStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}
