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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as Joi from 'joi';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/platform-admin.guard';
import type { AuthenticatedRequest } from '../common/authenticated-user';
import { JoiValidationPipe } from '../common/joi-validation.pipe';
import { TenantAccessService } from '../common/tenant-access.service';
import { ScholarshipProgramService } from '../programs/scholarship-program.service';
import {
  CancelPayoutDto,
  cancelPayoutSchema,
  CreatePayoutDto,
  createPayoutSchema,
  ListPayoutsQuery,
  listPayoutsSchema,
  MarkAttemptSubmittedDto,
  markAttemptSubmittedSchema,
  ReportAttemptResultDto,
  reportAttemptResultSchema,
  RetryPayoutDto,
  retryPayoutSchema,
} from './dto/payout.dto';
import { PayoutsService } from './payouts.service';

@ApiTags('Scholarship Finance — Payouts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller(
  'organizations/:organizationId/scholarship-programs/:programId/payouts',
)
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly programs: ScholarshipProgramService,
    private readonly tenant: TenantAccessService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create the payout intent for an award installment',
    description:
      'Idempotent per (award, installment). Requires sufficient awarded, unpaid balance on the award.',
  })
  async create(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Body(new JoiValidationPipe(createPayoutSchema)) dto: CreatePayoutDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanWrite(req.user, organizationId);
    return this.payouts.create(
      await this.programs.get(organizationId, programId),
      dto,
      req.user.id,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List payouts (filter by status to find failures needing action)',
  })
  async list(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Query(new JoiValidationPipe(listPayoutsSchema)) q: ListPayoutsQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    return this.payouts.list(
      await this.programs.get(organizationId, programId),
      q,
    );
  }

  @Get(':payoutId')
  @ApiOperation({
    summary: 'Get a payout with its attempts and failure diagnostics',
  })
  async get(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Param('payoutId') payoutId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    return this.payouts.get(
      await this.programs.get(organizationId, programId),
      payoutId,
    );
  }

  @Post(':payoutId/retries')
  @ApiOperation({
    summary:
      'Retry a failed payout with a new transaction envelope (same intent)',
    description:
      'A corrected destination is required after a bad_destination failure.',
  })
  async retry(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Param('payoutId') payoutId: string,
    @Body(new JoiValidationPipe(retryPayoutSchema)) dto: RetryPayoutDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanWrite(req.user, organizationId);
    return this.payouts.retry(
      await this.programs.get(organizationId, programId),
      payoutId,
      dto,
      req.user.id,
    );
  }

  @Post(':payoutId/cancellation')
  @ApiOperation({
    summary:
      'Cancel an unsubmitted or failed payout; the award remains payable',
  })
  async cancel(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Param('payoutId') payoutId: string,
    @Body(new JoiValidationPipe(cancelPayoutSchema)) dto: CancelPayoutDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanWrite(req.user, organizationId);
    return this.payouts.cancel(
      await this.programs.get(organizationId, programId),
      payoutId,
      dto.reason,
    );
  }
}

const signerQueueSchema = Joi.object<{ limit?: number }>({
  limit: Joi.number().integer().min(1).max(200).default(50),
});

/**
 * Integration surface for the custody signer service. The signer holds the
 * treasury keys; this backend never does. Restricted to platform admins
 * (the signer authenticates with an admin-role service token).
 */
@ApiTags('Scholarship Finance — Payout Signer')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('scholarship-finance/payout-signer')
export class PayoutSignerController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('attempts')
  @ApiOperation({ summary: 'Attempts ready to be built, signed and submitted' })
  ready(
    @Query(new JoiValidationPipe(signerQueueSchema)) q: { limit?: number },
  ) {
    return this.payouts.readyForSigning(q.limit);
  }

  @Post('payouts/:payoutId/attempts/:attemptId/submission')
  @ApiOperation({
    summary: 'Record that an attempt’s envelope was submitted to the network',
  })
  submitted(
    @Param('payoutId') payoutId: string,
    @Param('attemptId') attemptId: string,
    @Body(new JoiValidationPipe(markAttemptSubmittedSchema))
    dto: MarkAttemptSubmittedDto,
  ) {
    return this.payouts.markSubmitted(payoutId, attemptId, dto);
  }

  @Post('payouts/:payoutId/attempts/:attemptId/result')
  @ApiOperation({
    summary: 'Report an attempt’s outcome',
    description:
      'Success is verified independently on Horizon before the disbursement is posted and the receipt issued. ' +
      'Failures are classified (missing_trustline, bad_destination, insufficient_funds, network_expiry, transient, unknown).',
  })
  result(
    @Param('payoutId') payoutId: string,
    @Param('attemptId') attemptId: string,
    @Body(new JoiValidationPipe(reportAttemptResultSchema))
    dto: ReportAttemptResultDto,
  ) {
    return this.payouts.reportResult(payoutId, attemptId, dto);
  }
}
