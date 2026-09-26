import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-user';
import { JoiValidationPipe } from '../common/joi-validation.pipe';
import { TenantAccessService } from '../common/tenant-access.service';
import { ScholarshipProgramService } from '../programs/scholarship-program.service';
import {
  BalancesQuery,
  balancesQuerySchema,
  ListLedgerEntriesQuery,
  listLedgerEntriesSchema,
  PostLedgerEntryDto,
  postLedgerEntrySchema,
  ReverseLedgerEntryDto,
  reverseLedgerEntrySchema,
} from './dto/ledger.dto';
import { LedgerQueryService } from './ledger-query.service';
import { LedgerService, presentLedgerEntry } from './ledger.service';

@ApiTags('Scholarship Finance — Ledger')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller(
  'organizations/:organizationId/scholarship-programs/:programId/ledger',
)
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly query: LedgerQueryService,
    private readonly programs: ScholarshipProgramService,
    private readonly tenant: TenantAccessService,
  ) {}

  @Post('entries')
  @ApiOperation({
    summary: 'Post a balanced journal entry',
    description:
      'Idempotent by `reference`: replaying an identical request returns the original entry; ' +
      'reusing a reference with a different payload returns 409. Reservations and awards are ' +
      'blocked while the program is insolvent or has unresolved reconciliation alerts.',
  })
  async post(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Body(new JoiValidationPipe(postLedgerEntrySchema)) dto: PostLedgerEntryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanWrite(req.user, organizationId);
    const program = await this.programs.get(organizationId, programId);
    return this.ledger.post(program, dto, req.user.id);
  }

  @Post('entries/:entryId/reversals')
  @ApiOperation({
    summary:
      'Reverse an entry by posting its mirror image (history is never edited)',
  })
  async reverse(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Param('entryId') entryId: string,
    @Body(new JoiValidationPipe(reverseLedgerEntrySchema))
    dto: ReverseLedgerEntryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanWrite(req.user, organizationId);
    const program = await this.programs.get(organizationId, programId);
    return this.ledger.reverse(program, entryId, dto, req.user.id);
  }

  @Get('entries')
  @ApiOperation({
    summary: 'List journal entries (newest first, cursor-paginated)',
  })
  async list(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Query(new JoiValidationPipe(listLedgerEntriesSchema))
    q: ListLedgerEntriesQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    const program = await this.programs.get(organizationId, programId);
    return this.ledger.list(program, q);
  }

  @Get('entries/:entryId')
  @ApiOperation({ summary: 'Get a journal entry' })
  async get(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Param('entryId') entryId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    const program = await this.programs.get(organizationId, programId);
    return presentLedgerEntry(await this.ledger.findOne(program, entryId));
  }

  @Get('balances')
  @ApiOperation({
    summary: 'Derived account balances, optionally as of a point in time',
  })
  async balances(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Query(new JoiValidationPipe(balancesQuerySchema)) q: BalancesQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    const program = await this.programs.get(organizationId, programId);
    const snapshot = await this.query.snapshot(String(program._id), q.asOf);
    return {
      programId: String(program._id),
      assetCode: program.asset.code,
      asOf: q.asOf ?? new Date(),
      ...LedgerQueryService.present(snapshot),
    };
  }
}
