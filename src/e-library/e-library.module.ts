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

// New schemas (monique-7arch: #993 donor/provenance, #995 locations, #996 stocktake, #994 barcode)
import { BookCopy, BookCopySchema } from './schemas/book-copy.schema';
import { Donor, DonorSchema } from './schemas/donor.schema';
import { Donation, DonationSchema } from './schemas/donation.schema';
import { LibraryLocation, LibraryLocationSchema } from './schemas/library-location.schema';
import { StocktakeSession, StocktakeSessionSchema } from './schemas/stocktake-session.schema';

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

// New services (monique-7arch)
import { DonorService } from './services/donor.service';
import { LocationService } from './services/location.service';
import { StocktakeService } from './services/stocktake.service';
import { BarcodeService } from './services/barcode.service';

// New controllers (monique-7arch)
import { DonorController } from './controllers/donor.controller';
import { LocationController } from './controllers/location.controller';
import { StocktakeController } from './controllers/stocktake.controller';
import { BarcodeController } from './controllers/barcode.controller';

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
  ],
  providers: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    AutoRenewalService,
    LibraryTransactionRunner,
    DonorService,
    LocationService,
    StocktakeService,
    BarcodeService,
  ],
  exports: [BooksService, LibraryPolicyService, HoldsService, LoansService, BarcodeService],
})
export class ELibraryModule {}
