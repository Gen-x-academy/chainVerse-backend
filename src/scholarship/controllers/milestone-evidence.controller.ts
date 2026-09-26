import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { SubmitMilestoneEvidenceDto } from '../dto/submit-milestone-evidence.dto';
import { Actor } from '../scholarship-actor';
import type { ScholarshipActor } from '../scholarship-actor';
import { MilestoneEvidenceService } from '../services/milestone-evidence.service';

/**
 * Recipients are usually not organization members, so these routes are not
 * behind `OrganizationRolesGuard`; the service authorizes each call against
 * the award (recipient, org owner/admin, or assigned verifier) and scopes
 * every lookup to `orgId`.
 */
@ApiBearerAuth('access-token')
@ApiTags('Scholarship Milestones')
@Controller('organizations/:orgId/scholarships/awards/:awardId')
@UseGuards(JwtAuthGuard)
export class MilestoneEvidenceController {
  constructor(private readonly evidence: MilestoneEvidenceService) {}

  @Post('milestones/:milestoneKey/evidence')
  @ApiOperation({
    summary:
      'Submit evidence for a milestone (recipient or trusted org system). Idempotent on submissionKey.',
  })
  @ApiResponse({ status: 201, description: 'New evidence version recorded' })
  @ApiResponse({
    status: 200,
    description: 'Duplicate; existing version returned',
  })
  async submit(
    @Param('orgId', new ParseObjectIdPipe()) orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Param('milestoneKey') milestoneKey: string,
    @Body() dto: SubmitMilestoneEvidenceDto,
    @Actor() actor: ScholarshipActor,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.evidence.submit(
      orgId,
      awardId,
      milestoneKey,
      dto,
      actor,
    );
    res.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return result;
  }

  @Get('milestones/:milestoneKey/evidence')
  @ApiOperation({ summary: 'List evidence versions (metadata only)' })
  list(
    @Param('orgId', new ParseObjectIdPipe()) orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Param('milestoneKey') milestoneKey: string,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.evidence.list(orgId, awardId, milestoneKey, actor);
  }

  @Get('evidence/:evidenceId')
  @ApiOperation({
    summary: 'Decrypt one evidence version (audited read)',
  })
  reveal(
    @Param('orgId', new ParseObjectIdPipe()) orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Param('evidenceId', new ParseObjectIdPipe()) evidenceId: string,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.evidence.reveal(orgId, awardId, evidenceId, actor);
  }
}
