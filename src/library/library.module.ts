import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PaginationModule } from '../common/pagination/pagination.module';

import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';
import {
  LibraryConfig,
  LibraryConfigSchema,
} from './schemas/library-config.schema';
import { PatronNote, PatronNoteSchema } from './schemas/patron-note.schema';
import {
  BookReview,
  BookReviewSchema,
  ContentReport,
  ContentReportSchema,
} from './schemas/book-review.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LibraryConfig.name, schema: LibraryConfigSchema },
      { name: PatronNote.name, schema: PatronNoteSchema },
      { name: BookReview.name, schema: BookReviewSchema },
      { name: ContentReport.name, schema: ContentReportSchema },
    ]),
    PaginationModule,
  ],
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
