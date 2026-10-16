import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Idempotent } from '../../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { LedgerService } from '../services/ledger.service';
import { CreateChargeDto } from '../dto/create-charge.dto';
import { RecordPaymentDto } from '../dto/record-payment.dto';
import { LedgerEntryType } from '../enums/ledger-entry-type.enum';
import { ChargeType } from '../enums/charge-type.enum';

const CHARGE_TYPE_TO_ENTRY_TYPE: Record<ChargeType, LedgerEntryType> = {
  [ChargeType.OVERDUE_FINE]: LedgerEntryType.OVERDUE_FINE,
  [ChargeType.LOST_ITEM_FEE]: LedgerEntryType.LOST_ITEM_FEE,
  [ChargeType.DAMAGE_FEE]: LedgerEntryType.DAMAGE_FEE,
};

@ApiBearerAuth('access-token')
@ApiTags('E-Library Charges & Payments')
@Controller('e-library/ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post('charges')
  @Roles(Role.MODERATOR, Role.ADMIN)
  @Idempotent()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Record a lost-item or damage charge against a patron',
  })
  createCharge(
    @Body() dto: CreateChargeDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.ledgerService.postEntry({
      patronId: dto.patronId,
      loanId: dto.loanId ?? null,
      entryType: CHARGE_TYPE_TO_ENTRY_TYPE[dto.chargeType],
      amountMinorUnits: Math.abs(dto.amountMinorUnits),
      currency: dto.currency,
      reason: dto.reason,
      createdBy: actorId,
    });
  }

  @Post('payments')
  @Roles(Role.MODERATOR, Role.ADMIN)
  @Idempotent()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Record a payment made by a patron against their balance',
  })
  recordPayment(
    @Body() dto: RecordPaymentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.ledgerService.postEntry({
      patronId: dto.patronId,
      entryType: LedgerEntryType.PAYMENT,
      amountMinorUnits: -Math.abs(dto.amountMinorUnits),
      currency: dto.currency,
      reason: dto.reason,
      createdBy: actorId,
    });
  }

  @Get('patrons/:patronId/balance')
  @Roles(Role.MODERATOR, Role.ADMIN, Role.STUDENT)
  @ApiOperation({ summary: "Get a patron's current balance for a currency" })
  async getBalance(
    @Param('patronId') patronId: string,
    @Query('currency') currency: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: Role,
  ) {
    this.assertCanViewPatron(patronId, actorId, actorRole);
    const balanceMinorUnits = await this.ledgerService.getBalance(
      patronId,
      currency,
    );
    return { patronId, currency, balanceMinorUnits };
  }

  @Get('patrons/:patronId/statement')
  @Roles(Role.MODERATOR, Role.ADMIN, Role.STUDENT)
  @ApiOperation({
    summary: "Get a patron's ledger statement (paginated, append-only entries)",
  })
  getStatement(
    @Param('patronId') patronId: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: Role,
    @Query('currency') currency?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertCanViewPatron(patronId, actorId, actorRole);
    return this.ledgerService.getStatement(patronId, {
      currency,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('patrons/:patronId/reconcile')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: "Recompute a patron's cached balance from the ledger entry stream",
  })
  reconcile(
    @Param('patronId') patronId: string,
    @Query('currency') currency: string,
  ) {
    return this.ledgerService.reconcileBalance(patronId, currency);
  }

  @Get('entries/:id')
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({ summary: 'Get a single ledger entry by id' })
  getEntry(@Param('id') id: string) {
    return this.ledgerService.getEntry(id);
  }

  private assertCanViewPatron(
    patronId: string,
    actorId: string,
    actorRole: Role,
  ) {
    const isStaff = actorRole === Role.MODERATOR || actorRole === Role.ADMIN;
    if (!isStaff && patronId !== actorId) {
      throw new ForbiddenException('You can only view your own ledger');
    }
  }
}
