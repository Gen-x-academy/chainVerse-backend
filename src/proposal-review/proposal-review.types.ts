export enum ReviewMode {
  BLINDED = 'blinded',
  OPEN = 'open',
}

export enum ReviewRole {
  APPLICANT = 'applicant',
  REVIEWER = 'reviewer',
  SENIOR_REVIEWER = 'senior-reviewer',
  REVIEW_COORDINATOR = 'review-coordinator',
  REVIEW_ADMIN = 'review-admin',
  AUDITOR = 'auditor',
}

export const REVIEWER_ROLES: readonly string[] = [
  ReviewRole.REVIEWER,
  ReviewRole.SENIOR_REVIEWER,
];

export const ADMIN_ROLES: readonly string[] = [
  ReviewRole.REVIEW_ADMIN,
  ReviewRole.REVIEW_COORDINATOR,
];

export const ALL_ROLES: readonly string[] = [
  ...REVIEWER_ROLES,
  ...ADMIN_ROLES,
  ReviewRole.APPLICANT,
  ReviewRole.AUDITOR,
];

export interface ReviewActor {
  tenantId: string;
  actorId: string;
  roles: readonly string[];
}
