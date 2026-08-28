import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { Idempotent } from '../../idempotency/decorators/idempotent.decorator';
import { LibraryChargePaymentService } from '../services/library-charge-payment.service';
import { PayLibraryChargeDto } from '../dto/pay-library-charge.dto';

interface AuthenticatedRequest {
  user: { id: string; role: string };
}

@ApiBearerAuth('access-token')
@ApiTags('E-Library Charge Payments')
@Controller('e-library/charges')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryChargePaymentController {
  constructor(
    private readonly chargePaymentService: LibraryChargePaymentService,
  ) {}

  /**
   * POST /e-library/charges/pay
   *
   * Settle an eligible library charge using an on-chain Stellar transaction.
   * The request is idempotent on X-Idempotency-Key: replaying the same key
   * returns the cached response without re-verifying.
   */
  @Post('pay')
  @Roles(Role.STUDENT, Role.TUTOR, Role.MODERATOR, Role.ADMIN)
  @Idempotent()
  @ApiOperation({
    summary: 'Settle a library charge via Stellar payment',
    description:
      'Verifies the Stellar transaction on-chain and, on success, posts a PAYMENT entry ' +
      'to the patron ledger. Idempotent: submitting the same (chargeEntryId + transactionHash) ' +
      'twice returns the original result without double-posting.',
  })
  pay(
    @Body() dto: PayLibraryChargeDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.chargePaymentService.payCharge(dto, req.user.id);
  }

  /**
   * GET /e-library/charges/payments/:patronId
   *
   * List payment records for a patron. Admin/moderator can look up any patron;
   * students and tutors can only look up their own records.
   */
  @Get('payments/:patronId')
  @Roles(Role.STUDENT, Role.TUTOR, Role.MODERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'List Stellar payment records for a patron',
  })
  @ApiParam({ name: 'patronId', description: 'Patron user ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum records to return (default 50, max 200)',
  })
  listForPatron(
    @Param('patronId') patronId: string,
    @Query('limit') limit?: string,
    @Request() req?: AuthenticatedRequest,
  ) {
    // Students and tutors may only query their own records.
    const role = req?.user?.role as Role | undefined;
    const effectivePatronId =
      role === Role.STUDENT || role === Role.TUTOR
        ? req!.user.id
        : patronId;

    return this.chargePaymentService.listForPatron(
      effectivePatronId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * GET /e-library/charges/payment/:id
   *
   * Retrieve a single payment record by its document ID.
   */
  @Get('payment/:id')
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Get a single library charge payment record by ID',
  })
  @ApiParam({ name: 'id', description: 'LibraryChargePayment document ID' })
  getById(@Param('id') id: string) {
    return this.chargePaymentService.getById(id);
  }
}
