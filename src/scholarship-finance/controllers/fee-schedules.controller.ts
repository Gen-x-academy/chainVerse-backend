import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FinancePermission } from '../domain/finance.enums';
import { CreateFeeScheduleDto, FeePreviewDto } from '../dto/fee-schedule.dto';
import {
  FinanceActor,
  FinanceActorContext,
} from '../guards/finance-access.guard';
import { FeeService } from '../services/fee.service';
import {
  FinanceAccess,
  FinanceController,
} from './finance-controller.decorators';

@ApiTags('Scholarship Finance — Fees')
@FinanceController()
@Controller('organizations/:organizationId/scholarship-finance/fee-schedules')
export class FeeSchedulesController {
  constructor(private readonly fees: FeeService) {}

  @Post()
  @FinanceAccess(FinancePermission.APPROVE)
  @ApiOperation({
    summary: 'Publish a new immutable fee schedule version for an asset',
  })
  publish(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateFeeScheduleDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    return this.fees.publish(organizationId, dto, actor.userId);
  }

  @Get()
  @FinanceAccess(FinancePermission.VIEW)
  @ApiOperation({ summary: 'List fee schedule versions' })
  @ApiQuery({ name: 'assetKey', required: false, example: 'USDC:GA5Z...' })
  list(
    @Param('organizationId') organizationId: string,
    @Query('assetKey') key?: string,
  ) {
    return this.fees.list(organizationId, key);
  }

  @Post('preview')
  @FinanceAccess(FinancePermission.VIEW)
  @ApiOperation({
    summary: 'Preview gross / fees / net for a deposit or disbursement amount',
  })
  preview(
    @Param('organizationId') organizationId: string,
    @Body() dto: FeePreviewDto,
  ) {
    return this.fees.preview(organizationId, dto);
  }
}
