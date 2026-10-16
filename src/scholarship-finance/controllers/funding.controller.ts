import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Idempotent } from '../../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { FinancePermission, FundingRoundStatus } from '../domain/finance.enums';
import { PaginationQueryDto } from '../dto/common.dto';
import {
  CreateFundingRoundDto,
  ListDepositsQueryDto,
  ReallocateFundsDto,
  ReasonDto,
  RecordDepositDto,
} from '../dto/funding.dto';
import {
  FinanceActor,
  FinanceActorContext,
} from '../guards/finance-access.guard';
import { FundingService } from '../services/funding.service';
import {
  FinanceAccess,
  FinanceController,
} from './finance-controller.decorators';

@ApiTags('Scholarship Finance — Sponsor Funding')
@FinanceController()
@Controller('organizations/:organizationId/scholarship-finance')
export class FundingController {
  constructor(private readonly funding: FundingService) {}

  // ── Funding rounds ────────────────────────────────────────────────────────

  @Post('funding-rounds')
  @FinanceAccess(FinancePermission.OPERATE)
  @ApiOperation({
    summary: 'Open a funding round for a program or the unrestricted pool',
  })
  createRound(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateFundingRoundDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.funding.createRound(organizationId, dto, actor.userId);
  }

  @Get('funding-rounds')
  @FinanceAccess(FinancePermission.VIEW)
  @ApiQuery({ name: 'status', enum: FundingRoundStatus, required: false })
  listRounds(
    @Param('organizationId') organizationId: string,
    @Query('status') status?: FundingRoundStatus,
  ) {
    return this.funding.listRounds(organizationId, status);
  }

  @Get('funding-rounds/:id')
  @FinanceAccess(FinancePermission.VIEW)
  getRound(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.funding.getRound(organizationId, id);
  }

  @Post('funding-rounds/:id/close')
  @FinanceAccess(FinancePermission.APPROVE)
  closeRound(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.funding.closeRound(
      organizationId,
      id,
      dto.reason,
      actor.userId,
    );
  }

  // ── Deposits ──────────────────────────────────────────────────────────────

  @Post('deposits')
  @FinanceAccess(FinancePermission.OPERATE)
  @ApiOperation({
    summary: 'Record a sponsor deposit (pending)',
    description:
      'The (rail, reference, asset) triple is unique platform-wide; a repeat returns 409.',
  })
  recordDeposit(
    @Param('organizationId') organizationId: string,
    @Body() dto: RecordDepositDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.funding.recordDeposit(organizationId, dto, actor.userId);
  }

  @Get('deposits')
  @FinanceAccess(FinancePermission.VIEW)
  listDeposits(
    @Param('organizationId') organizationId: string,
    @Query() query: ListDepositsQueryDto,
  ) {
    return this.funding.listDeposits(organizationId, query);
  }

  @Get('deposits/:id')
  @FinanceAccess(FinancePermission.VIEW)
  getDeposit(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.funding.getDeposit(organizationId, id);
  }

  @Post('deposits/:id/credit')
  @FinanceAccess(FinancePermission.APPROVE)
  @ApiOperation({
    summary:
      'Credit a pending deposit to its fund, applying the versioned fee schedule',
  })
  creditDeposit(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.funding.creditDeposit(organizationId, id, actor.userId);
  }

  @Post('deposits/:id/reject')
  @FinanceAccess(FinancePermission.APPROVE)
  rejectDeposit(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.funding.rejectDeposit(
      organizationId,
      id,
      dto.reason,
      actor.userId,
    );
  }

  // ── Allocation changes ────────────────────────────────────────────────────

  @Post('allocation-changes')
  @FinanceAccess(FinancePermission.APPROVE)
  @Idempotent()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'X-Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Move available funds between programs / the pool' })
  reallocate(
    @Param('organizationId') organizationId: string,
    @Body() dto: ReallocateFundsDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.funding.reallocate(organizationId, dto, actor.userId);
  }

  @Get('allocation-changes')
  @FinanceAccess(FinancePermission.VIEW)
  listAllocationChanges(
    @Param('organizationId') organizationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.funding.listAllocationChanges(
      organizationId,
      query.limit,
      query.skip,
    );
  }
}
