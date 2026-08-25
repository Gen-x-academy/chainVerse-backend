import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LibraryAuditLog,
  LibraryAuditLogSchema,
} from './schemas/library-audit-log.schema';
import { LibraryAuditService } from './library-audit.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LibraryAuditLog.name, schema: LibraryAuditLogSchema },
    ]),
  ],
  providers: [LibraryAuditService],
  exports: [LibraryAuditService],
})
export class LibraryAuditModule {}