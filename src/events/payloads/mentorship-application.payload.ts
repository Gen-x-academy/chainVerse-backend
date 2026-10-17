/**
 * Payloads carry identifiers and applicant-visible data only. Internal
 * reason codes and notes never leave the mentorship module.
 */
export class MentorshipApplicationDecidedPayload {
  applicationId: string;
  programId: string;
  applicantId: string;
  decisionId: string;
  decisionType: string;
  fromStatus: string;
  toStatus: string;
  effectiveAt: string;
}

export class MentorshipApplicationWithdrawnPayload {
  applicationId: string;
  programId: string;
  applicantId: string;
  decisionId: string;
  seatReleased: boolean;
}

export class MentorshipApplicationReappliedPayload {
  applicationId: string;
  previousApplicationId: string;
  programId: string;
  applicantId: string;
  attemptNumber: number;
}
