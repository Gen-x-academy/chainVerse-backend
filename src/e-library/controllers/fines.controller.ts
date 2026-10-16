import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { LoanService } from '../services/loan.service';
import { ChargePolicyService } from '../services/charge-policy.service';
import { FineCalculationService } from '../services/fine-calculation.service';
import { ChargeType } from '../enums/charge-type.enum';
import { DEFAULT_CURRENCY } from '../e-library.constants';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Fine Calculation')
@Controller('e-library/fines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinesController {
  constructor(
    private readonly loanService: LoanService,
    private readonly chargePolicyService: ChargePolicyService,
    private readonly fineCalculationService: FineCalculationService,
  ) {}

  @Get('loans/:loanId/preview')
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({
    summary:
      'Preview the overdue fine a loan would accrue as of a given date, without posting anything to the ledger',
  })
  async preview(
    @Param('loanId') loanId: string,
    @Query('asOf') asOf?: string,
    @Query('currency') currency?: string,
  ) {
    const loan = await this.loanService.getLoan(loanId);
    const asOfDate = asOf ? new Date(asOf) : new Date();
    const policy = await this.chargePolicyService.getEffectivePolicy(
      ChargeType.OVERDUE_FINE,
      currency ?? DEFAULT_CURRENCY,
      asOfDate,
    );
    return this.fineCalculationService.calculate(loan, policy, asOfDate);
  }
}
