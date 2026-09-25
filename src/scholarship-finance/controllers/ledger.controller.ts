import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FinancePermission } from '../domain/finance.enums';
import { ListAuditQueryDto, ListJournalsQueryDto } from '../dto/ledger.dto';
import { ScholarshipFinanceJobs } from '../jobs/scholarship-finance.jobs';
import { FinanceAuditService } from '../services/finance-audit.service';
import { LedgerService } from '../services/ledger.service';
import {
  FinanceAccess,
  FinanceController,
} from './finance-controller.decorators';

@ApiTags('Scholarship Finance — Ledger & Audit')
@FinanceController()
@Controller('organizations/:organizationId/scholarship-finance')
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly audit: FinanceAuditService,
  ) {}

  @Get('ledger/balances')
  @FinanceAccess(FinancePermission.VIEW)
  @ApiQuery({ name: 'assetKey', required: false })
  balances(
    @Param('organizationId') organizationId: string,
    @Query('assetKey') key?: string,
  ) {
    return this.ledger.listBalances(organizationId, key);
  }

  @Get('ledger/journals')
  @FinanceAccess(FinancePermission.VIEW)
  journals(
    @Param('organizationId') organizationId: string,
    @Query() query: ListJournalsQueryDto,
  ) {
    return this.ledger.listJournals(
      organizationId,
      {
        sourceType: query.sourceType,
        sourceId: query.sourceId,
        assetKey: query.assetKey,
      },
      query.limit,
      query.skip,
    );
  }

  @Get('ledger/integrity')
  @FinanceAccess(FinancePermission.VIEW)
  @ApiOperation({
    summary: 'Compare materialized balances with journal totals',
  })
  async integrity(@Param('organizationId') organizationId: string) {
    const drift = await this.ledger.findDrift(organizationId);
    return { consistent: drift.length === 0, drift };
  }

  @Get('audit')
  @FinanceAccess(FinancePermission.VIEW)
  auditTrail(
    @Param('organizationId') organizationId: string,
    @Query() query: ListAuditQueryDto,
  ) {
    return this.audit.list(
      organizationId,
      { entityType: query.entityType, entityId: query.entityId },
      query.limit,
      query.skip,
    );
  }
}

@ApiTags('Scholarship Finance — Ledger & Audit')
@ApiBearerAuth('access-token')
@Controller('scholarship-finance/jobs')
export class FinanceJobsController {
  constructor(private readonly jobs: ScholarshipFinanceJobs) {}

  @Post('run')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Platform admin: run round-closing and integrity jobs now',
  })
  run() {
    return this.jobs.runAll();
  }
}
