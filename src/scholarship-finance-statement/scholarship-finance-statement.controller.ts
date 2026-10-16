import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../common/guards/organization-roles.guard';
import { OrgRoles, OrgScope } from '../common/decorators/org-roles.decorator';
import { OrganizationRole } from '../common/enums/organization-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ScholarshipFinanceStatementService } from './scholarship-finance-statement.service';
import {
  GenerateStatementDto,
  StatementListQueryDto,
  StatementOrgQueryDto,
} from './dto/finance-statement.dto';

/**
 * Scholarship finance statement API.
 *
 * Sponsors and finance operators can request period statements that reconcile
 * contributions, commitments, payments, fees, refunds, and remaining balances.
 *
 * Statement generation flow:
 *   1. POST /generate  — requests statement generation.
 *      - If the period is small (≤ 500 line items), the response is READY
 *        immediately.
 *      - For larger periods, the response status is PENDING and the client
 *        should poll GET /:id until status = READY.
 *   2. GET /          — lists all statement requests for an organisation.
 *   3. GET /:id       — retrieves a statement with full line items.
 *
 * Authorization: OWNER or ADMIN of the target organisation.
 *
 * Operational impact:
 *   - POST /generate is idempotent within a period: attempting to generate a
 *     second statement for the same scope while one is PENDING or RUNNING
 *     returns BIZ_STATEMENT_EXPORT_IN_PROGRESS (HTTP 422).
 *   - Large exports run asynchronously via `ScholarshipFinanceStatementJobs`.
 *   - READY statements expire after 30 days; line items are purged on expiry.
 *
 * Privacy:
 *   Statements contain financial amounts; access is restricted to OWNER and
 *   ADMIN organisation roles.  No applicant identity is included.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarship — Finance Statement')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/finance-statements')
export class ScholarshipFinanceStatementController {
  constructor(private readonly svc: ScholarshipFinanceStatementService) {}

  // ── Generate ──────────────────────────────────────────────────────────────

  @Post('generate')
  @OrgScope({ source: 'body', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Request a finance statement for a period',
    description:
      'Returns a READY statement inline for short periods (≤ 500 line items). ' +
      'For larger periods the response status is PENDING; poll GET /:id for completion.',
  })
  @ApiResponse({ status: 201, description: 'Statement created (READY or PENDING)' })
  @ApiResponse({
    status: 422,
    description:
      'periodStart ≥ periodEnd, currency mismatch, no entries, or export already in progress',
  })
  generate(
    @CurrentUser('sub') actorId: string,
    @Body() dto: GenerateStatementDto,
  ) {
    return this.svc.generateStatement(actorId, dto);
  }

  // ── List ──────────────────────────────────────────────────────────────────

  @Get()
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'List statement requests for the organisation' })
  @ApiResponse({ status: 200, description: 'Paginated statement summaries (no line items)' })
  list(@Query() query: StatementListQueryDto) {
    return this.svc.listStatements(query);
  }

  // ── Get ───────────────────────────────────────────────────────────────────

  @Get(':statementId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Retrieve a statement with full line items',
    description:
      'When status = PENDING or RUNNING, lineItems is empty and the caller ' +
      'should poll again. When status = EXPIRED, line items have been purged.',
  })
  @ApiResponse({ status: 200, description: 'Statement document returned' })
  @ApiResponse({ status: 404, description: 'Statement not found in this organisation' })
  get(
    @Param('statementId', new ParseObjectIdPipe()) statementId: string,
    @Query() query: StatementOrgQueryDto,
  ) {
    return this.svc.getStatement(query.organizationId, statementId);
  }
}
