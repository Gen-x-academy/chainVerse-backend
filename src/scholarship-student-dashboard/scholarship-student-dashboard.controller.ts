import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ScholarshipStudentDashboardService } from './scholarship-student-dashboard.service';
import {
  ApplicationStatusQueryDto,
  DiscoverProgramsQueryDto,
  SaveDraftDto,
  SubmitDraftDto,
} from './dto/student-dashboard.dto';

/**
 * Student-facing scholarship dashboard.
 *
 * All handlers require the STUDENT role.  Every query is automatically scoped
 * to `req.user.sub` — the calling applicant's identity — so cross-applicant
 * data is structurally impossible to leak through this controller.
 *
 * Operational impact:
 *   - `GET /snapshot` is a live aggregation and should be cached at the edge
 *     for high-traffic deployments.
 *   - No write operation in this controller is destructive to the core
 *     `scholarship_applications` collection; drafts live in a separate
 *     `scholarship_application_drafts` collection.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarship — Student Dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('scholarships/student-dashboard')
export class ScholarshipStudentDashboardController {
  constructor(private readonly svc: ScholarshipStudentDashboardService) {}

  // ── Snapshot ──────────────────────────────────────────────────────────────

  @Get('snapshot')
  @ApiOperation({ summary: 'Student dashboard snapshot — counts and recent activity' })
  @ApiResponse({ status: 200, description: 'Snapshot computed from live data' })
  getSnapshot(@CurrentUser('sub') applicantId: string) {
    return this.svc.getSnapshot(applicantId);
  }

  // ── Discovery ─────────────────────────────────────────────────────────────

  @Get('programs')
  @ApiOperation({ summary: 'Discover published scholarship programs' })
  @ApiResponse({ status: 200, description: 'Paginated program cards' })
  discoverPrograms(
    @CurrentUser('sub') applicantId: string,
    @Query() query: DiscoverProgramsQueryDto,
  ) {
    return this.svc.discoverPrograms(applicantId, query);
  }

  // ── My Applications ───────────────────────────────────────────────────────

  @Get('applications')
  @ApiOperation({ summary: 'List the calling applicant's submissions with status' })
  @ApiResponse({ status: 200, description: 'Paginated application status cards' })
  listApplications(
    @CurrentUser('sub') applicantId: string,
    @Query() query: ApplicationStatusQueryDto,
  ) {
    return this.svc.listMyApplications(applicantId, query);
  }

  // ── Drafts ────────────────────────────────────────────────────────────────

  @Post('drafts')
  @ApiOperation({ summary: 'Save (create or update) a draft application' })
  @ApiResponse({ status: 201, description: 'Draft saved' })
  @ApiResponse({ status: 409, description: 'Application already submitted for this program' })
  saveDraft(
    @CurrentUser('sub') applicantId: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.svc.saveDraft(applicantId, dto);
  }

  @Get('drafts')
  @ApiOperation({ summary: 'List all active drafts for the calling applicant' })
  @ApiResponse({ status: 200, description: 'Active drafts array' })
  listDrafts(@CurrentUser('sub') applicantId: string) {
    return this.svc.listDrafts(applicantId);
  }

  @Get('drafts/:draftId')
  @ApiOperation({ summary: 'Get a specific draft' })
  @ApiResponse({ status: 404, description: 'Draft not found' })
  getDraft(
    @CurrentUser('sub') applicantId: string,
    @Param('draftId', new ParseObjectIdPipe()) draftId: string,
  ) {
    return this.svc.getDraft(applicantId, draftId);
  }

  @Patch('drafts/:draftId/submit')
  @ApiOperation({ summary: 'Mark draft as submitted (validates required fields first)' })
  @ApiResponse({ status: 200, description: 'Draft marked submitted' })
  @ApiResponse({ status: 422, description: 'Required fields missing or already submitted' })
  submitDraft(
    @CurrentUser('sub') applicantId: string,
    @Param('draftId', new ParseObjectIdPipe()) draftId: string,
    @Body() dto: SubmitDraftDto,
  ) {
    return this.svc.submitDraft(applicantId, draftId, dto);
  }

  @Delete('drafts/:draftId')
  @ApiOperation({ summary: 'Delete a non-submitted draft' })
  @ApiResponse({ status: 200, description: 'Draft deleted' })
  deleteDraft(
    @CurrentUser('sub') applicantId: string,
    @Param('draftId', new ParseObjectIdPipe()) draftId: string,
  ) {
    return this.svc.deleteDraft(applicantId, draftId);
  }
}
