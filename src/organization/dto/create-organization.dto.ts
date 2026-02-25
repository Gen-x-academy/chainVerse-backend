export class CreateOrganizationDto {
  name!: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  metadata?: Record<string, unknown>;
}
