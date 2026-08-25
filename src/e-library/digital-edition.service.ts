import { Injectable, BadRequestException } from '@nestjs/common';

export type DigitalFormat = 'EPUB' | 'PDF' | 'AUDIOBOOK' | 'ACCESSIBLE_TEXT';
export type DrmPolicy = 'none' | 'watermark' | 'drm_locked';

export interface DigitalRendition {
  id: string;
  editionId: string;
  format: DigitalFormat;
  mimeType: string;
  storageKey: string;
  checksum: string;
  sizeBytes: number;
  drmPolicy: DrmPolicy;
  available: boolean;
}

export interface CreateRenditionDto {
  editionId: string;
  format: DigitalFormat;
  mimeType: string;
  storageKey: string;
  checksum: string;
  sizeBytes: number;
  drmPolicy?: DrmPolicy;
}

const ALLOWED_MIME_TYPES: Record<DigitalFormat, string> = {
  EPUB: 'application/epub+zip',
  PDF: 'application/pdf',
  AUDIOBOOK: 'audio/mpeg',
  ACCESSIBLE_TEXT: 'text/plain',
};

/**
 * Models digital editions with format, checksum, size, storage key, and DRM.
 *
 * addRendition()     – validates format/MIME pairing and checksum presence;
 *                      raw storage paths are never exposed externally.
 * getRenditions()    – returns only available renditions for an edition.
 *
 * Resolves #980
 */
@Injectable()
export class DigitalEditionService {
  private readonly renditions: DigitalRendition[] = [];

  /**
   * Add a digital rendition to an edition.
   * Validates MIME type matches format and checksum is present.
   */
  addRendition(dto: CreateRenditionDto): DigitalRendition {
    const expectedMime = ALLOWED_MIME_TYPES[dto.format];
    if (dto.mimeType !== expectedMime) {
      throw new BadRequestException(
        `MIME type '${dto.mimeType}' is invalid for format '${dto.format}'. Expected '${expectedMime}'.`,
      );
    }
    if (!dto.checksum || dto.checksum.trim().length === 0) {
      throw new BadRequestException('Checksum is required for all renditions.');
    }
    if (dto.sizeBytes <= 0) {
      throw new BadRequestException('File size must be greater than zero.');
    }

    const rendition: DigitalRendition = {
      id: `rendition-${Date.now()}`,
      editionId: dto.editionId,
      format: dto.format,
      mimeType: dto.mimeType,
      // storageKey kept server-side; never expose raw path in API responses
      storageKey: dto.storageKey,
      checksum: dto.checksum,
      sizeBytes: dto.sizeBytes,
      drmPolicy: dto.drmPolicy ?? 'none',
      available: true,
    };

    this.renditions.push(rendition);
    return rendition;
  }

  /**
   * Returns available renditions for an edition.
   * storageKey is excluded from the returned objects to prevent raw path exposure.
   */
  getRenditions(editionId: string): Omit<DigitalRendition, 'storageKey'>[] {
    return this.renditions
      .filter((r) => r.editionId === editionId && r.available)
      .map(({ storageKey, ...safe }) => safe);
  }
}