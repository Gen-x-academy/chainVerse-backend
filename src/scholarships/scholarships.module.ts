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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScholarshipProgram.name, schema: ScholarshipProgramSchema },
      { name: ProgramTermsVersion.name, schema: ProgramTermsVersionSchema },
      { name: ScholarshipApplication.name, schema: ScholarshipApplicationSchema },
      { name: ProgramPrerequisite.name, schema: ProgramPrerequisiteSchema },
      { name: ProgramExclusion.name, schema: ProgramExclusionSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
    PaginationModule,
  ],
  controllers: [
    ScholarshipProgramsController,
    ScholarshipApplicationsController,
    PrerequisiteExclusionController,
  ],
  providers: [
    ScholarshipProgramsService,
    ScholarshipApplicationsService,
    PrerequisiteExclusionService,
    OrganizationRolesGuard,
  ],
  exports: [
    ScholarshipProgramsService,
    ScholarshipApplicationsService,
    PrerequisiteExclusionService,
  ],
})
export class ScholarshipsModule {}
