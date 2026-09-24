import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LibraryCatalogController } from './library-catalog.controller';
import { LibraryCatalogService } from './library-catalog.service';
import { LibraryHoldsController } from './library-holds.controller';
import { LibraryHoldsService } from './library-holds.service';
import { Book, BookSchema } from './schemas/book.schema';
import { BookCopy, BookCopySchema } from './schemas/book-copy.schema';
import { LibraryHold, LibraryHoldSchema } from './schemas/library-hold.schema';
import {
  LibraryClosure,
  LibraryClosureSchema,
} from './schemas/library-closure.schema';
import {
  HoldAuditLog,
  HoldAuditLogSchema,
} from './schemas/hold-audit-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Book.name, schema: BookSchema },
      { name: BookCopy.name, schema: BookCopySchema },
      { name: LibraryHold.name, schema: LibraryHoldSchema },
      { name: LibraryClosure.name, schema: LibraryClosureSchema },
      { name: HoldAuditLog.name, schema: HoldAuditLogSchema },
    ]),
  ],
  controllers: [LibraryCatalogController, LibraryHoldsController],
  providers: [LibraryCatalogService, LibraryHoldsService],
})
export class LibraryHoldsModule {}
