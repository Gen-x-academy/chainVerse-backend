import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaginationModule } from '../common/pagination/pagination.module';
import { NotificationModule } from '../notification/notification.module';

// Existing schemas
import { Book, BookSchema } from './schemas/book.schema';
import { LibraryPolicy, LibraryPolicySchema } from './schemas/library-policy.schema';
import { Hold, HoldSchema } from './schemas/hold.schema';
import { Loan, LoanSchema } from './schemas/loan.schema';
import { AutoRenewalRun, AutoRenewalRunSchema } from './schemas/auto-renewal-run.schema';

// New schemas (demilade18: #1013 physical checkout, #1014 digital checkout)
import { BookCopy, BookCopySchema } from './schemas/book-copy.schema';
import { DigitalLoan, DigitalLoanSchema } from './schemas/digital-loan.schema';

// Existing services
import { BooksService } from './books.service';
import { LibraryPolicyService } from './library-policy.service';
import { HoldsService } from './holds.service';
import { LoansService } from './loans.service';
import { AutoRenewalService } from './auto-renewal.service';
import { LibraryTransactionRunner } from './mongo-transaction-runner';
import { ELibraryAuditService } from './services/elibrary-audit.service';
import { ELibraryAuditController } from './controllers/elibrary-audit.controller';
import { LibraryOwnerGuard } from './guards/library-owner.guard';
import { LibraryRateLimitGuard } from './guards/library-rate-limit.guard';
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

// Existing controllers
import { BooksController } from './books.controller';
import { LibraryPolicyController } from './library-policy.controller';
import { HoldsController } from './holds.controller';
import { LoansController } from './loans.controller';

// New services (BigBen-7)
import { ClosureCalendarService } from './services/closure-calendar.service';
import { BorrowerLoansService } from './services/borrower-loans.service';

// New controllers (BigBen-7)
import { ClosureCalendarController } from './controllers/closure-calendar.controller';
import { BorrowerController } from './controllers/borrower.controller';

// Existing controllers
import { BooksController } from './books.controller';
import { LibraryPolicyController } from './library-policy.controller';
import { HoldsController } from './holds.controller';
import { LoansController } from './loans.controller';

// New services (NteinPrecious)
import { PatronProfileService } from './services/patron-profile.service';
import { BorrowingPolicyService } from './services/borrowing-policy.service';
import { SavedListService } from './services/saved-list.service';

// New controllers (NteinPrecious)
import { PatronController } from './controllers/patron.controller';
import { SavedListController } from './controllers/saved-list.controller';

// Existing controllers
import { BooksController } from './books.controller';
import { LibraryPolicyController } from './library-policy.controller';
import { HoldsController } from './holds.controller';
import { LoansController } from './loans.controller';

// New services (demilade18)
import { BarcodeService } from './services/barcode.service';
import { PhysicalCheckoutService } from './services/physical-checkout.service';
import { PhysicalReturnService } from './services/physical-return.service';
import { DigitalCheckoutService } from './services/digital-checkout.service';
import { DigitalReturnService } from './services/digital-return.service';

// New controllers (demilade18)
import { BarcodeController } from './controllers/barcode.controller';
import { PhysicalCirculationController } from './controllers/physical-circulation.controller';
import { DigitalCirculationController } from './controllers/digital-circulation.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Book.name, schema: BookSchema },
      { name: LibraryPolicy.name, schema: LibraryPolicySchema },
      { name: Hold.name, schema: HoldSchema },
      { name: Loan.name, schema: LoanSchema },
      { name: AutoRenewalRun.name, schema: AutoRenewalRunSchema },
      { name: BookCopy.name, schema: BookCopySchema },
      { name: DigitalLoan.name, schema: DigitalLoanSchema },
    ]),
    PaginationModule,
    NotificationModule,
  ],
  controllers: [
    BooksController,
    LibraryPolicyController,
    HoldsController,
    LoansController,
    BarcodeController,
    PhysicalCirculationController,
    DigitalCirculationController,
  ],
  providers: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    AutoRenewalService,
    LibraryTransactionRunner,
    BarcodeService,
    PhysicalCheckoutService,
    PhysicalReturnService,
    DigitalCheckoutService,
    DigitalReturnService,
  ],
  exports: [BooksService, LibraryPolicyService, HoldsService, LoansService, BarcodeService],
})
export class ELibraryModule {}
