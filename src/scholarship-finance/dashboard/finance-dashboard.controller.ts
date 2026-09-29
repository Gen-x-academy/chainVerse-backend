import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import {
  FinanceAccessGuard,
  FinanceActor,
  FinanceActorContext,
  RequireFinancePermission,
} from '../guards/finance-access.guard';
import { FinancePermission } from '../domain/finance.enums';
import {
  FinanceDashboardQueryDto,
  FinanceDashboardAction,
} from './dto/dashboard.dto';
import {
  DashboardViewError,
  FinanceDashboardService,
} from './finance-dashboard.service';
import { ValidationDomainException } from '../../../common/errors/domain.exception';
import { ErrorCode } from '../../../common/errors/error-codes.enum';

/**
 * Finance operations dashboard (#1174).
 *
 * One endpoint that answers "where is the money, and what needs a decision?"
 * across funding, liabilities, due payments, failures, reconciliation, refunds
 * and recoveries — previously six separate listings an operator had to join by
 * hand.
 *
 * ## Authorization
 *
 * Read access requires `FinancePermission.VIEW` within `:organizationId`.
 * Mutations require `APPROVE` **and** an explicit `X-Confirm` header, because a
 * refund approval or a recovery write-off is the kind of action that must not
 * be triggered by a stray click, a prefetched link or a crawler.
 *
 * ## Staleness
 *
 * Every section reports `asOf` and `stale`. The dashboard never presents a
 * number without saying how fresh it is.
 */
@ApiTags('Scholarship Finance — Operations Dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, FinanceAccessGuard)
@Controller('organizations/:organizationId/scholarship-finance')
export class FinanceDashboardController {
  constructor(private readonly dashboard: FinanceDashboardService) {}

  @Get('dashboard')
  @RequireFinancePermission(FinancePermission.VIEW)
  @ApiOperation({
    summary:
      'Operations dashboard: funding, liabilities, due payments, failures, ' +
      'reconciliation, refunds and recoveries in one response',
    description:
      'Every section reports `asOf` and `stale`. A section that could not be ' +
      'read reports `error` and `stale: true` rather than failing the whole ' +
      'request, so an operator can still act on the parts they can see.',
  })
  @ApiQuery({ name: 'view', required: false, description: 'Base64-encoded filter set' })
  @ApiQuery({ name: 'asset', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'staleAfterMs', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Dashboard overview' })
  @ApiResponse({ status: 400, description: 'The "view" parameter is malformed' })
  overview(
    @Param('organizationId') organizationId: string,
    @Query() query: FinanceDashboardQueryDto,
  ) {
    let filters;
    try {
      filters = this.dashboard.resolveFilters(query);
    } catch (err) {
      if (err instanceof DashboardViewError) {
        throw new ValidationDomainException(err.message, ErrorCode.VAL_INVALID_INPUT);
      }
      throw err;
    }

    return this.dashboard.overview(
      organizationId,
      filters,
      query.staleAfterMs ?? 15 * 60 * 1000,
    );
  }

  /**
   * Executes a high-risk action.
   *
   * Confirmation is enforced in two independent places, because either alone
   * is bypassable:
   *
   *   1. `X-Confirm: <action>` must match the action being requested. A
   *      prefetched link or a crawler cannot set a header.
   *   2. The caller must hold `FinancePermission.APPROVE` in this organization.
   *
   * The action is also re-validated against the body, so a confirmed request
   * for `approve_refund` cannot be repurposed as `write_off_recovery` by
   * editing the URL.
   */
  @Post('dashboard/actions')
  @RequireFinancePermission(FinancePermission.APPROVE)
  @ApiOperation({
    summary: 'Execute a high-risk finance action (requires X-Confirm)',
  })
  @ApiHeader({
    name: 'X-Confirm',
    required: true,
    description: 'Must exactly match the action being requested',
  })
  @ApiBody({ type: DashboardActionDto })
  @ApiResponse({ status: 200, description: 'Action accepted' })
  @ApiResponse({ status: 400, description: 'Unknown action or mismatched confirmation' })
  @ApiResponse({ status: 403, description: 'Caller lacks finance:approve' })
  async act(
    @Param('organizationId') organizationId: string,
    @Headers('x-confirm') confirm: string | undefined,
    @Body() dto: DashboardActionDto,
    @FinanceActor() actor: FinanceActorContext,
  ) {
    if (!confirm || confirm !== dto.action) {
      throw new ValidationDomainException(
        'High-risk actions require an X-Confirm header that exactly matches the action',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    return this.dashboard.execute(organizationId, dto, actor);
  }
}

/** Body for `POST …/scholarship-finance/dashboard/actions`. */
export class DashboardActionDto {
  action: FinanceDashboardAction;

  @IsMongoId()
  id: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Type(() => String)
  note?: string;
}
