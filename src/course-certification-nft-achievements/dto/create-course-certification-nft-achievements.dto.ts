export class CreateCourseCertificationNftAchievementsDto {
  title!: string;
  /** ID of the student receiving this certificate. Required to fire the certificate.issued event. */
  studentId!: string;
  description?: string;
  metadata?: Record<string, unknown>;
}
