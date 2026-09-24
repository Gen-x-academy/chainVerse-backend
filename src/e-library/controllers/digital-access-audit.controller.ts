import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { DigitalAccessAuditQueryDto } from '../dto/digital-access-audit-query.dto';
import { DigitalAccessAuditService } from '../services/digital-access-audit.service';

@ApiTags('E-Library Digital Access Audit')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.LIBRARIAN, Role.MODERATOR)
@Controller(['library/digital-access/audit', 'v1/library/digital-access/audit'])
export class DigitalAccessAuditController {
  constructor(
    private readonly digitalAccessAuditService: DigitalAccessAuditService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Search digital access audit history (patron identifier only, no patron-sensitive context)',
  })
  @ApiResponse({ status: 200, description: 'Matching digital access audit entries' })
  @ApiResponse({ status: 403, description: 'Librarian or moderator role required' })
  query(@Query() dto: DigitalAccessAuditQueryDto) {
    return this.digitalAccessAuditService.queryDigitalAccess(
      {
        patronId: dto.patronId,
        loanId: dto.loanId,
        editionId: dto.editionId,
        renditionId: dto.renditionId,
        outcome: dto.outcome,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
      },
      { page: dto.page, limit: dto.limit },
    );
  }

  @Get(':auditId')
  @ApiOperation({ summary: 'Fetch a single digital access audit entry' })
  @ApiParam({ name: 'auditId', description: 'Audit entry ObjectId' })
  @ApiResponse({ status: 200, description: 'The audit entry' })
  @ApiResponse({ status: 404, description: 'Audit entry not found' })
  getEntry(@Param('auditId') auditId: string) {
    return this.digitalAccessAuditService.getAuditEntry(auditId);
  }
}