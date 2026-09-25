import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import * as Joi from 'joi';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-user';
import { JoiValidationPipe } from '../common/joi-validation.pipe';
import { DECIMAL_AMOUNT_PATTERN } from '../common/money';
import { TenantAccessService } from '../common/tenant-access.service';
import { ScholarshipProgramService } from '../programs/scholarship-program.service';
import { ReconciliationAlertsService } from './reconciliation-alerts.service';
import type { AlertStatus } from './reconciliation.schemas';
import { presentRun, ReconciliationService } from './reconciliation.service';

class RunReconciliationDto {
  @ApiPropertyOptional({
    description:
      'Manual treasury balance snapshot. Required for manual-source programs; overrides Horizon otherwise.',
    example: '12500.5',
  })
  externalBalance?: string;
  @ApiPropertyOptional() externalObservedAt?: Date;
}

class ListAlertsQuery {
  @ApiPropertyOptional() programId?: string;
  @ApiPropertyOptional({ enum: ['open', 'acknowledged', 'resolved'] })
  status?: AlertStatus;
}

class ResolveAlertDto {
  @ApiProperty({
    description:
      'What was found and which corrective entries (if any) were posted',
  })
  note!: string;
}

const runReconciliationSchema = Joi.object<RunReconciliationDto>({
  externalBalance: Joi.string().pattern(DECIMAL_AMOUNT_PATTERN),
  externalObservedAt: Joi.date().iso().max('now'),
});
const listRunsSchema = Joi.object<{ limit?: number }>({
  limit: Joi.number().integer().min(1).max(200).default(50),
});
const listAlertsSchema = Joi.object<ListAlertsQuery>({
  programId: Joi.string().hex().length(24),
  status: Joi.string().valid('open', 'acknowledged', 'resolved'),
});
const resolveAlertSchema = Joi.object<ResolveAlertDto>({
  note: Joi.string().trim().min(10).max(2000).required(),
});

@ApiTags('Scholarship Finance — Reconciliation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller(
  'organizations/:organizationId/scholarship-programs/:programId/reconciliations',
)
export class ReconciliationController {
  constructor(
    private readonly reconciliation: ReconciliationService,
    private readonly programs: ScholarshipProgramService,
    private readonly tenant: TenantAccessService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Reconcile the ledger against the treasury balance and obligations',
    description:
      'Creates an immutable run. Discrepancies raise alerts; the ledger is never edited.',
  })
  async run(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Body(new JoiValidationPipe(runReconciliationSchema))
    dto: RunReconciliationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanWrite(req.user, organizationId);
    const program = await this.programs.get(organizationId, programId);
    return presentRun(
      await this.reconciliation.run(program, {
        trigger: 'manual',
        triggeredBy: req.user.id,
        externalBalance: dto.externalBalance,
        externalObservedAt: dto.externalObservedAt,
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List reconciliation runs (newest first)' })
  async list(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Query(new JoiValidationPipe(listRunsSchema)) q: { limit?: number },
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    const program = await this.programs.get(organizationId, programId);
    return (await this.reconciliation.list(program, q.limit)).map(presentRun);
  }

  @Get(':runId')
  @ApiOperation({
    summary: 'Get a reconciliation run with its inputs and results',
  })
  async get(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Param('runId') runId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    const program = await this.programs.get(organizationId, programId);
    return presentRun(await this.reconciliation.get(program, runId));
  }

  @Post(':runId/replay')
  @ApiOperation({
    summary:
      'Recompute a run from its recorded inputs and confirm the outcome is identical',
  })
  async replay(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Param('runId') runId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    const program = await this.programs.get(organizationId, programId);
    return this.reconciliation.replay(program, runId);
  }
}

@ApiTags('Scholarship Finance — Reconciliation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/scholarship-alerts')
export class ReconciliationAlertsController {
  constructor(
    private readonly alerts: ReconciliationAlertsService,
    private readonly tenant: TenantAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List reconciliation alerts' })
  async list(
    @Param('organizationId') organizationId: string,
    @Query(new JoiValidationPipe(listAlertsSchema)) q: ListAlertsQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    return this.alerts.list(organizationId, q);
  }

  @Post(':alertId/acknowledgement')
  @ApiOperation({
    summary:
      'Acknowledge an alert (it keeps blocking new awards until resolved)',
  })
  async acknowledge(
    @Param('organizationId') organizationId: string,
    @Param('alertId') alertId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanWrite(req.user, organizationId);
    return this.alerts.acknowledge(organizationId, alertId, req.user.id);
  }

  @Post(':alertId/resolution')
  @ApiOperation({
    summary: 'Resolve an alert with a note',
    description:
      'Does not modify the ledger. Post corrective adjustments/reversals separately before resolving.',
  })
  async resolve(
    @Param('organizationId') organizationId: string,
    @Param('alertId') alertId: string,
    @Body(new JoiValidationPipe(resolveAlertSchema)) dto: ResolveAlertDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanWrite(req.user, organizationId);
    return this.alerts.resolve(organizationId, alertId, req.user.id, dto.note);
  }
}
