import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiPaginatedResponse } from '../../../common/dto/paginated-response.dto';
import { ScholarshipMatchingService } from '../services/scholarship-matching.service';
import {
  DismissMatchDto,
  ScholarshipMatchQueryDto,
  SetInterestsDto,
  UpdateMatchingPreferencesDto,
} from '../dto/matching.dto';

/**
 * Student-facing personalized scholarship matching (#1176).
 *
 * Tenancy / ownership:
 *   - Every route is scoped to the authenticated student, taken from the
 *     verified JWT `sub`.  There is no `studentId` parameter anywhere on this
 *     controller, so one student can neither read nor mutate another's interest
 *     profile or dismissals.  Sponsors have no route into this controller at
 *     all; matching is only ever computed for the student who will act on it.
 *
 * Privacy (the reason this controller is thin):
 *   - The only student-side inputs are stated interests and the student's own
 *     verified eligibility attestations.  Protected characteristics are stripped
 *     on write (`filterInterests`) and refused by the ranker, so there is
 *     nothing sensitive here to accidentally leak — see
 *     `matching-fairness.ts` for the policy and the legal basis.
 *   - Nothing returned by `recommendations` reveals the student's identity,
 *     attestations, or dismissal history to a sponsor.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Personalized Matching')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('scholarships/matching')
export class ScholarshipMatchingController {
  constructor(private readonly matchingService: ScholarshipMatchingService) {}

  /**
   * Ranked, explained recommendations for the calling student.
   *
   * Response shape:
   *   `{ data, total, page, limit, totalPages, personalization }`
   *
   * `data[].reasons` explains *why* each program was recommended and
   * `personalization.coldStart` tells the client when the ordering is
   * non-personalized, so the UI can prompt the student to set interests rather
   * than presenting generic results as tailored ones.
   */
  @Get('recommendations')
  @ApiOperation({
    summary: 'Ranked scholarship recommendations with per-match reasons',
    description:
      'Ordering is deterministic (score, then award value, then id). ' +
      'Programs the student dismissed are excluded before scoring, and ' +
      'programs they already applied to are excluded unless ' +
      '`includeApplied=true`. `limit` may not exceed 50.',
  })
  @ApiPaginatedResponse('Ranked recommendations owned by the authenticated student')
  @ApiResponse({ status: 400, description: 'Invalid page, limit or sort' })
  recommendations(
    @CurrentUser('sub') studentId: string,
    @Query() query: ScholarshipMatchQueryDto,
  ) {
    return this.matchingService.recommendations(studentId, query);
  }

  /** The student's stated interests. 200 with `null` body when unset. */
  @Get('interests')
  @ApiOperation({ summary: 'Get my stated matching interests and privacy switches' })
  @ApiResponse({ status: 200, description: 'Profile, or null if never set (cold start)' })
  getInterests(@CurrentUser('sub') studentId: string) {
    return this.matchingService.getProfile(studentId);
  }

  /**
   * Replaces the student's stated interests.
   *
   * Returns the tags that were refused (`rejectedInterests`) so the student is
   * told a tag was ignored instead of silently believing it is being used for
   * ranking.
   */
  @Put('interests')
  @ApiOperation({
    summary: 'Replace my stated matching interests (protected traits are refused)',
  })
  @ApiResponse({ status: 200, description: 'Interests saved; refused tags reported back' })
  @ApiResponse({ status: 400, description: 'No supplied interest can be used for matching' })
  setInterests(
    @CurrentUser('sub') studentId: string,
    @Body() dto: SetInterestsDto,
  ) {
    return this.matchingService.setInterests(studentId, dto);
  }

  /**
   * Opt in / out of personalized ranking.
   *
   * Opting out stops `recommendations` from reading interests at all; the data
   * is retained so the student can switch back on without retyping.
   */
  @Patch('preferences')
  @ApiOperation({ summary: 'Turn personalized ranking on or off' })
  @ApiResponse({ status: 200, description: 'Preference applied' })
  @ApiResponse({ status: 404, description: 'No interest profile exists to update' })
  updatePreferences(
    @CurrentUser('sub') studentId: string,
    @Body() dto: UpdateMatchingPreferencesDto,
  ) {
    return this.matchingService.updatePreferences(studentId, dto);
  }

  /**
   * Stops recommending a program.
   *
   * Re-dismissing the same program updates the stored reason rather than
   * failing, so a student changing their mind is not blocked by their own
   * history.  `reason: sponsor_not_wanted` additionally hides the rest of that
   * sponsor's catalog.
   */
  @Post('dismissals')
  @ApiOperation({ summary: 'Dismiss a recommendation so it is never suggested again' })
  @ApiResponse({ status: 201, description: 'Dismissed (or reason updated on re-dismiss)' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  dismiss(
    @CurrentUser('sub') studentId: string,
    @Body() dto: DismissMatchDto,
  ) {
    return this.matchingService.dismiss(studentId, dto);
  }

  @Get('dismissals')
  @ApiOperation({ summary: 'List my dismissed programs, newest first' })
  @ApiResponse({ status: 200, description: 'Dismissal history for the authenticated student' })
  listDismissals(@CurrentUser('sub') studentId: string) {
    return this.matchingService.listDismissals(studentId);
  }
}
