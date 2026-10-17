/**
 * Deliberately carries identifiers only – no goals, answers or other free-text
 * the mentee entered – so listeners cannot leak application content.
 */
export class MentorshipApplicationSubmittedPayload {
  applicationId: string;
  menteeId: string;
  programId: string;
  formVersion: number;
  submittedAt: Date;
}
