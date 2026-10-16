import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LibraryItem, LibraryItemSchema } from './schemas/library-item.schema';
import { Loan, LoanSchema } from './schemas/loan.schema';
import { Hold, HoldSchema } from './schemas/hold.schema';
import { CirculationReceipt, CirculationReceiptSchema } from './schemas/circulation-receipt.schema';
import { DueDateOverride, DueDateOverrideSchema } from './schemas/due-date-override.schema';
import { PatronLookupAudit, PatronLookupAuditSchema } from './schemas/patron-lookup-audit.schema';
import { LibraryCirculationController } from './library-circulation.controller';
import { LibraryCirculationService } from './library-circulation.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LibraryItem.name, schema: LibraryItemSchema },
      { name: Loan.name, schema: LoanSchema },
      { name: Hold.name, schema: HoldSchema },
      { name: CirculationReceipt.name, schema: CirculationReceiptSchema },
      { name: DueDateOverride.name, schema: DueDateOverrideSchema },
      { name: PatronLookupAudit.name, schema: PatronLookupAuditSchema },
    ]),
    IdempotencyModule,
  ],
  controllers: [LibraryCirculationController],
  providers: [LibraryCirculationService],
  exports: [LibraryCirculationService],
})
export class LibraryCirculationModule {}
