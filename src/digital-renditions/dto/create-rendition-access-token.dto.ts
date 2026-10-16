import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const RENDITION_ACCESS_PURPOSES = ['read', 'download'] as const;

export type RenditionAccessPurpose =
  (typeof RENDITION_ACCESS_PURPOSES)[number];

export class CreateRenditionAccessTokenDto {
  @IsIn(RENDITION_ACCESS_PURPOSES)
  purpose!: RenditionAccessPurpose;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(900)
  ttlSeconds?: number;
}
