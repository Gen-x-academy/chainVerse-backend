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
  }
}
