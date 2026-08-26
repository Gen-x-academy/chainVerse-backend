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

// New schemas (NteinPrecious: #1009 patron profiles, #1012 saved lists)
import { PatronProfile, PatronProfileSchema } from './schemas/patron-profile.schema';
import { SavedList, SavedListSchema } from './schemas/saved-list.schema';

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

// New services (NteinPrecious)
import { PatronProfileService } from './services/patron-profile.service';
import { BorrowingPolicyService } from './services/borrowing-policy.service';
import { SavedListService } from './services/saved-list.service';

// New controllers (NteinPrecious)
import { PatronController } from './controllers/patron.controller';
import { SavedListController } from './controllers/saved-list.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Book.name, schema: BookSchema },
      { name: LibraryPolicy.name, schema: LibraryPolicySchema },
      { name: Hold.name, schema: HoldSchema },
      { name: Loan.name, schema: LoanSchema },
      { name: AutoRenewalRun.name, schema: AutoRenewalRunSchema },
      { name: PatronProfile.name, schema: PatronProfileSchema },
      { name: SavedList.name, schema: SavedListSchema },
    ]),
    PaginationModule,
    NotificationModule,
  ],
  controllers: [
    BooksController,
    LibraryPolicyController,
    HoldsController,
    LoansController,
    PatronController,
    SavedListController,
  ],
  providers: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    AutoRenewalService,
    LibraryTransactionRunner,
    PatronProfileService,
    BorrowingPolicyService,
    SavedListService,
  ],
  exports: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    PatronProfileService,
    BorrowingPolicyService,
  ],
})
export class ELibraryModule {}
