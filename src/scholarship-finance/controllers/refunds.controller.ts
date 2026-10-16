import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinancePermission } from '../domain/finance.enums';
import { ReasonDto } from '../dto/funding.dto';
import {
  CompleteRefundDto,
  ListRefundsQueryDto,
  RequestRefundDto,
} from '../dto/refund.dto';
import {
  FinanceActor,
  FinanceActorContext,
} from '../guards/finance-access.guard';
import { RefundService } from '../services/refund.service';
import {
  FinanceAccess,
  FinanceController,
} from './finance-controller.decorators';

@ApiTags('Scholarship Finance — Refunds')
@FinanceController()
@Controller('organizations/:organizationId/scholarship-finance/refunds')
export class RefundsController {
  constructor(private readonly refunds: RefundService) {}

  @Post()
  @FinanceAccess(FinancePermission.OPERATE)
  @ApiOperation({
    summary:
      'Request a refund / record a returned payment (no ledger effect yet)',
  })
  request(
    @Param('organizationId') organizationId: string,
    @Body() dto: RequestRefundDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.refunds.request(organizationId, dto, actor.userId);
  }

  @Get()
  @FinanceAccess(FinancePermission.VIEW)
  list(
    @Param('organizationId') organizationId: string,
    @Query() query: ListRefundsQueryDto,
  ) {
    return this.refunds.list(organizationId, query);
  }

  @Get(':id')
  @FinanceAccess(FinancePermission.VIEW)
  get(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.refunds.get(organizationId, id);
  }

  @Post(':id/approve')
  @FinanceAccess(FinancePermission.APPROVE)
  @ApiOperation({
    summary: 'Approve a refund (four-eyes)',
    description:
      'Reserves funds, or fully reverses the deposit for rejected transfers. Fails if the fund is insufficient.',
  })
  approve(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.refunds.approve(organizationId, id, actor.userId);
  }

  @Post(':id/complete')
  @FinanceAccess(FinancePermission.APPROVE)
  @ApiOperation({
    summary: 'Confirm the payout / rail return and settle the refund',
  })
  complete(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: CompleteRefundDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.refunds.complete(organizationId, id, dto, actor.userId);
  }

  @Post(':id/reject')
  @FinanceAccess(FinancePermission.APPROVE)
  @ApiOperation({
    summary:
      'Reject a refund; unwinds an approved reservation via a reversal journal',
  })
  reject(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.refunds.reject(organizationId, id, dto.reason, actor.userId);
  }

  @Post(':id/cancel')
  @FinanceAccess(FinancePermission.OPERATE)
  cancel(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.refunds.cancel(organizationId, id, dto.reason, actor.userId);
  }
}
