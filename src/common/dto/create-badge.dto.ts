export class CreateBadgeDto {
  name!: string;
  description?: string;
  imageUrl?: string;
  nftTokenId?: string;
  criteria?: string;
  metadata?: Record<string, unknown>;
}
