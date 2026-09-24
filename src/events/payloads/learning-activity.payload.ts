export class LearningActivityPayload {
  userId: string;
  timezone?: string;
  activityType: string;
  metadata?: Record<string, unknown>;
}
