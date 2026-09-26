import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaginationModule } from '../common/pagination/pagination.module';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from '../organization-member/schemas/organization-member.schema';

// ── Schemas ───────────────────────────────────────────────────────────────────
import {
  ScholarshipProgram,
  ScholarshipProgramSchema,
} from './schemas/scholarship-program.schema';
import {
  ProgramTermsVersion,
  ProgramTermsVersionSchema,
} from './schemas/program-terms-version.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationSchema,
} from './schemas/scholarship-application.schema';
import {
  WithdrawalPolicy,
  WithdrawalPolicySchema,
} from './schemas/withdrawal-policy.schema';
import {
  EligibilityRule,
  EligibilityRuleSchema,
} from './schemas/eligibility-rule.schema';
import {
  ProgramPrerequisite,
  ProgramPrerequisiteSchema,
} from './schemas/program-prerequisite.schema';
import {
  ProgramExclusion,
  ProgramExclusionSchema,
} from './schemas/program-exclusion.schema';
import {
  EligibilityAttestation,
  EligibilityAttestationSchema,
} from './schemas/eligibility-attestation.schema';
import {
  ApplicationForm,
  ApplicationFormSchema,
} from './schemas/application-form.schema';
// Award records (#1151)
import {
  ScholarshipAward,
  ScholarshipAwardSchema,
} from './schemas/scholarship-award.schema';
// Award agreement acceptance (#1152)
import {
  AwardAgreement,
  AwardAgreementSchema,
} from './schemas/award-agreement.schema';
// Applicant appeals (#1150)
import {
  ApplicationAppeal,
  ApplicationAppealSchema,
} from './schemas/application-appeal.schema';
import {
  ScholarshipReview,
  ScholarshipReviewSchema,
} from './schemas/scholarship-review.schema';
import {
  CommitteeDecision,
  CommitteeDecisionSchema,
} from './schemas/committee-decision.schema';
import {
  ReviewInfoRequest,
  ReviewInfoRequestSchema,
} from './schemas/review-info-request.schema';
import {
  BudgetLedger,
  BudgetLedgerSchema,
  BudgetReservation,
  BudgetReservationSchema,
} from './schemas/budget-reservation.schema';

// ── Services ──────────────────────────────────────────────────────────────────
import { ScholarshipProgramsService } from './services/scholarship-programs.service';
import { ScholarshipApplicationsService } from './services/scholarship-applications.service';
import { WithdrawalPolicyService } from './services/withdrawal-policy.service';
import { EligibilityRuleService } from './services/eligibility-rule.service';
import { PrerequisiteExclusionService } from './services/prerequisite-exclusion.service';
import { EligibilityAttestationService } from './services/eligibility-attestation.service';
import { ApplicationFormService } from './services/application-form.service';
// Award records (#1151)
import { ScholarshipAwardService } from './services/scholarship-award.service';
// Award agreement acceptance (#1152)
import { AwardAgreementService } from './services/award-agreement.service';
// Applicant appeals (#1150)
import { ApplicationAppealService } from './services/application-appeal.service';
import { ScholarshipReviewService } from './services/scholarship-review.service';
import { CommitteeDecisionService } from './services/committee-decision.service';
import { ReviewInfoRequestService } from './services/review-info-request.service';
import { BudgetReservationService } from './services/budget-reservation.service';

// ── Controllers ───────────────────────────────────────────────────────────────
import { ScholarshipProgramsController } from './controllers/scholarship-programs.controller';
import { ScholarshipApplicationsController } from './controllers/scholarship-applications.controller';
import { WithdrawalEligibilityController } from './controllers/withdrawal-eligibility.controller';
import { PrerequisiteExclusionController } from './controllers/prerequisite-exclusion.controller';
import {
  EligibilityAttestationController,
  ApplicantAttestationController,
} from './controllers/eligibility-attestation.controller';
import { ApplicationFormController } from './controllers/application-form.controller';
// Award records (#1151)
import {
  ScholarshipAwardController,
  ScholarshipAwardMutationController,
  ApplicantAwardController,
} from './controllers/scholarship-award.controller';
// Award agreement acceptance (#1152)
import {
  ApplicantAwardAgreementController,
  StaffAwardAgreementController,
} from './controllers/award-agreement.controller';
// Applicant appeals (#1150)
import {
  ApplicantAppealController,
  StaffAppealController,
} from './controllers/application-appeal.controller';
import { ScholarshipReviewController } from './controllers/scholarship-review.controller';
import { CommitteeDecisionController } from './controllers/committee-decision.controller';
import { ReviewInfoRequestController } from './controllers/review-info-request.controller';
import { BudgetReservationController } from './controllers/budget-reservation.controller';

/**
 * ScholarshipsModule bundles all scholarship-related features:
 *
 *  - Scholarship programs + versioned terms (#1122, #1126)
 *  - Student applications + answer validation (#1127, #1132)
 *  - Withdrawal policies (#1137)
 *  - Composable eligibility rules (#1127)
 *  - Prerequisite & exclusion rules (#1128)
 *  - Eligibility attestations (#1129)
 *  - Configurable application forms (#1131)
 *  - Scholarship award records + lifecycle (#1151)
 *  - Award agreement acceptance + declarations (#1152)
 *  - Applicant appeals against eligible decisions (#1150)
 *  - Award cancellation and termination (#1153)
 *  - Normalized aggregate review scores (#1147)
 *  - Committee decision workflow (#1148)
 *  - Reviewer info requests (#1146)
 *  - Budget reservations (#1149)
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScholarshipProgram.name, schema: ScholarshipProgramSchema },
      { name: ProgramTermsVersion.name, schema: ProgramTermsVersionSchema },
      { name: ScholarshipApplication.name, schema: ScholarshipApplicationSchema },
      { name: WithdrawalPolicy.name, schema: WithdrawalPolicySchema },
      { name: EligibilityRule.name, schema: EligibilityRuleSchema },
      { name: ProgramPrerequisite.name, schema: ProgramPrerequisiteSchema },
      { name: ProgramExclusion.name, schema: ProgramExclusionSchema },
      { name: EligibilityAttestation.name, schema: EligibilityAttestationSchema },
      { name: ApplicationForm.name, schema: ApplicationFormSchema },
      // Registered so OrganizationRolesGuard can resolve tenant memberships.
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      // Award records (#1151)
      { name: ScholarshipAward.name, schema: ScholarshipAwardSchema },
      // Award agreement acceptance (#1152)
      { name: AwardAgreement.name, schema: AwardAgreementSchema },
      // Applicant appeals (#1150)
      { name: ApplicationAppeal.name, schema: ApplicationAppealSchema },
      // Review scoring (#1147)
      { name: ScholarshipReview.name, schema: ScholarshipReviewSchema },
      // Committee decisions (#1148)
      { name: CommitteeDecision.name, schema: CommitteeDecisionSchema },
      // Reviewer info requests (#1146)
      { name: ReviewInfoRequest.name, schema: ReviewInfoRequestSchema },
      // Budget reservations (#1149)
      { name: BudgetLedger.name, schema: BudgetLedgerSchema },
      { name: BudgetReservation.name, schema: BudgetReservationSchema },
    ]),
    PaginationModule,
  ],
  controllers: [
    ScholarshipProgramsController,
    ScholarshipApplicationsController,
    WithdrawalEligibilityController,
    PrerequisiteExclusionController,
    EligibilityAttestationController,
    ApplicantAttestationController,
    ApplicationFormController,
    // Award records (#1151)
    ScholarshipAwardController,
    ScholarshipAwardMutationController,
    ApplicantAwardController,
    // Award agreement acceptance (#1152)
    ApplicantAwardAgreementController,
    StaffAwardAgreementController,
    // Applicant appeals (#1150)
    ApplicantAppealController,
    StaffAppealController,
    ScholarshipReviewController,
    CommitteeDecisionController,
    ReviewInfoRequestController,
    BudgetReservationController,
  ],
  providers: [
    ScholarshipProgramsService,
    ScholarshipApplicationsService,
    WithdrawalPolicyService,
    EligibilityRuleService,
    PrerequisiteExclusionService,
    EligibilityAttestationService,
    ApplicationFormService,
    // Award records (#1151)
    ScholarshipAwardService,
    // Award agreement acceptance (#1152)
    AwardAgreementService,
    // Applicant appeals (#1150)
    ApplicationAppealService,
    ScholarshipReviewService,
    CommitteeDecisionService,
    ReviewInfoRequestService,
    BudgetReservationService,
    OrganizationRolesGuard,
  ],
  exports: [
    ScholarshipProgramsService,
    ScholarshipApplicationsService,
    WithdrawalPolicyService,
    EligibilityRuleService,
    PrerequisiteExclusionService,
    EligibilityAttestationService,
    ApplicationFormService,
    // Award records (#1151)
    ScholarshipAwardService,
    // Award agreement acceptance (#1152)
    AwardAgreementService,
    // Applicant appeals (#1150)
    ApplicationAppealService,
    ScholarshipReviewService,
    CommitteeDecisionService,
    ReviewInfoRequestService,
    BudgetReservationService,
  ],
})
export class ScholarshipsModule {}
