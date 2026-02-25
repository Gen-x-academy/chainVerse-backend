export class CreateNotificationDto {
  userId!: string;
  title!: string;
  message!: string;
  type?: string;
  metadata?: Record<string, unknown>;
}
