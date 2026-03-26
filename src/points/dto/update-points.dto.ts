export class UpdatePointsDto {
  points?: number;
  reason?: string;
  activityType?: string;
  metadata?: Record<string, unknown>;
}
