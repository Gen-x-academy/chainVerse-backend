import {
  BadRequestException,
  Body,
  Controller,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { WorkerService } from './worker.service';
import { UploadWorkerFileDto } from './dto/upload-worker-file.dto';

const uploadDirectory = 'uploads/worker';

@Controller('worker')
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          mkdirSync(uploadDirectory, { recursive: true });
          callback(null, uploadDirectory);
        },
        filename: (_req, file, callback) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const extension = extname(file.originalname) || '';
          callback(null, `${uniqueSuffix}${extension.toLowerCase()}`);
        },
      }),
    }),
  )
  upload(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^(application\/pdf|image\/png|image\/jpeg)$/ })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: 400,
        }),
    )
    file: Express.Multer.File,
    @Body() payload: UploadWorkerFileDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.workerService.processUpload(file, payload);
  }
}
