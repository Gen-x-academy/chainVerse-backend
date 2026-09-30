import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OutboxRelayJob } from './jobs/outbox-relay.job';
import { OutboxEvent, OutboxEventSchema } from './schemas/outbox-event.schema';
import { OutboxService } from './services/outbox.service';
import { ScholarshipTransactionRunner } from './services/scholarship-transaction.runner';

/**
 * Cross-module machinery for the four scholarship transitions that span more
 * than one collection: award approval, reservation consumption, milestone
 * approval and disbursement intent creation (#1255).
 *
 * This is a *shared kernel*, not a fifth bounded context. It owns no scholarship
 * aggregate and imports none of the four contexts, which is what keeps it legal
 * under ADR 0001: adding it cannot introduce a cycle, and it cannot become a
 * back-edge into `scholarship-finance`. `scholarship-context-acyclicity.spec.ts`
 * knows about it by name so the rule is enforced rather than merely intended.
 *
 * Relies on the global `EventEmitterModule` and on `ScheduleModule.forRoot()`,
 * registered by `AppModule`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OutboxEvent.name, schema: OutboxEventSchema },
    ]),
  ],
  providers: [ScholarshipTransactionRunner, OutboxService, OutboxRelayJob],
  exports: [ScholarshipTransactionRunner, OutboxService],
})
export class ScholarshipOutboxModule {}
