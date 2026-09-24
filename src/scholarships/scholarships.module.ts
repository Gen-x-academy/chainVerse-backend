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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScholarshipProgram.name, schema: ScholarshipProgramSchema },
      { name: ProgramTermsVersion.name, schema: ProgramTermsVersionSchema },
      { name: ScholarshipApplication.name, schema: ScholarshipApplicationSchema },
      { name: WithdrawalPolicy.name, schema: WithdrawalPolicySchema },
      { name: EligibilityRule.name, schema: EligibilityRuleSchema },
      // Registered so OrganizationRolesGuard can resolve tenant memberships.
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
    PaginationModule,
  ],
  controllers: [
    ScholarshipProgramsController,
    ScholarshipApplicationsController,
    WithdrawalEligibilityController,
  ],
  providers: [
    ScholarshipProgramsService,
    ScholarshipApplicationsService,
    WithdrawalPolicyService,
    EligibilityRuleService,
    OrganizationRolesGuard,
  ],
  exports: [
    ScholarshipProgramsService,
    ScholarshipApplicationsService,
    WithdrawalPolicyService,
    EligibilityRuleService,
  ],
})
export class ScholarshipsModule {}
