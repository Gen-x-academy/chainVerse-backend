export class CreateContactMessageDto {
  title!: string;
  description?: string;
  metadata?: Record<string, unknown>;
}
