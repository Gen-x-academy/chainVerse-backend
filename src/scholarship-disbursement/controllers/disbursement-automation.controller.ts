import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuditActor } from '../../common/audit/audit-context';
import type { AuditContext } from '../../common/audit/audit-context';
import { Public } from '../../common/decorators/public.decorator';
import { RunDisbursementDto } from '../dto/scholarship-payment.dto';
import {
  AUTOMATION_TOKEN_HEADER,
  AutomationTokenGuard,
} from '../guards/automation-token.guard';
import { DisbursementRunTrigger } from '../schemas/disbursement-run.schema';
import { DisbursementExecutorService } from '../services/disbursement-executor.service';
import { DisbursementReconcilerService } from '../services/disbursement-reconciler.service';

/**
 * Machine-to-machine triggers for external schedulers. `@Public` only skips
 * the user-JWT guard; {@link AutomationTokenGuard} is the authentication.
 */
@ApiTags('Scholarship Disbursements (automation)')
@ApiHeader({ name: AUTOMATION_TOKEN_HEADER, required: true })
@ApiUnauthorizedResponse({ description: 'Missing or invalid automation token' })
@Controller('scholarships/disbursements')
@Public()
@UseGuards(AutomationTokenGuard)
export class DisbursementAutomationController {
  constructor(
    private readonly executor: DisbursementExecutorService,
    private readonly reconciler: DisbursementReconcilerService,
  ) {}

  @Post('execute')
  @HttpCode(200)
  @ApiOperation({ summary: 'Execute one bounded batch of due installments' })
  execute(@Body() dto: RunDisbursementDto, @AuditActor() audit: AuditContext) {
    return this.executor.run({
      trigger: DisbursementRunTrigger.AUTOMATION,
      actor: audit,
      organizationId: dto.organizationId,
      batchSize: dto.batchSize,
    });
  }

  @Post('reconcile')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Reconcile one bounded batch of in-flight payments against Horizon',
  })
  reconcile(
    @Body() dto: RunDisbursementDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.reconciler.run({
      trigger: DisbursementRunTrigger.AUTOMATION,
      actor: audit,
      organizationId: dto.organizationId,
      batchSize: dto.batchSize,
    });
  }
}
