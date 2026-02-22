export class CreateFaqManagementDto {
  title!: string;
  description?: string;
  metadata?: Record<string, unknown>;
}
