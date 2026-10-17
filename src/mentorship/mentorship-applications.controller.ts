import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuditActor, AuditContext } from '../common/audit';
import { RequestActor } from '../common/auth/resource-owner';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  InformationResponseDto,
  ReapplyMentorshipApplicationDto,
  SubmitMentorshipApplicationDto,
} from './dto/mentorship-application.dto';
import {
  RecordDecisionDto,
  WithdrawApplicationDto,
} from './dto/mentorship-decision.dto';
import { CreateMentorshipProgramDto } from './dto/mentorship-program.dto';
import { ApplicationStatus } from './enums/mentorship.enums';
import { IdempotencyKey } from './idempotency-key.decorator';
import { MentorshipApplicationsService } from './mentorship-applications.service';

const IDEMPOTENCY_HEADER_DOC = {
  name: 'X-Idempotency-Key',
  required: true,
  description:
    'Client-generated key (8-128 chars). Retrying with the same key and body returns the original result; the same key with a different body returns 409 BIZ_MENTORSHIP_IDEMPOTENCY_KEY_REUSED.',
};

const ALL_ROLES = [Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR];
const REVIEWER_ROLES = [Role.TUTOR, Role.ADMIN, Role.MODERATOR];

/**
 * Mentorship programs and applications (MENTOR-035, MENTOR-036).
 *
 * Authorization is deny-by-default: the class-level `@Roles(Role.ADMIN)`
 * applies to any handler that does not declare its own roles, and every
 * handler's service call re-checks ownership (applicant) or program
 * mentorship (reviewer) against the JWT subject.
 */
@ApiBearerAuth('access-token')
@ApiTags('Mentorship Applications')
@ApiForbiddenResponse({ description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
@Controller('mentorship')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class MentorshipApplicationsController {
  constructor(private readonly service: MentorshipApplicationsService) {}

  // ── Programs ───────────────────────────────────────────────────────────────

  @Post('programs')
  @Roles(Role.TUTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Create a mentorship program (mentor or admin)' })
  @ApiCreatedResponse({ description: 'Program created' })
  @ApiBadRequestResponse({ description: 'VAL_* validation errors' })
  createProgram(
    @Body() dto: CreateMentorshipProgramDto,
    @CurrentUser() user: Record<string, unknown>,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.createProgram(dto, toActor(user), audit);
  }

  @Get('programs/:programId')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Get a mentorship program and its policies' })
  @ApiNotFoundResponse({ description: 'RES_MENTORSHIP_PROGRAM_NOT_FOUND' })
  getProgram(@Param('programId', new ParseObjectIdPipe()) programId: string) {
    return this.service.getProgram(programId);
  }

  @Get('programs/:programId/applications')
  @Roles(...REVIEWER_ROLES)
  @ApiOperation({
    summary: 'List applications for a program (program mentor or staff)',
  })
  @ApiQuery({ name: 'status', enum: ApplicationStatus, required: false })
  listProgramApplications(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @CurrentUser() user: Record<string, unknown>,
    @Query('status', new ParseEnumPipe(ApplicationStatus, { optional: true }))
    status?: ApplicationStatus,
  ) {
    return this.service.listProgramApplications(
      programId,
      toActor(user),
      status,
    );
  }

  @Post('programs/:programId/applications')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Apply to a mentorship program' })
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ApiCreatedResponse({ description: 'Application submitted (or replayed)' })
  @ApiUnprocessableEntityResponse({
    description:
      'BIZ_MENTORSHIP_PROGRAM_CLOSED, BIZ_MENTORSHIP_CONSENT_VERSION_MISMATCH, BIZ_MENTORSHIP_ACTIVE_APPLICATION_EXISTS, BIZ_MENTORSHIP_REAPPLICATION_NOT_PERMITTED',
  })
  submit(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Body() dto: SubmitMentorshipApplicationDto,
    @CurrentUser() user: Record<string, unknown>,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.service.submitApplication(
      programId,
      dto,
      toActor(user),
      idempotencyKey,
    );
  }

  // ── Applications ───────────────────────────────────────────────────────────

  @Get('applications/mine')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "List the caller's own applications" })
  listMine(@CurrentUser() user: Record<string, unknown>) {
    return this.service.listMyApplications(toActor(user));
  }

  @Get('applications/:applicationId')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'Get an application',
    description:
      'Applicants receive the applicant view (no internal reasons, decisions only once effective). Program mentors and staff receive the full view.',
  })
  @ApiNotFoundResponse({ description: 'RES_MENTORSHIP_APPLICATION_NOT_FOUND' })
  getApplication(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @CurrentUser() user: Record<string, unknown>,
  ) {
    return this.service.getApplication(applicationId, toActor(user));
  }

  @Get('applications/:applicationId/decisions')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Get the immutable decision history' })
  listDecisions(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @CurrentUser() user: Record<string, unknown>,
  ) {
    return this.service.listDecisions(applicationId, toActor(user));
  }

  @Post('applications/:applicationId/decisions')
  @Roles(...REVIEWER_ROLES)
  @ApiOperation({
    summary: 'Record a structured decision (MENTOR-035)',
    description:
      'accept | reject | waitlist | request_information | withdraw (staff only, on the applicant’s behalf). Accept reserves a seat atomically.',
  })
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ApiCreatedResponse({ description: 'Decision recorded (or replayed)' })
  @ApiConflictResponse({
    description:
      'BIZ_MENTORSHIP_STALE_VERSION, BIZ_MENTORSHIP_IDEMPOTENCY_KEY_REUSED',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'BIZ_MENTORSHIP_INVALID_TRANSITION, BIZ_MENTORSHIP_APPLICATION_WITHDRAWN, BIZ_MENTORSHIP_APPLICATION_CLOSED, BIZ_MENTORSHIP_CAPACITY_REACHED, BIZ_MENTORSHIP_EFFECTIVE_TIME_IN_PAST',
  })
  recordDecision(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Body() dto: RecordDecisionDto,
    @CurrentUser() user: Record<string, unknown>,
    @IdempotencyKey() idempotencyKey: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.recordDecision(
      applicationId,
      dto,
      toActor(user),
      idempotencyKey,
      audit,
    );
  }

  @Post('applications/:applicationId/information-response')
  @Roles(Role.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Answer a request for information; returns the application to review',
  })
  @ApiUnprocessableEntityResponse({
    description: 'BIZ_MENTORSHIP_INVALID_TRANSITION',
  })
  respond(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Body() dto: InformationResponseDto,
    @CurrentUser() user: Record<string, unknown>,
  ) {
    return this.service.respondToInformationRequest(
      applicationId,
      dto,
      toActor(user),
    );
  }

  @Get('applications/:applicationId/withdrawal-preview')
  @Roles(Role.STUDENT)
  @ApiOperation({
    summary: 'Preview the consequences of withdrawing (MENTOR-036)',
    description:
      'Returns the consequences and a confirmationToken bound to the current application state.',
  })
  @ApiOkResponse({ description: 'Consequences and confirmation token' })
  withdrawalPreview(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @CurrentUser() user: Record<string, unknown>,
  ) {
    return this.service.getWithdrawalPreview(applicationId, toActor(user));
  }

  @Post('applications/:applicationId/withdraw')
  @Roles(Role.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw an application (MENTOR-036)',
    description:
      'Requires acknowledgeConsequences=true and the token from the preview. Releases any held seat, keeps the record, and blocks further review actions.',
  })
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ApiConflictResponse({
    description:
      'BIZ_MENTORSHIP_WITHDRAWAL_CONFIRMATION_STALE, BIZ_MENTORSHIP_IDEMPOTENCY_KEY_REUSED, BIZ_MENTORSHIP_STALE_VERSION',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'BIZ_MENTORSHIP_WITHDRAWAL_CUTOFF_PASSED, BIZ_MENTORSHIP_APPLICATION_WITHDRAWN, BIZ_MENTORSHIP_APPLICATION_CLOSED',
  })
  withdraw(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Body() dto: WithdrawApplicationDto,
    @CurrentUser() user: Record<string, unknown>,
    @IdempotencyKey() idempotencyKey: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.withdraw(
      applicationId,
      dto,
      toActor(user),
      idempotencyKey,
      audit,
    );
  }

  @Post('applications/:applicationId/reapply')
  @Roles(Role.STUDENT)
  @ApiOperation({
    summary: 'Reapply after a closed application (MENTOR-036)',
    description:
      'Creates a new application linked to the previous one. Answers may be carried over; consent is never copied and must be given again for the current version.',
  })
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ApiCreatedResponse({ description: 'Reapplication created (or replayed)' })
  @ApiConflictResponse({
    description:
      'BIZ_MENTORSHIP_ALREADY_REAPPLIED, BIZ_MENTORSHIP_IDEMPOTENCY_KEY_REUSED',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'BIZ_MENTORSHIP_REAPPLICATION_NOT_PERMITTED, BIZ_MENTORSHIP_REAPPLICATION_COOLDOWN, BIZ_MENTORSHIP_REAPPLICATION_LIMIT_REACHED, BIZ_MENTORSHIP_ACTIVE_APPLICATION_EXISTS, BIZ_MENTORSHIP_CONSENT_VERSION_MISMATCH, BIZ_MENTORSHIP_PROGRAM_CLOSED',
  })
  reapply(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Body() dto: ReapplyMentorshipApplicationDto,
    @CurrentUser() user: Record<string, unknown>,
    @IdempotencyKey() idempotencyKey: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.reapply(
      applicationId,
      dto,
      toActor(user),
      idempotencyKey,
      audit,
    );
  }
}

function toActor(user: Record<string, unknown> | undefined): RequestActor {
  return {
    id: String(user?.['sub'] ?? user?.['id'] ?? ''),
    role: String(user?.['role'] ?? ''),
  };
}
