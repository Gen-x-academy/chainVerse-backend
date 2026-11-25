import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  ProposeCorrectionDto,
  SignOffCorrectionDto,
  StartReconciliationRunDto,
} from './dto/reconciliation.dto';
import { MentorshipReconciliationService } from './mentorship-reconciliation.service';

@ApiTags('Mentorship Reconciliation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/reconciliation')
export class MentorshipReconciliationController {
  constructor(private readonly service: MentorshipReconciliationService) {}

  @Post('runs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run (or resume) a reconciliation of internal ledger vs external transactions',
    description:
      'Idempotent per idempotencyKey and resumable: a retry continues after the last persisted item. Mismatch types: missing_external, missing_internal, amount_mismatch, currency_mismatch, duplicate_external.',
  })
  @ApiResponse({ status: 200, description: 'Run summary' })
  @ApiResponse({ status: 403, description: 'MENTOR_ACCESS_DENIED' })
  run(
    @Body() dto: StartReconciliationRunDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.run(dto, { userId, roles: roles ?? [] });
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Read a run and its mismatches' })
  getRun(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.getRun(id, { userId, roles: roles ?? [] });
  }

  @Post('mismatches/:id/correction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Propose a correction for a mismatch' })
  propose(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: ProposeCorrectionDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.proposeCorrection(id, dto, { userId, roles: roles ?? [] });
  }

  @Post('mismatches/:id/sign-off')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign off (or reject) a proposed correction; not the proposer' })
  @ApiResponse({ status: 403, description: 'CORRECTION_NEEDS_SECOND_SIGNER' })
  signOff(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: SignOffCorrectionDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.signOff(id, dto, { userId, roles: roles ?? [] });
  }
}
