import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinancePermission } from '../domain/finance.enums';
import { ReasonDto } from '../dto/funding.dto';
import {
  CreateRecoveryClaimDto,
  ListRecoveriesQueryDto,
  RecordCollectionDto,
} from '../dto/recovery.dto';
import {
  FinanceActor,
  FinanceActorContext,
} from '../guards/finance-access.guard';
import { RecoveryService } from '../services/recovery.service';
import {
  FinanceAccess,
  FinanceController,
} from './finance-controller.decorators';

@ApiTags('Scholarship Finance — Recoveries')
@FinanceController()
@Controller('organizations/:organizationId/scholarship-finance/recoveries')
export class RecoveriesController {
  constructor(private readonly recoveries: RecoveryService) {}

  @Post()
  @FinanceAccess(FinancePermission.OPERATE)
  @ApiOperation({
    summary: 'Draft a recovery claim with reason and legal basis',
  })
  create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateRecoveryClaimDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.recoveries.create(organizationId, dto, actor.userId);
  }

  @Get()
  @FinanceAccess(FinancePermission.VIEW)
  list(
    @Param('organizationId') organizationId: string,
    @Query() query: ListRecoveriesQueryDto,
  ) {
    return this.recoveries.list(organizationId, query);
  }

  @Get('reconciliation')
  @FinanceAccess(FinancePermission.VIEW)
  @ApiOperation({
    summary: 'Reconcile collections and open claims against the ledger',
  })
  reconcile(@Param('organizationId') organizationId: string) {
    return this.recoveries.reconcile(organizationId);
  }

  @Get(':id')
  @FinanceAccess(FinancePermission.VIEW)
  get(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.recoveries.get(organizationId, id);
  }

  @Get(':id/collections')
  @FinanceAccess(FinancePermission.VIEW)
  listCollections(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.recoveries.listCollections(organizationId, id);
  }

  @Post(':id/approve')
  @FinanceAccess(FinancePermission.APPROVE)
  @ApiOperation({
    summary:
      'Approve (four-eyes), open the claim and issue the recipient notice',
  })
  approve(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.recoveries.approve(organizationId, id, actor.userId);
  }

  @Post(':id/collections')
  @FinanceAccess(FinancePermission.OPERATE)
  @ApiOperation({
    summary: 'Record money received against a claim',
    description:
      'Records funds already received. The platform never initiates a wallet debit.',
  })
  recordCollection(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: RecordCollectionDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.recoveries.recordCollection(
      organizationId,
      id,
      dto,
      actor.userId,
    );
  }

  @Post(':id/write-off')
  @FinanceAccess(FinancePermission.APPROVE)
  writeOff(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.recoveries.writeOff(
      organizationId,
      id,
      dto.reason,
      actor.userId,
    );
  }

  @Post(':id/cancel')
  @FinanceAccess(FinancePermission.OPERATE)
  @ApiOperation({
    summary:
      'Cancel a draft (operator) or an uncollected open claim (approver)',
  })
  cancel(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.recoveries.cancel(organizationId, id, dto.reason, actor);
  }
}
