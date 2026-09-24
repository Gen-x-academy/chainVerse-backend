import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaginationModule } from '../common/pagination/pagination.module';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from '../organization-member/schemas/organization-member.schema';
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
import { ScholarshipProgramsService } from './services/scholarship-programs.service';
import { ScholarshipApplicationsService } from './services/scholarship-applications.service';
import { WithdrawalPolicyService } from './services/withdrawal-policy.service';
import { EligibilityRuleService } from './services/eligibility-rule.service';
import { ScholarshipProgramsController } from './controllers/scholarship-programs.controller';
import { ScholarshipApplicationsController } from './controllers/scholarship-applications.controller';
import { WithdrawalEligibilityController } from './controllers/withdrawal-eligibility.controller';
  ProgramPrerequisite,
  ProgramPrerequisiteSchema,
} from './schemas/program-prerequisite.schema';
import {
  ProgramExclusion,
  ProgramExclusionSchema,
} from './schemas/program-exclusion.schema';
import { ScholarshipProgramsService } from './services/scholarship-programs.service';
import { ScholarshipApplicationsService } from './services/scholarship-applications.service';
import { PrerequisiteExclusionService } from './services/prerequisite-exclusion.service';
import { ScholarshipProgramsController } from './controllers/scholarship-programs.controller';
import { ScholarshipApplicationsController } from './controllers/scholarship-applications.controller';
import { PrerequisiteExclusionController } from './controllers/prerequisite-exclusion.controller';
  EligibilityAttestation,
  EligibilityAttestationSchema,
} from './schemas/eligibility-attestation.schema';
import { ScholarshipProgramsService } from './services/scholarship-programs.service';
import { ScholarshipApplicationsService } from './services/scholarship-applications.service';
import { EligibilityAttestationService } from './services/eligibility-attestation.service';
import { ScholarshipProgramsController } from './controllers/scholarship-programs.controller';
import { ScholarshipApplicationsController } from './controllers/scholarship-applications.controller';
import {
  EligibilityAttestationController,
  ApplicantAttestationController,
} from './controllers/eligibility-attestation.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScholarshipProgram.name, schema: ScholarshipProgramSchema },
      { name: ProgramTermsVersion.name, schema: ProgramTermsVersionSchema },
      { name: ScholarshipApplication.name, schema: ScholarshipApplicationSchema },
      { name: WithdrawalPolicy.name, schema: WithdrawalPolicySchema },
      { name: EligibilityRule.name, schema: EligibilityRuleSchema },
      // Registered so OrganizationRolesGuard can resolve tenant memberships.
      { name: ProgramPrerequisite.name, schema: ProgramPrerequisiteSchema },
      { name: ProgramExclusion.name, schema: ProgramExclusionSchema },
      { name: EligibilityAttestation.name, schema: EligibilityAttestationSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
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
  ],
  providers: [
    ScholarshipProgramsService,
    ScholarshipApplicationsService,
    WithdrawalPolicyService,
    EligibilityRuleService,
    PrerequisiteExclusionService,
    EligibilityAttestationService,
    OrganizationRolesGuard,
  ],
  exports: [
    ScholarshipProgramsService,
    ScholarshipApplicationsService,
    WithdrawalPolicyService,
    EligibilityRuleService,
  ],
    PrerequisiteExclusionService,
  ],
    EligibilityAttestationService,
  ],
import {
  ApplicationForm,
  ApplicationFormSchema,
} from './schemas/application-form.schema';
import { ApplicationFormService } from './services/application-form.service';
import { ApplicationFormController } from './controllers/application-form.controller';

/**
 * ScholarshipsModule bundles all scholarship-related features.
 *
 * Currently provides:
 *  - Configurable application forms (issue #1131)
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApplicationForm.name, schema: ApplicationFormSchema },
    ]),
  ],
  controllers: [ApplicationFormController],
  providers: [ApplicationFormService],
  exports: [ApplicationFormService],
})
export class ScholarshipsModule {}
