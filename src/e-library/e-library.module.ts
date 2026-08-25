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
  AuditLog,
  AuditLogSchema,
} from './schemas/audit-log.schema';
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
import { ELibraryAuditService } from './services/elibrary-audit.service';
import { ELibraryAuditController } from './controllers/elibrary-audit.controller';
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
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
    PaginationModule,
    NotificationModule,
  ],
  controllers: [
    BooksController,
    LibraryPolicyController,
    HoldsController,
    LoansController,
    ELibraryAuditController,
  ],
  providers: [
    BooksService,
    LibraryPolicyService,
    HoldsService,
    LoansService,
    AutoRenewalService,
    LibraryTransactionRunner,
    ELibraryAuditService,
    LibraryOwnerGuard,
    LibraryRateLimitGuard,
  ],
  exports: [BooksService, LibraryPolicyService, HoldsService, LoansService],
})
export class ELibraryModule {}
