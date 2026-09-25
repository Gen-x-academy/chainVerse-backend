import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from '../organization-member/schemas/organization-member.schema';
import { DisbursementIntentController } from './controllers/disbursement-intent.controller';
import { MilestoneEvidenceController } from './controllers/milestone-evidence.controller';
import { MilestoneScheduleController } from './controllers/milestone-schedule.controller';
import { MilestoneVerificationController } from './controllers/milestone-verification.controller';
import { ScholarshipAwardController } from './controllers/scholarship-award.controller';
import { DisbursementReconciliationJob } from './jobs/disbursement-reconciliation.job';
import {
  DisbursementIntent,
  DisbursementIntentSchema,
} from './schemas/disbursement-intent.schema';
import {
  MilestoneEvidence,
  MilestoneEvidenceSchema,
} from './schemas/milestone-evidence.schema';
import {
  MilestoneProgress,
  MilestoneProgressSchema,
} from './schemas/milestone-progress.schema';
import {
  MilestoneSchedule,
  MilestoneScheduleSchema,
} from './schemas/milestone-schedule.schema';
import {
  PaymentEligibility,
  PaymentEligibilitySchema,
} from './schemas/payment-eligibility.schema';
import {
  ScholarshipAward,
  ScholarshipAwardSchema,
} from './schemas/scholarship-award.schema';
import {
  VerificationDecision,
  VerificationDecisionSchema,
} from './schemas/verification-decision.schema';
import {
  VerifierAssignment,
  VerifierAssignmentSchema,
} from './schemas/verifier-assignment.schema';
import { DisbursementIntentService } from './services/disbursement-intent.service';
import { EvidenceEncryptionService } from './services/evidence-encryption.service';
import { MilestoneEvidenceService } from './services/milestone-evidence.service';
import { MilestoneScheduleService } from './services/milestone-schedule.service';
import { MilestoneVerificationService } from './services/milestone-verification.service';
import { ScholarshipAccessService } from './services/scholarship-access.service';
import { ScholarshipAwardService } from './services/scholarship-award.service';

/**
 * Scholarship awards, milestone-based disbursement schedules, evidence,
 * verification and disbursement intents. See docs/scholarships/.
 *
 * Relies on `ScheduleModule.forRoot()` (registered by StellarModule) for the
 * reconciliation cron and on the global EventEmitter and AuditModule.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScholarshipAward.name, schema: ScholarshipAwardSchema },
      { name: MilestoneSchedule.name, schema: MilestoneScheduleSchema },
      { name: MilestoneProgress.name, schema: MilestoneProgressSchema },
      { name: MilestoneEvidence.name, schema: MilestoneEvidenceSchema },
      { name: VerifierAssignment.name, schema: VerifierAssignmentSchema },
      { name: VerificationDecision.name, schema: VerificationDecisionSchema },
      { name: PaymentEligibility.name, schema: PaymentEligibilitySchema },
      { name: DisbursementIntent.name, schema: DisbursementIntentSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
  ],
  controllers: [
    ScholarshipAwardController,
    MilestoneScheduleController,
    MilestoneEvidenceController,
    MilestoneVerificationController,
    DisbursementIntentController,
  ],
  providers: [
    OrganizationRolesGuard,
    ScholarshipAccessService,
    EvidenceEncryptionService,
    ScholarshipAwardService,
    MilestoneScheduleService,
    MilestoneEvidenceService,
    MilestoneVerificationService,
    DisbursementIntentService,
    DisbursementReconciliationJob,
  ],
  exports: [DisbursementIntentService],
})
export class ScholarshipModule {}
