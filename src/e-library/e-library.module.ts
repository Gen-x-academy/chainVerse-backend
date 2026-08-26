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

// New schemas
import { BookCopy, BookCopySchema } from './schemas/book-copy.schema';
import { PatronProfile, PatronProfileSchema } from './schemas/patron-profile.schema';
import { SavedList, SavedListSchema } from './schemas/saved-list.schema';
import { Donor, DonorSchema } from './schemas/donor.schema';
import { Donation, DonationSchema } from './schemas/donation.schema';
import { LibraryLocation, LibraryLocationSchema } from './schemas/library-location.schema';
import { ClosureCalendar, ClosureCalendarSchema } from './schemas/closure-calendar.schema';
import { StocktakeSession, StocktakeSessionSchema } from './schemas/stocktake-session.schema';
import { DigitalLoan, DigitalLoanSchema } from './schemas/digital-loan.schema';

// Existing services
import { BooksService } from './books.service';
import { LibraryPolicyService } from './library-policy.service';
import { HoldsService } from './holds.service';
import { LoansService } from './loans.service';
import { AutoRenewalService } from './auto-renewal.service';
import { LibraryTransactionRunner } from './mongo-transaction-runner';

// Existing controllers
import { BooksController } from './books.controller';
import { LibraryPolicyController } from './library-policy.controller';
import { HoldsController } from './holds.controller';
import { LoansController } from './loans.controller';

// New services
import { BarcodeService } from './services/barcode.service';
import { PatronProfileService } from './services/patron-profile.service';
import { BorrowingPolicyService } from './services/borrowing-policy.service';
import { PhysicalCheckoutService } from './services/physical-checkout.service';
import { PhysicalReturnService } from './services/physical-return.service';
import { DigitalCheckoutService } from './services/digital-checkout.service';
import { DigitalReturnService } from './services/digital-return.service';
import { ClosureCalendarService } from './services/closure-calendar.service';
import { BorrowerLoansService } from './services/borrower-loans.service';
import { SavedListService } from './services/saved-list.service';
import { DonorService } from './services/donor.service';
import { LocationService } from './services/location.service';
import { StocktakeService } from './services/stocktake.service';

// New controllers
import { BarcodeController } from './controllers/barcode.controller';
import { PatronController } from './controllers/patron.controller';
import { PhysicalCirculationController } from './controllers/physical-circulation.controller';
import { DigitalCirculationController } from './controllers/digital-circulation.controller';
import { BorrowerController } from './controllers/borrower.controller';
import { SavedListController } from './controllers/saved-list.controller';
import { DonorController } from './controllers/donor.controller';
import { LocationController } from './controllers/location.controller';
import { StocktakeController } from './controllers/stocktake.controller';
import { ClosureCalendarController } from './controllers/closure-calendar.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Book.name, schema: BookSchema },
      { name: LibraryPolicy.name, schema: LibraryPolicySchema },
      { name: Hold.name, schema: HoldSchema },
      { name: Loan.name, schema: LoanSchema },
      { name: AutoRenewalRun.name, schema: AutoRenewalRunSchema },
      { name: BookCopy.name, schema: BookCopySchema },
      { name: PatronProfile.name, schema: PatronProfileSchema },
      { name: SavedList.name, schema: SavedListSchema },
      { name: Donor.name, schema: DonorSchema },
      { name: Donation.name, schema: DonationSchema },
      { name: LibraryLocation.name, schema: LibraryLocationSchema },
      { name: ClosureCalendar.name, schema: ClosureCalendarSchema },
      { name: StocktakeSession.name, schema: StocktakeSessionSchema },
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
    PatronController,
    PhysicalCirculationController,
    DigitalCirculationController,
    BorrowerController,
    SavedListController,
    DonorController,
    LocationController,
    StocktakeController,
    ClosureCalendarController,
  ],
  providers: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    AutoRenewalService,
    LibraryTransactionRunner,
    BarcodeService,
    PatronProfileService,
    BorrowingPolicyService,
    PhysicalCheckoutService,
    PhysicalReturnService,
    DigitalCheckoutService,
    DigitalReturnService,
    ClosureCalendarService,
    BorrowerLoansService,
    SavedListService,
    DonorService,
    LocationService,
    StocktakeService,
  ],
  exports: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    PatronProfileService,
    BorrowingPolicyService,
    BarcodeService,
  ],
})
export class ELibraryModule {}
