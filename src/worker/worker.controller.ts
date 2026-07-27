import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { WorkerService } from './worker.service';
import type { UploadedFileBuffer } from './worker.service';
import { UploadWorkerFileDto } from './dto/upload-worker-file.dto';
import { ALLOWED_MIME_TYPES } from './upload.constants';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { AuditActor } from '../common/audit/audit-context';
import type { AuditContext } from '../common/audit/audit-context';

/**
 * Hard ceiling enforced by multer before the body is buffered. The
 * configurable, per-request limit is re-checked in the service; this only stops
 * an unbounded stream from being read into memory in the first place.
 */
const MULTER_MAX_BYTES = 10 * 1024 * 1024;

@ApiBearerAuth('access-token')
@ApiTags('Worker Uploads')
@Controller('worker')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}

  /**
   * Uploads are buffered in memory rather than written straight to disk, so
   * nothing untrusted touches the filesystem until it has passed MIME, magic
   * byte and quota checks. The service then writes it to quarantine and scans
   * it; the response reports the resulting status.
   */
  @Post('upload')
  @ApiOperation({
    summary:
      'Upload a file (quarantined and scanned before it becomes available)',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MULTER_MAX_BYTES, files: 1, fields: 10 },
      fileFilter: (_req, file, callback) => {
        // Cheap pre-filter; the authoritative check is magic byte validation.
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          callback(
            new BadRequestException(
              `Unsupported content type "${file.mimetype}"`,
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  upload(
    @UploadedFile() file: UploadedFileBuffer,
    @Body() payload: UploadWorkerFileDto,
    @CurrentUser('sub') ownerId: string,
    @AuditActor() audit: AuditContext,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.workerService.processUpload(file, payload, ownerId, audit);
  }

  @Get('files')
  @ApiOperation({ summary: 'List your uploads and their scan status' })
  list(@CurrentUser('sub') ownerId: string) {
    return this.workerService.listUploads(ownerId);
  }

  @Get('files/:id')
  @ApiOperation({ summary: 'Get upload metadata and scan status' })
  getOne(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @CurrentUser('sub') requesterId: string,
    @CurrentUser('role') requesterRole: string,
  ) {
    return this.workerService.getUpload(id, requesterId, requesterRole);
  }

  /**
   * Serves the bytes. Returns 409 while the file is pending, scanning,
   * quarantined or unscannable — only a released file is readable.
   */
  @Get('files/:id/content')
  @ApiOperation({ summary: 'Download a released (scanned clean) file' })
  async download(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @CurrentUser('sub') requesterId: string,
    @CurrentUser('role') requesterRole: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, upload } = await this.workerService.openDownload(
      id,
      requesterId,
      requesterRole,
    );

    res.setHeader('Content-Type', upload.mimeType);
    // Always an attachment: never let the browser render uploaded content
    // inline on the API origin.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${upload.originalName}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return new StreamableFile(stream);
  }

  @Delete('files/:id')
  @ApiOperation({ summary: 'Delete an upload and its stored bytes' })
  remove(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @CurrentUser('sub') requesterId: string,
    @CurrentUser('role') requesterRole: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.workerService.deleteUpload(
      id,
      requesterId,
      requesterRole,
      audit,
    );
  }
}
