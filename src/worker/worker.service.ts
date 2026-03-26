import { Injectable } from '@nestjs/common';
import { UploadWorkerFileDto } from './dto/upload-worker-file.dto';

@Injectable()
export class WorkerService {
  processUpload(file: Express.Multer.File, payload: UploadWorkerFileDto) {
    const tags = payload.tags
      ? payload.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

    return {
      id: crypto.randomUUID(),
      originalName: file.originalname,
      filename: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      path: file.path,
      title: payload.title ?? null,
      description: payload.description ?? null,
      tags,
      uploadedAt: new Date().toISOString(),
    };
  }
}
