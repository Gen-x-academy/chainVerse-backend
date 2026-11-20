import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ConfigureFundingModelDto } from './dto/configure-funding-model.dto';
import { CreateBudgetPlanDto } from './dto/create-budget-plan.dto';
import { ReserveBudgetDto } from './dto/reserve-budget.dto';
import { CreateEscrowIntentDto } from './dto/create-escrow-intent.dto';
import { ProjectFundingRole } from './entities';
import {
  FundingHttpRequest,
  readProjectFundingActor,
} from './project-funding-actor.decorator';
import { ProjectFundingRoles } from './project-funding-roles.decorator';
import { ProjectFundingRolesGuard } from './project-funding-roles.guard';
import { ProjectFundingService } from './project-funding.service';
import {
  ConfigureFundingModelResponse,
  CreateBudgetPlanResponse,
  CreateEscrowIntentResponse,
  ReserveBudgetResponse,
} from './responses';

@ApiTags('Project Funding Lifecycle')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: 'x-tenant-id',
  required: true,
  description: 'Authenticated tenant boundary',
})
@ApiExtraModels(
  ConfigureFundingModelResponse,
  CreateBudgetPlanResponse,
  ReserveBudgetResponse,
  CreateEscrowIntentResponse,
)
@Controller('project-funding')
@UseGuards(ProjectFundingRolesGuard)
export class ProjectFundingController {
  constructor(private readonly service: ProjectFundingService) {}

  @Post('funding-models')
  @HttpCode(HttpStatus.CREATED)
  @ProjectFundingRoles(
    ProjectFundingRole.SPONSOR,
    ProjectFundingRole.FINANCE,
    ProjectFundingRole.PROGRAM_MANAGER,
    ProjectFundingRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Configure a project funding model (CAPSTONE-081)',
    description:
      'Creates or revises a tenant-scoped funding model and its funding pool.',
  })
  @ApiCreatedResponse({ type: ConfigureFundingModelResponse })
  @ApiBadRequestResponse({
    description: 'DTO validation or funding-model domain rule failed',
  })
  @ApiForbiddenResponse({
    description: 'Actor role or tenant boundary denied the request',
  })
  @ApiConflictResponse({
    description: 'Stale revision or reused idempotency key',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Funding configuration violates a domain rule',
  })
  configureFundingModel(
    @Body() dto: ConfigureFundingModelDto,
    @Req() request: FundingHttpRequest,
  ) {
    return this.service.configureFundingModel(
      dto,
      readProjectFundingActor(request),
    );
  }

  @Post('budget-plans')
  @HttpCode(HttpStatus.CREATED)
  @ProjectFundingRoles(
    ProjectFundingRole.SPONSOR,
    ProjectFundingRole.FINANCE,
    ProjectFundingRole.PROGRAM_MANAGER,
    ProjectFundingRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Create a versioned project budget plan (CAPSTONE-082)',
    description:
      'Requires a configured funding model and an approver when the total exceeds the threshold.',
  })
  @ApiCreatedResponse({ type: CreateBudgetPlanResponse })
  @ApiBadRequestResponse({ description: 'Budget line validation failed' })
  @ApiForbiddenResponse({
    description: 'Actor role or tenant boundary denied the request',
  })
  @ApiNotFoundResponse({ description: 'Funding model not found' })
  @ApiConflictResponse({
    description: 'Stale revision or reused idempotency key',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Approval or committed-funding rule failed',
  })
  createBudgetPlan(
    @Body() dto: CreateBudgetPlanDto,
    @Req() request: FundingHttpRequest,
  ) {
    return this.service.createBudgetPlan(dto, readProjectFundingActor(request));
  }

  @Post('budget-reservations')
  @HttpCode(HttpStatus.CREATED)
  @ProjectFundingRoles(
    ProjectFundingRole.SPONSOR,
    ProjectFundingRole.FINANCE,
    ProjectFundingRole.PROGRAM_MANAGER,
    ProjectFundingRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Reserve an approved project budget (CAPSTONE-083)',
    description:
      'Atomically reserves funds within the pool cap, approved total and expiry window.',
  })
  @ApiCreatedResponse({ type: ReserveBudgetResponse })
  @ApiBadRequestResponse({ description: 'Reservation DTO validation failed' })
  @ApiForbiddenResponse({
    description: 'Actor role or tenant boundary denied the request',
  })
  @ApiNotFoundResponse({
    description: 'Approved plan or funding pool not found',
  })
  @ApiConflictResponse({
    description: 'Stale revision or reused idempotency key',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Cap, expiry or budget limit exceeded',
  })
  reserveBudget(
    @Body() dto: ReserveBudgetDto,
    @Req() request: FundingHttpRequest,
  ) {
    return this.service.reserveBudget(dto, readProjectFundingActor(request));
  }

  @Post('escrow-intents')
  @HttpCode(HttpStatus.CREATED)
  @ProjectFundingRoles(
    ProjectFundingRole.SPONSOR,
    ProjectFundingRole.FINANCE,
    ProjectFundingRole.PROGRAM_MANAGER,
    ProjectFundingRole.ADMIN,
  )
  @ApiOperation({
    summary: 'Create a replay-safe escrow funding intent (CAPSTONE-084)',
    description:
      'Ties an intent to an accepted charter, configured payer, asset, expiry and release conditions.',
  })
  @ApiCreatedResponse({ type: CreateEscrowIntentResponse })
  @ApiBadRequestResponse({ description: 'Intent DTO validation failed' })
  @ApiForbiddenResponse({
    description: 'Actor role or tenant boundary denied the request',
  })
  @ApiNotFoundResponse({ description: 'Approved charter budget not found' })
  @ApiConflictResponse({
    description: 'Stale revision or reused idempotency key',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Amount exceeds unreserved budget or domain rule failed',
  })
  createEscrowIntent(
    @Body() dto: CreateEscrowIntentDto,
    @Req() request: FundingHttpRequest,
  ) {
    return this.service.createEscrowIntent(
      dto,
      readProjectFundingActor(request),
    );
  }
}
