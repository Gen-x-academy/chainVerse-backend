export class UpdateNotificationDto {
  title?: string;
  message?: string;
  type?: string;
  isRead?: boolean;
  metadata?: Record<string, unknown>;
}
