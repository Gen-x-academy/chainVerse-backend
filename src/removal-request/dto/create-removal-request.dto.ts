export class CreateRemovalRequestDto {
  contentId!: string;
  contentType!: string;
  reason!: string;
  metadata?: Record<string, unknown>;
}
