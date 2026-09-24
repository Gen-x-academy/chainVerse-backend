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
      { name: EligibilityAttestation.name, schema: EligibilityAttestationSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
    PaginationModule,
  ],
  controllers: [
    ScholarshipProgramsController,
    ScholarshipApplicationsController,
    EligibilityAttestationController,
    ApplicantAttestationController,
  ],
  providers: [
    ScholarshipProgramsService,
    ScholarshipApplicationsService,
    EligibilityAttestationService,
    OrganizationRolesGuard,
  ],
  exports: [
    ScholarshipProgramsService,
    ScholarshipApplicationsService,
    EligibilityAttestationService,
  ],
})
export class ScholarshipsModule {}
