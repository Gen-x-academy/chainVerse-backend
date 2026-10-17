import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipProgramsController } from './mentorship-programs.controller';
import { MentorshipProgramsService } from './mentorship-programs.service';
import {
  Cohort, CohortAudit, CohortAuditSchema, CohortEnrollment, CohortEnrollmentSchema,
  CohortOffer, CohortOfferSchema, CohortSchema, CohortWaitlistEntry,
  CohortWaitlistEntrySchema, EligibilityRuleVersion, EligibilityRuleVersionSchema,
} from './schemas/program.schema';
import { IdempotencyModule } from '../../idempotency/idempotency.module';

@Module({
  imports: [
    IdempotencyModule,
    MongooseModule.forFeature([
      { name: Cohort.name, schema: CohortSchema },
      { name: CohortEnrollment.name, schema: CohortEnrollmentSchema },
      { name: CohortWaitlistEntry.name, schema: CohortWaitlistEntrySchema },
      { name: CohortOffer.name, schema: CohortOfferSchema },
      { name: EligibilityRuleVersion.name, schema: EligibilityRuleVersionSchema },
      { name: CohortAudit.name, schema: CohortAuditSchema },
    ]),
  ],
  controllers: [MentorshipProgramsController],
  providers: [MentorshipProgramsService],
  exports: [MentorshipProgramsService],
})
export class MentorshipProgramsModule {}
