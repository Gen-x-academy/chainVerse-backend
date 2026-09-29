import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ApplicationDraft,
  ApplicationDraftSchema,
} from './schemas/application-draft.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramSchema,
} from '../scholarships/schemas/scholarship-program.schema';
import {
  ScholarshipApplication,
  ScholarshipApplicationSchema,
} from '../scholarships/schemas/scholarship-application.schema';
import {
  ReviewInfoRequest,
  ReviewInfoRequestSchema,
} from '../scholarships/schemas/review-info-request.schema';
import { ScholarshipStudentDashboardService } from './scholarship-student-dashboard.service';
import { ScholarshipStudentDashboardController } from './scholarship-student-dashboard.controller';

/**
 * ScholarshipStudentDashboardModule
 *
 * Exposes the student-facing scholarship dashboard:
 *   - Program discovery (published programs with applicant-applied annotation)
 *   - Application status tracking (submissions, decisions, awards)
 *   - Draft management (save, submit, delete)
 *   - Dashboard snapshot (aggregated counts + recent activity)
 *
 * Ownership: student role only.
 * Privacy: all queries are scoped to the requesting applicant's JWT sub.
 * Migration: adds `scholarship_application_drafts` collection.
 *   No migration script is needed for existing data — the collection is new.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApplicationDraft.name, schema: ApplicationDraftSchema },
      // Read-only references — programs and applications are owned by ScholarshipsModule.
      { name: ScholarshipProgram.name, schema: ScholarshipProgramSchema },
      { name: ScholarshipApplication.name, schema: ScholarshipApplicationSchema },
      { name: ReviewInfoRequest.name, schema: ReviewInfoRequestSchema },
    ]),
  ],
  controllers: [ScholarshipStudentDashboardController],
  providers: [ScholarshipStudentDashboardService],
  exports: [ScholarshipStudentDashboardService],
})
export class ScholarshipStudentDashboardModule {}
