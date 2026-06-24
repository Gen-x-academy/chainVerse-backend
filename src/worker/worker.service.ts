import { Injectable } from '@nestjs/common';
import { UploadWorkerFileDto } from './dto/upload-worker-file.dto';

export interface ProcessedFile {
  id: string;
  originalName: string;
  filename: string;
  mimeType: string;
  size: number;
  title: string | null;
  description: string | null;
  tags: string[];
  uploadedAt: string;
}

interface MulterFile {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class WorkerService {
  processUpload(file: MulterFile, payload: UploadWorkerFileDto): ProcessedFile {
    const tags = payload.tags
      ? payload.tags
          .split(',')
          .map((tag: string) => tag.trim())
          .filter(Boolean)
      : [];

    return {
      id: crypto.randomUUID(),
      originalName: file.originalname,
      filename: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      title: payload.title ?? null,
      description: payload.description ?? null,
      tags,
      uploadedAt: new Date().toISOString(),
    };
  }
}
