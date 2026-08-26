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

// New schemas (BigBen-7: #1017 due-date calendar, #1019/#1020 borrower loans)
import { BookCopy, BookCopySchema } from './schemas/book-copy.schema';
import { DigitalLoan, DigitalLoanSchema } from './schemas/digital-loan.schema';
import { ClosureCalendar, ClosureCalendarSchema } from './schemas/closure-calendar.schema';

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

// New services (BigBen-7)
import { ClosureCalendarService } from './services/closure-calendar.service';
import { BorrowerLoansService } from './services/borrower-loans.service';

// New controllers (BigBen-7)
import { ClosureCalendarController } from './controllers/closure-calendar.controller';
import { BorrowerController } from './controllers/borrower.controller';

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
      { name: ClosureCalendar.name, schema: ClosureCalendarSchema },
    ]),
    PaginationModule,
    NotificationModule,
  ],
  controllers: [
    BooksController,
    LibraryPolicyController,
    HoldsController,
    LoansController,
    ClosureCalendarController,
    BorrowerController,
  ],
  providers: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    AutoRenewalService,
    LibraryTransactionRunner,
    ClosureCalendarService,
    BorrowerLoansService,
  ],
  exports: [BooksService, LibraryPolicyService, HoldsService, LoansService],
})
export class ELibraryModule {}
