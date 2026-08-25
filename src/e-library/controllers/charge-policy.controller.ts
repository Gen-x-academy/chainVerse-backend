import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChargePolicyService } from '../services/charge-policy.service';
import { CreateChargePolicyDto } from '../dto/create-charge-policy.dto';
import { ChargeType } from '../enums/charge-type.enum';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Charge Policies')
@Controller('e-library/charge-policies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChargePolicyController {
  constructor(private readonly chargePolicyService: ChargePolicyService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Create a new versioned charge policy (admin only)',
  })
  create(
    @Body() dto: CreateChargePolicyDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.chargePolicyService.createPolicy(dto, actorId);
  }

  @Get()
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'List charge policies, optionally filtered by charge type',
  })
  list(@Query('chargeType') chargeType?: ChargeType) {
    return this.chargePolicyService.listPolicies(chargeType);
  }

  @Get('effective')
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({
    summary:
      'Look up the policy effective for a charge type/currency at a given date',
  })
  getEffective(
    @Query('chargeType') chargeType: ChargeType,
    @Query('currency') currency: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.chargePolicyService.getEffectivePolicy(
      chargeType,
      currency,
      asOf ? new Date(asOf) : new Date(),
    );
  }
}
