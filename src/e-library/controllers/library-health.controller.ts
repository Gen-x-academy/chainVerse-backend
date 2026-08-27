import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { LibraryHealthService } from '../services/library-health.service';
import { ReconciliationService } from '../services/reconciliation.service';
import { BackupService, BackupPayload } from '../services/backup.service';

@ApiTags('E-Library')
@ApiBearerAuth('access-token')
@Controller('e-library/health')
export class LibraryHealthController {
  constructor(
    private readonly libraryHealthService: LibraryHealthService,
    private readonly reconciliationService: ReconciliationService,
    private readonly backupService: BackupService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Public health check — no authentication required',
  })
  healthCheck() {
    return { status: 'ok', service: 'e-library', timestamp: new Date().toISOString() };
  }

  @Get('metrics')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Full library health metrics: queue lag, invariant drift, capacity, and stale items',
  })
  getMetrics() {
    return this.libraryHealthService.getLibraryHealth();
  }

  @Post('reconcile')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Trigger reconciliation jobs for available copies, loan statuses, and balances',
  })
  @ApiQuery({
    name: 'dryRun',
    required: false,
    type: Boolean,
    description: 'If true, returns what would be changed without modifying data',
  })
  async reconcile(@Query('dryRun') dryRun?: string) {
    const isDryRun = dryRun === 'true';

    const [copies, loans, balances] = await Promise.all([
      this.reconciliationService.reconcileAvailableCopies(isDryRun),
      this.reconciliationService.reconcileLoanStatuses(isDryRun),
      this.reconciliationService.reconcileBalances(isDryRun),
    ]);

    return { copies, loans, balances };
  }

  @Post('backup')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export all library collections as a JSON backup' })
  @ApiQuery({
    name: 'collections',
    required: false,
    description:
      'Comma-separated list of collection names to export. Omit to export all.',
  })
  backup(@Query('collections') collections?: string) {
    const collectionList = collections
      ? collections.split(',').map((c) => c.trim())
      : undefined;
    return this.backupService.exportCollections(collectionList);
  }

  @Post('restore')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Restore library data from a backup payload. Validates structure before writing. WARNING: overwrites existing data in targeted collections.',
  })
  @ApiBody({ type: Object })
  restore(@Body() payload: BackupPayload) {
    return this.backupService.restoreFromBackup(payload);
  }
}
