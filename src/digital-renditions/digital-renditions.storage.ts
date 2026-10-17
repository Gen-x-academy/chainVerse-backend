import { Injectable, NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';

export interface DigitalRenditionContent {
  stream: Readable;
  contentType: string;
  contentLength?: number;
  filename: string;
}

export interface DigitalRenditionStorage {
  getContent(renditionId: string): Promise<DigitalRenditionContent>;
}

/**
 * Storage adapter.
 *
 * Replace the implementation of getContent() with the project's
 * existing S3/GCS/Azure/local storage implementation.
 *
 * The controller must NEVER receive a public storage URL.
 */
@Injectable()
export class DigitalRenditionStorageService implements DigitalRenditionStorage {
  async getContent(renditionId: string): Promise<DigitalRenditionContent> {
    /*
     * TODO: Replace with the project's actual storage implementation.
     *
     * Example:
     *   const rendition = await this.renditionRepository.findById(renditionId);
     *   const object = await this.s3.getObject({ Bucket: rendition.bucket, Key: rendition.storageKey });
     *   return {
     *     stream: object.Body as Readable,
     *     contentType: rendition.contentType,
     *     contentLength: rendition.size,
     *     filename: rendition.filename,
     *   };
     */
    void renditionId;
    throw new NotFoundException('Rendition content not found');
  }
}
