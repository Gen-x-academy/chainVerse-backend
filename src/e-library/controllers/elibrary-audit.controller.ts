import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ELibraryAuditService } from '../services/elibrary-audit.service';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';

@ApiTags('E-Library Audit')
@ApiBearerAuth()
@Controller('e-library/audit')
export class ELibraryAuditController {
  constructor(private readonly auditService: ELibraryAuditService) {}

  @Get()
  @ApiOperation({ summary: 'Query audit logs with filters' })
  async queryLogs(@Query() query: AuditLogQueryDto) {
    return this.auditService.query({
      actorId: query.actorId,
      action: query.action,
      targetType: query.targetType,
      targetId: query.targetId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get('target/:targetType/:targetId')
  @ApiOperation({ summary: 'Get audit history for a specific entity' })
  async getAuditForTarget(
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
  ) {
    return this.auditService.getAuditForTarget(targetType, targetId);
  }
}
