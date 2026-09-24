import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkerController } from './worker.controller';
import { WorkerService } from './worker.service';
import { FileStorageService } from './file-storage.service';
import { MalwareScannerService } from './malware-scanner.service';
import {
  WorkerUpload,
  WorkerUploadSchema,
} from './schemas/worker-upload.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkerUpload.name, schema: WorkerUploadSchema },
    ]),
  ],
  controllers: [WorkerController],
  providers: [WorkerService, FileStorageService, MalwareScannerService],
  exports: [WorkerService],
})
export class WorkerModule {}
