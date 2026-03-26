export class CreatePointsDto {
  userId!: string;
  points!: number;
  reason!: string;
  activityType!: string;
  metadata?: Record<string, unknown>;
}
