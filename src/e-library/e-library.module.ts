import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaginationModule } from '../common/pagination/pagination.module';
import { NotificationModule } from '../notification/notification.module';
import { Book, BookSchema } from './schemas/book.schema';
import {
  LibraryPolicy,
  LibraryPolicySchema,
} from './schemas/library-policy.schema';
import { Hold, HoldSchema } from './schemas/hold.schema';
import { Loan, LoanSchema } from './schemas/loan.schema';
import {
  AutoRenewalRun,
  AutoRenewalRunSchema,
} from './schemas/auto-renewal-run.schema';
import {
  PatronNote,
  PatronNoteSchema,
} from './schemas/patron-note.schema';
import {
  ContentReport,
  ContentReportSchema,
} from './schemas/content-report.schema';
import {
  BookReview,
  BookReviewSchema,
} from './schemas/book-review.schema';
import {
  NotificationEvent,
  NotificationEventSchema,
} from './schemas/notification-event.schema';
import {
  BorrowerPreference,
  BorrowerPreferenceSchema,
} from './schemas/borrower-preference.schema';
  ReminderPreference,
  ReminderPreferenceSchema,
} from './schemas/reminder-preference.schema';
import {
  ReminderLog,
  ReminderLogSchema,
} from './schemas/reminder-log.schema';
import { BooksService } from './books.service';
import { BooksController } from './books.controller';
import { LibraryPolicyService } from './library-policy.service';
import { LibraryPolicyController } from './library-policy.controller';
import { HoldsService } from './holds.service';
import { HoldsController } from './holds.controller';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { AutoRenewalService } from './auto-renewal.service';
import { LibraryTransactionRunner } from './mongo-transaction-runner';
import { PatronNoteService } from './services/patron-note.service';
import { PatronNoteController } from './controllers/patron-note.controller';
import { ContentReportService } from './services/content-report.service';
import { ContentReportController } from './controllers/content-report.controller';
import { BookReviewService } from './services/book-review.service';
import { BookReviewController } from './controllers/book-review.controller';
import { NotificationEventService } from './services/notification-event.service';
import { NotificationEventController } from './controllers/notification-event.controller';
import { BorrowerPreferenceService } from './services/borrower-preference.service';
import { BorrowerPreferenceController } from './controllers/borrower-preference.controller';
import { ReminderSchedulerService } from './services/reminder-scheduler.service';
import { ReminderController } from './controllers/reminder.controller';
import { CirculationMetricsService } from './services/circulation-metrics.service';
import { CirculationMetricsController } from './controllers/circulation-metrics.controller';
import { CollectionReportService } from './services/collection-report.service';
import { CollectionReportController } from './controllers/collection-report.controller';
import { ReadingListReportService } from './services/reading-list-report.service';
import { ReadingListReportController } from './controllers/reading-list-report.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Book.name, schema: BookSchema },
      { name: LibraryPolicy.name, schema: LibraryPolicySchema },
      { name: Hold.name, schema: HoldSchema },
      { name: Loan.name, schema: LoanSchema },
      { name: AutoRenewalRun.name, schema: AutoRenewalRunSchema },
      { name: PatronNote.name, schema: PatronNoteSchema },
      { name: ContentReport.name, schema: ContentReportSchema },
      { name: BookReview.name, schema: BookReviewSchema },
      { name: NotificationEvent.name, schema: NotificationEventSchema },
      { name: BorrowerPreference.name, schema: BorrowerPreferenceSchema },
      { name: ReminderPreference.name, schema: ReminderPreferenceSchema },
      { name: ReminderLog.name, schema: ReminderLogSchema },
    ]),
    PaginationModule,
    NotificationModule,
  ],
  controllers: [
    BooksController,
    LibraryPolicyController,
    HoldsController,
    LoansController,
    PatronNoteController,
    ContentReportController,
    BookReviewController,
    NotificationEventController,
    BorrowerPreferenceController,
    ReminderController,
    CirculationMetricsController,
    CollectionReportController,
    ReadingListReportController,
  ],
  providers: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    AutoRenewalService,
    LibraryTransactionRunner,
    PatronNoteService,
    ContentReportService,
    BookReviewService,
    NotificationEventService,
    BorrowerPreferenceService,
    ReminderSchedulerService,
    CirculationMetricsService,
    CollectionReportService,
    ReadingListReportService,
  ],
  exports: [BooksService, LibraryPolicyService, HoldsService, LoansService],
})
export class ELibraryModule {}
