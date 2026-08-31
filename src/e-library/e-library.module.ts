import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaginationModule } from '../common/pagination/pagination.module';
import { NotificationModule } from '../notification/notification.module';

// ── Schemas ──────────────────────────────────────────────────────────────────
import { Book, BookSchema } from './schemas/book.schema';
import { LibraryPolicy, LibraryPolicySchema } from './schemas/library-policy.schema';
import { Hold, HoldSchema } from './schemas/hold.schema';
import { Loan, LoanSchema } from './schemas/loan.schema';
import { AutoRenewalRun, AutoRenewalRunSchema } from './schemas/auto-renewal-run.schema';
import { BookCopy, BookCopySchema } from './schemas/book-copy.schema';
import { Donor, DonorSchema } from './schemas/donor.schema';
import { Donation, DonationSchema } from './schemas/donation.schema';
import { LibraryLocation, LibraryLocationSchema } from './schemas/library-location.schema';
import { StocktakeSession, StocktakeSessionSchema } from './schemas/stocktake-session.schema';
import { PatronProfile, PatronProfileSchema } from './schemas/patron-profile.schema';
import { PatronBalance, PatronBalanceSchema } from './schemas/patron-balance.schema';
import { LedgerEntry, LedgerEntrySchema } from './schemas/ledger-entry.schema';
import { ChargePolicy, ChargePolicySchema } from './schemas/charge-policy.schema';
import { SchedulerJobRun, SchedulerJobRunSchema } from './schemas/scheduler-job-run.schema';
import { DigitalLoan, DigitalLoanSchema } from './schemas/digital-loan.schema';
import { WaiverRequest, WaiverRequestSchema } from './schemas/waiver-request.schema';
import { ReminderLog, ReminderLogSchema } from './schemas/reminder-log.schema';
import { ReminderPreference, ReminderPreferenceSchema } from './schemas/reminder-preference.schema';
import { ELibraryAuditLog, ELibraryAuditLogSchema } from './schemas/audit-log.schema';
import { ClosureCalendar, ClosureCalendarSchema } from './schemas/closure-calendar.schema';
import { BorrowerPreference, BorrowerPreferenceSchema } from './schemas/borrower-preference.schema';
import { BookReview, BookReviewSchema } from './schemas/book-review.schema';
import { ContentReport, ContentReportSchema } from './schemas/content-report.schema';
import { NotificationEvent, NotificationEventSchema } from './schemas/notification-event.schema';
import { PatronNote, PatronNoteSchema } from './schemas/patron-note.schema';
import { SavedList, SavedListSchema } from './schemas/saved-list.schema';

// ── New schemas: Issue #1037 / #1038 / #1039 ─────────────────────────────────
import {
  LibraryChargePayment,
  LibraryChargePaymentSchema,
} from './schemas/library-charge-payment.schema';
import { LostItem, LostItemSchema } from './schemas/lost-item.schema';
import {
  BorrowingSuspension,
  BorrowingSuspensionSchema,
} from './schemas/borrowing-suspension.schema';

// ── New schemas: Issue #992 / #990 ────────────────────────────────────────────
import {
  AcquisitionOrder,
  AcquisitionOrderSchema,
} from './schemas/acquisition-order.schema';
import { ImportJob, ImportJobSchema } from './schemas/import-job.schema';

// ── Root services ────────────────────────────────────────────────────────────
import { BooksService } from './books.service';
import { LoanService } from './services/loan.service';
import { LibraryPolicyService } from './library-policy.service';
import { HoldsService } from './holds.service';
import { LoansService } from './loans.service';
import { AutoRenewalService } from './auto-renewal.service';
import { LibraryTransactionRunner } from './mongo-transaction-runner';

// ── Root controllers ─────────────────────────────────────────────────────────
import { BooksController } from './books.controller';
import { LibraryPolicyController } from './library-policy.controller';
import { HoldsController } from './holds.controller';
import { LoansController } from './loans.controller';

// ── Sub-directory services ───────────────────────────────────────────────────
import { ELibraryAuditService } from './services/elibrary-audit.service';
import { PatronNoteService } from './services/patron-note.service';
import { ContentReportService } from './services/content-report.service';
import { BookReviewService } from './services/book-review.service';
import { NotificationEventService } from './services/notification-event.service';
import { BorrowerPreferenceService } from './services/borrower-preference.service';
import { ReminderSchedulerService } from './services/reminder-scheduler.service';
import { CirculationMetricsService } from './services/circulation-metrics.service';
import { CollectionReportService } from './services/collection-report.service';
import { ReadingListReportService } from './services/reading-list-report.service';
import { ClosureCalendarService } from './services/closure-calendar.service';
import { BorrowerLoansService } from './services/borrower-loans.service';
import { PatronProfileService } from './services/patron-profile.service';
import { BorrowingPolicyService } from './services/borrowing-policy.service';
import { SavedListService } from './services/saved-list.service';
import { BarcodeService } from './services/barcode.service';
import { PhysicalCheckoutService } from './services/physical-checkout.service';
import { PhysicalReturnService } from './services/physical-return.service';
import { DigitalCheckoutService } from './services/digital-checkout.service';
import { DigitalReturnService } from './services/digital-return.service';
import { DonorService } from './services/donor.service';
import { LocationService } from './services/location.service';
import { StocktakeService } from './services/stocktake.service';
import { OverdueSchedulerService } from './services/overdue-scheduler.service';
import { FineCalculationService } from './services/fine-calculation.service';
import { ChargePolicyService } from './services/charge-policy.service';
import { LedgerService } from './services/ledger.service';
import { WaiverService } from './services/waiver.service';
import { DigitalEditionService } from './services/digital-edition.service';
import { CatalogLifecycleService } from './services/catalog-lifecycle.service';

// ── New: Operations services (Issue #1074) ──────────────────────────────────
import { LibraryHealthService } from './services/library-health.service';
import { ReconciliationService } from './services/reconciliation.service';
import { BackupService } from './services/backup.service';

// ── New: Issue #997 / #998 ───────────────────────────────────────────────────
import { CoverImageService } from './services/cover-image.service';
import { InventoryService } from './services/inventory.service';

// ── New: Interoperability service (Issue #1073) ─────────────────────────────
import { CatalogMappingService } from './services/catalog-mapping.service';

// ── New: Issue #1037 / #1038 / #1039 services ────────────────────────────────
import { LibraryChargePaymentService } from './services/library-charge-payment.service';
import { LostItemService } from './services/lost-item.service';
import { BorrowingSuspensionService } from './services/borrowing-suspension.service';

// ── New: Issue #992 / #991 / #990 / #989 services ─────────────────────────────
import { AcquisitionOrderService } from './services/acquisition-order.service';
import { CatalogExportService } from './services/catalog-export.service';
import { CatalogImportService } from './services/catalog-import.service';
import { DuplicateDetectionService } from './services/duplicate-detection.service';

// ── Sub-directory controllers ────────────────────────────────────────────────
import { ELibraryAuditController } from './controllers/elibrary-audit.controller';
import { PatronNoteController } from './controllers/patron-note.controller';
import { ContentReportController } from './controllers/content-report.controller';
import { BookReviewController } from './controllers/book-review.controller';
import { NotificationEventController } from './controllers/notification-event.controller';
import { BorrowerPreferenceController } from './controllers/borrower-preference.controller';
import { ReminderController } from './controllers/reminder.controller';
import { CirculationMetricsController } from './controllers/circulation-metrics.controller';
import { CollectionReportController } from './controllers/collection-report.controller';
import { ReadingListReportController } from './controllers/reading-list-report.controller';
import { ClosureCalendarController } from './controllers/closure-calendar.controller';
import { BorrowerController } from './controllers/borrower.controller';
import { PatronController } from './controllers/patron.controller';
import { SavedListController } from './controllers/saved-list.controller';
import { BarcodeController } from './controllers/barcode.controller';
import { PhysicalCirculationController } from './controllers/physical-circulation.controller';
import { DigitalCirculationController } from './controllers/digital-circulation.controller';
import { DonorController } from './controllers/donor.controller';
import { LocationController } from './controllers/location.controller';
import { StocktakeController } from './controllers/stocktake.controller';
import { OverdueController } from './controllers/overdue.controller';
import { FinesController } from './controllers/fines.controller';
import { LedgerController } from './controllers/ledger.controller';
import { WaiverController } from './controllers/waiver.controller';
import { ChargePolicyController } from './controllers/charge-policy.controller';

// ── New: Operations controller (Issue #1074) ────────────────────────────────
import { LibraryHealthController } from './controllers/library-health.controller';

// ── New: Interoperability controller (Issue #1073) ──────────────────────────
import { CatalogMappingController } from './controllers/catalog-mapping.controller';

// ── New: Issue #997 / #998 / #1000 controllers ──────────────────────────────
import { PublicCatalogController } from './controllers/public-catalog.controller';
import { CatalogAdminController } from './controllers/catalog-admin.controller';
import { InventoryController } from './controllers/inventory.controller';

// ── New: Issue #1037 / #1038 / #1039 controllers ─────────────────────────────
import { LibraryChargePaymentController } from './controllers/library-charge-payment.controller';
import { LostItemController } from './controllers/lost-item.controller';
import { BorrowingSuspensionController } from './controllers/borrowing-suspension.controller';

// ── New: Issue #992 / #991 / #990 / #989 controllers ─────────────────────────
import { AcquisitionOrderController } from './controllers/acquisition-order.controller';
import { CatalogExportController } from './controllers/catalog-export.controller';
import { CatalogImportController } from './controllers/catalog-import.controller';
import { DuplicateDetectionController } from './controllers/duplicate-detection.controller';

// ── Guards ───────────────────────────────────────────────────────────────────
import { LibraryOwnerGuard } from './guards/library-owner.guard';
import { LibraryRateLimitGuard } from './guards/library-rate-limit.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Book.name, schema: BookSchema },
      { name: LibraryPolicy.name, schema: LibraryPolicySchema },
      { name: Hold.name, schema: HoldSchema },
      { name: Loan.name, schema: LoanSchema },
      { name: AutoRenewalRun.name, schema: AutoRenewalRunSchema },
      { name: BookCopy.name, schema: BookCopySchema },
      { name: Donor.name, schema: DonorSchema },
      { name: Donation.name, schema: DonationSchema },
      { name: LibraryLocation.name, schema: LibraryLocationSchema },
      { name: StocktakeSession.name, schema: StocktakeSessionSchema },
      { name: PatronProfile.name, schema: PatronProfileSchema },
      { name: PatronBalance.name, schema: PatronBalanceSchema },
      { name: LedgerEntry.name, schema: LedgerEntrySchema },
      { name: ChargePolicy.name, schema: ChargePolicySchema },
      { name: SchedulerJobRun.name, schema: SchedulerJobRunSchema },
      { name: DigitalLoan.name, schema: DigitalLoanSchema },
      { name: WaiverRequest.name, schema: WaiverRequestSchema },
      { name: ReminderLog.name, schema: ReminderLogSchema },
      { name: ReminderPreference.name, schema: ReminderPreferenceSchema },
      { name: ELibraryAuditLog.name, schema: ELibraryAuditLogSchema },
      { name: ClosureCalendar.name, schema: ClosureCalendarSchema },
      { name: BorrowerPreference.name, schema: BorrowerPreferenceSchema },
      { name: BookReview.name, schema: BookReviewSchema },
      { name: ContentReport.name, schema: ContentReportSchema },
      { name: NotificationEvent.name, schema: NotificationEventSchema },
      { name: PatronNote.name, schema: PatronNoteSchema },
      { name: SavedList.name, schema: SavedListSchema },
      // Issue #1037 — Stellar charge payments
      { name: LibraryChargePayment.name, schema: LibraryChargePaymentSchema },
      // Issue #1038 — Lost items
      { name: LostItem.name, schema: LostItemSchema },
      // Issue #1039 — Borrowing suspensions
      { name: BorrowingSuspension.name, schema: BorrowingSuspensionSchema },
      // Issue #992 — Acquisition orders
      { name: AcquisitionOrder.name, schema: AcquisitionOrderSchema },
      // Issue #990 — Import jobs
      { name: ImportJob.name, schema: ImportJobSchema },
    ]),
    PaginationModule,
    NotificationModule,
  ],
  controllers: [
    BooksController,
    LibraryPolicyController,
    HoldsController,
    LoansController,
    DonorController,
    LocationController,
    StocktakeController,
    BarcodeController,
    ELibraryAuditController,
    PatronNoteController,
    ContentReportController,
    BookReviewController,
    NotificationEventController,
    BorrowerPreferenceController,
    ReminderController,
    CirculationMetricsController,
    CollectionReportController,
    ReadingListReportController,
    ClosureCalendarController,
    BorrowerController,
    PatronController,
    SavedListController,
    PhysicalCirculationController,
    DigitalCirculationController,
    OverdueController,
    FinesController,
    LedgerController,
    WaiverController,
    ChargePolicyController,
    // Issue #1074
    LibraryHealthController,
    // Issue #1073
    CatalogMappingController,
    // Issue #997 / #998 / #1000
    PublicCatalogController,
    CatalogAdminController,
    InventoryController,
    // Issue #1037 — Stellar charge payments
    LibraryChargePaymentController,
    // Issue #1038 — Lost items
    LostItemController,
    // Issue #1039 — Borrowing suspensions
    BorrowingSuspensionController,
    // Issue #992 — Acquisition orders
    AcquisitionOrderController,
    // Issue #991 — Catalog export
    CatalogExportController,
    // Issue #990 — Catalog import
    CatalogImportController,
    // Issue #989 — Duplicate detection / merge
    DuplicateDetectionController,
  ],
  providers: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    LoanService,
    AutoRenewalService,
    LibraryTransactionRunner,
    DonorService,
    LocationService,
    StocktakeService,
    BarcodeService,
    ELibraryAuditService,
    PatronNoteService,
    ContentReportService,
    BookReviewService,
    NotificationEventService,
    BorrowerPreferenceService,
    ReminderSchedulerService,
    CirculationMetricsService,
    CollectionReportService,
    ReadingListReportService,
    ClosureCalendarService,
    BorrowerLoansService,
    PatronProfileService,
    BorrowingPolicyService,
    SavedListService,
    PhysicalCheckoutService,
    PhysicalReturnService,
    DigitalCheckoutService,
    DigitalReturnService,
    OverdueSchedulerService,
    FineCalculationService,
    ChargePolicyService,
    LedgerService,
    WaiverService,
    DigitalEditionService,
    CatalogLifecycleService,
    LibraryOwnerGuard,
    LibraryRateLimitGuard,
    // Issue #1074
    LibraryHealthService,
    ReconciliationService,
    BackupService,
    // Issue #1073
    CatalogMappingService,
    // Issue #997 / #998
    CoverImageService,
    InventoryService,
    // Issue #1037 — Stellar charge payments
    LibraryChargePaymentService,
    // Issue #1038 — Lost items
    LostItemService,
    // Issue #1039 — Borrowing suspensions
    BorrowingSuspensionService,
    // Issue #992 — Acquisition orders
    AcquisitionOrderService,
    // Issue #991 — Catalog export
    CatalogExportService,
    // Issue #990 — Catalog import
    CatalogImportService,
    // Issue #989 — Duplicate detection / merge
    DuplicateDetectionService,
  ],
  exports: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    BarcodeService,
    PatronProfileService,
    BorrowingPolicyService,
    // Issue #1039: exported so other modules can trigger reconciliation after
    // returns/payments.
    BorrowingSuspensionService,
  ],
})
export class ELibraryModule {}
