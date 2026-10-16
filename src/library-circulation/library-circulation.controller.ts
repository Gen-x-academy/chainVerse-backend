import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { Idempotent } from '../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { LibraryCirculationService } from './library-circulation.service';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { PlaceHoldDto } from './dto/place-hold.dto';
import { DueDateOverrideDto } from './dto/due-date-override.dto';
import { ResolveOverrideDto } from './dto/resolve-override.dto';
import { PatronLoanQueryDto } from './dto/patron-loan-query.dto';

type AuthedRequest = Request & { user: { id: string; role: Role } };

@ApiTags('Library Circulation')
@ApiBearerAuth('access-token')
@Controller('library/circulation')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(IdempotencyInterceptor)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
export class LibraryCirculationController {
  constructor(private readonly service: LibraryCirculationService) {}

  // ── Catalog ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Register a new library item (staff only)' })
  @Post('items')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  createItem(@Body() dto: CreateLibraryItemDto) {
    return this.service.createItem(dto);
  }

  // ── Checkout / return / renew (idempotent, #1023) ────────────────────────

  @ApiOperation({
    summary: 'Check out a library item',
    description:
      'Self-service for students, or staff-assisted (pass patronId) for librarians/admins. ' +
      'Safe to retry: requires an X-Idempotency-Key header.',
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    description: 'Client-generated key; the same key + payload replays the original result.',
  })
  @Post('checkout')
  @Roles(Role.STUDENT, Role.LIBRARIAN, Role.ADMIN)
  @Idempotent()
  checkout(@Req() req: AuthedRequest, @Body() dto: CheckoutDto) {
    return this.service.checkout(req.user.id, req.user.role, dto);
  }

  @ApiOperation({
    summary: 'Return a checked-out item',
    description: 'Safe to retry: requires an X-Idempotency-Key header.',
  })
  @ApiHeader({ name: 'X-Idempotency-Key', required: true })
  @Post(':loanId/return')
  @Roles(Role.STUDENT, Role.LIBRARIAN, Role.ADMIN)
  @Idempotent()
  returnLoan(@Req() req: AuthedRequest, @Param('loanId') loanId: string) {
    return this.service.returnLoan(req.user.id, req.user.role, loanId);
  }

  @ApiOperation({
    summary: 'Renew an active loan',
    description: 'Safe to retry: requires an X-Idempotency-Key header.',
  })
  @ApiHeader({ name: 'X-Idempotency-Key', required: true })
  @Post(':loanId/renew')
  @Roles(Role.STUDENT, Role.LIBRARIAN, Role.ADMIN)
  @Idempotent()
  renewLoan(@Req() req: AuthedRequest, @Param('loanId') loanId: string) {
    return this.service.renewLoan(req.user.id, req.user.role, loanId);
  }

  @ApiOperation({ summary: "List the authenticated patron's own loans" })
  @Get('my-loans')
  @Roles(Role.STUDENT)
  getMyLoans(@Req() req: AuthedRequest, @Query() query: PatronLoanQueryDto) {
    return this.service.getMyLoans(req.user.id, query);
  }

  // ── Holds (supports hold-conflict detection on due-date overrides) ──────

  @ApiOperation({ summary: 'Place a hold on a library item' })
  @Post('holds')
  @Roles(Role.STUDENT)
  placeHold(@Req() req: AuthedRequest, @Body() dto: PlaceHoldDto) {
    return this.service.placeHold(req.user.id, dto);
  }

  // ── Receipts (#1022) ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Fetch a checkout or return receipt (owner or staff)' })
  @Get('receipts/:transactionId')
  @Roles(Role.STUDENT, Role.LIBRARIAN, Role.ADMIN)
  getReceipt(@Req() req: AuthedRequest, @Param('transactionId') transactionId: string) {
    return this.service.getReceipt(req.user.id, req.user.role, transactionId);
  }

  // ── Librarian patron-loan lookup (#1021) ─────────────────────────────────

  @ApiOperation({
    summary: "Look up a patron's active and recent loans (library staff only)",
    description: 'Every access is audited. Rate-limited to 10 lookups/minute per staff member.',
  })
  @Get('patrons/:patronId/loans')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  lookupPatronLoans(
    @Req() req: AuthedRequest,
    @Param('patronId') patronId: string,
    @Query() query: PatronLoanQueryDto,
  ) {
    const requestId = req.headers['x-request-id'] as string | undefined;
    return this.service.lookupPatronLoans(req.user.id, patronId, query, requestId);
  }

  // ── Manual due-date override with approval audit (#1024) ─────────────────

  @ApiOperation({
    summary: 'Request a manual due-date override or correction (library staff only)',
    description:
      'Applies immediately when within policy limits and free of hold conflicts; ' +
      'otherwise the override is recorded as pending elevated (admin) approval.',
  })
  @Post(':loanId/due-date-override')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  requestDueDateOverride(
    @Req() req: AuthedRequest,
    @Param('loanId') loanId: string,
    @Body() dto: DueDateOverrideDto,
  ) {
    return this.service.requestDueDateOverride(req.user.id, loanId, dto);
  }

  @ApiOperation({
    summary: 'Approve or reject a pending due-date override (elevated approval, admin only)',
  })
  @Post('due-date-overrides/:overrideId/resolve')
  @Roles(Role.ADMIN)
  resolveDueDateOverride(
    @Req() req: AuthedRequest,
    @Param('overrideId') overrideId: string,
    @Body() dto: ResolveOverrideDto,
  ) {
    return this.service.resolveDueDateOverride(req.user.id, overrideId, dto);
  }
}
