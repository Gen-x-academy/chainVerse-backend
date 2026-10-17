import {
  Body, Controller, Get, Param, Post, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Idempotent } from '../../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import {
  CreateCohortDto, CreateEligibilityVersionDto, EligibilityEvaluationDto,
  EnrollInCohortDto, TransferCoordinatorDto,
} from './dto/program.dto';
import { MentorshipProgramsService } from './mentorship-programs.service';

@ApiTags('Mentorship Programs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship')
export class MentorshipProgramsController {
  constructor(private readonly service: MentorshipProgramsService) {}

  @Post('programs/:programId/cohorts')
  @Idempotent()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a mentorship cohort' })
  createCohort(@Param('programId') programId: string, @CurrentUser('sub') actorId: string, @Body() dto: CreateCohortDto) {
    return this.service.createCohort(programId, actorId, dto);
  }

  @Post('cohorts/:cohortId/enrollment')
  @Idempotent()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Enroll a participant or place them on the deterministic waitlist' })
  enroll(@Param('cohortId') cohortId: string, @CurrentUser('sub') actorId: string, @Body() dto: EnrollInCohortDto) {
    return this.service.enroll(cohortId, dto.participantId, actorId);
  }

  @Post('cohorts/:cohortId/close')
  @Idempotent()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Close a cohort so new enrollment is rejected' })
  close(@Param('cohortId') cohortId: string, @CurrentUser('sub') actorId: string) {
    return this.service.closeCohort(cohortId, actorId);
  }

  @Post('cohorts/:cohortId/coordinators')
  @Idempotent()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Transfer or add a cohort coordinator with an audit record' })
  transfer(@Param('cohortId') cohortId: string, @CurrentUser('sub') actorId: string, @Body() dto: TransferCoordinatorDto) {
    return this.service.transferCoordinator(cohortId, actorId, dto.coordinatorId, dto.reason);
  }

  @Get('cohorts/:cohortId/report')
  @ApiOperation({ summary: 'Get a cohort-filtered capacity and waitlist report' })
  report(@Param('cohortId') cohortId: string, @CurrentUser('sub') actorId: string) {
    return this.service.report(cohortId, actorId);
  }

  @Post('cohort-offers/:offerId/confirm')
  @Idempotent()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Confirm an unexpired waitlist promotion offer' })
  confirmOffer(@Param('offerId') offerId: string, @CurrentUser('sub') actorId: string) {
    return this.service.confirmOffer(offerId, actorId);
  }

  @Post('programs/:programId/eligibility/versions')
  @Idempotent()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Publish a new version of program eligibility rules' })
  createEligibility(@Param('programId') programId: string, @CurrentUser('sub') actorId: string, @Body() dto: CreateEligibilityVersionDto) {
    return this.service.createEligibilityVersion(programId, actorId, dto);
  }

  @Post('programs/:programId/eligibility/evaluate')
  @ApiOperation({ summary: 'Evaluate explainable eligibility without returning unauthorized attributes' })
  evaluate(@Param('programId') programId: string, @Body() dto: EligibilityEvaluationDto) {
    return this.service.evaluate(programId, dto);
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';
import { Idempotent } from '../../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { JoiValidationPipe } from '../shared/joi-validation.pipe';
import { MentorshipAuthGuard } from '../shared/mentorship-auth.guard';
import { MentorshipCtx, MentorshipRequestContext } from '../shared/mentorship-context';
import { ANY_ROLE, MentorshipPolicy, STAFF_ROLES } from '../shared/mentorship-policy.decorator';
import { MentorshipProgramsService } from './mentorship-programs.service';
import {
  CreateProgramDto,
  createProgramSchema,
  UpdateProgramDto,
  updateProgramSchema,
  UpsertReviewerDto,
  upsertReviewerSchema,
} from './dto/program.dto';

@ApiTags('Mentorship – Programs')
@ApiBearerAuth('access-token')
@UseGuards(MentorshipAuthGuard)
@UseInterceptors(IdempotencyInterceptor)
@Controller('mentorship/programs')
export class MentorshipProgramsController {
  constructor(private readonly service: MentorshipProgramsService) {}

  @Post()
  @Idempotent()
  @MentorshipPolicy('program.create', [Role.ADMIN, Role.TUTOR])
  @ApiOperation({ summary: 'Create a mentorship program (caller becomes owner)' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: true })
  @ApiBody({ type: CreateProgramDto })
  @ApiResponse({ status: 201, description: 'Program created in draft status' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT | MENTOR_UNSAFE_MARKUP | VAL_IDEMPOTENCY_KEY_MISSING' })
  create(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Body(new JoiValidationPipe(createProgramSchema)) dto: CreateProgramDto,
  ) {
    return this.service.create(ctx, dto);
  }

  @Get(':programId')
  @MentorshipPolicy('program.read', ANY_ROLE)
  @ApiOperation({ summary: 'Get a program (open programs are visible to any signed-in user)' })
  @ApiResponse({ status: 404, description: 'MENTOR_PROGRAM_NOT_FOUND' })
  get(@MentorshipCtx() ctx: MentorshipRequestContext, @Param('programId') programId: string) {
    return this.service.get(ctx, programId);
  }

  @Patch(':programId')
  @MentorshipPolicy('program.update', STAFF_ROLES)
  @ApiOperation({ summary: 'Update program settings (owner or admin)' })
  @ApiBody({ type: UpdateProgramDto })
  @ApiResponse({ status: 403, description: 'MENTOR_ACCESS_DENIED' })
  update(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Body(new JoiValidationPipe(updateProgramSchema)) dto: UpdateProgramDto,
  ) {
    return this.service.update(ctx, programId, dto);
  }

  @Get(':programId/reviewers')
  @MentorshipPolicy('program.reviewers.list', STAFF_ROLES)
  @ApiOperation({ summary: 'List scoped reviewers (owner, admin or lead reviewer)' })
  listReviewers(@MentorshipCtx() ctx: MentorshipRequestContext, @Param('programId') programId: string) {
    return this.service.listReviewers(ctx, programId);
  }

  @Put(':programId/reviewers/:reviewerId')
  @MentorshipPolicy('program.reviewers.upsert', STAFF_ROLES)
  @ApiOperation({ summary: 'Scope a user as reviewer/lead, set capacity, or deactivate (idempotent)' })
  @ApiBody({ type: UpsertReviewerDto })
  upsertReviewer(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Param('reviewerId') reviewerId: string,
    @Body(new JoiValidationPipe(upsertReviewerSchema)) dto: UpsertReviewerDto,
  ) {
    return this.service.upsertReviewer(ctx, programId, reviewerId, dto);
  }
}
