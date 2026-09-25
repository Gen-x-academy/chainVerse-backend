import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../../common/guards/organization-roles.guard';
import {
  OrgRoles,
  OrgScope,
} from '../../common/decorators/org-roles.decorator';
import { OrganizationRole } from '../../common/enums/organization-role.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  AssignVerifierDto,
  RecordVerificationDecisionDto,
} from '../dto/verification.dto';
import { Actor } from '../scholarship-actor';
import type { ScholarshipActor } from '../scholarship-actor';
import { MilestoneVerificationService } from '../services/milestone-verification.service';

@ApiBearerAuth('access-token')
@ApiTags('Scholarship Milestones')
@Controller('organizations/:orgId/scholarships/awards/:awardId')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@OrgScope({ source: 'param', key: 'orgId' })
export class MilestoneVerificationController {
  constructor(private readonly verification: MilestoneVerificationService) {}

  @Post('verifiers')
  @ApiOperation({ summary: 'Assign a verifier to an award (org owner/admin)' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  assign(
    @Param('orgId', new ParseObjectIdPipe()) orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Body() dto: AssignVerifierDto,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.verification.assign(orgId, awardId, dto, actor);
  }

  @Get('verifiers')
  @ApiOperation({ summary: 'List verifier assignments (org owner/admin)' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  listAssignments(
    @Param('orgId', new ParseObjectIdPipe()) orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
  ) {
    return this.verification.listAssignments(orgId, awardId);
  }

  @Delete('verifiers/:assignmentId')
  @ApiOperation({ summary: 'Revoke a verifier assignment (org owner/admin)' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  revoke(
    @Param('orgId', new ParseObjectIdPipe()) orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Param('assignmentId', new ParseObjectIdPipe()) assignmentId: string,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.verification.revoke(orgId, awardId, assignmentId, actor);
  }

  @Post('evidence/:evidenceId/decisions')
  @ApiOperation({
    summary:
      'Approve, reject or request changes on the latest evidence version (assigned verifier)',
  })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  decide(
    @Param('orgId', new ParseObjectIdPipe()) orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Param('evidenceId', new ParseObjectIdPipe()) evidenceId: string,
    @Body() dto: RecordVerificationDecisionDto,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.verification.decide(orgId, awardId, evidenceId, dto, actor);
  }

  @Get('milestones/:milestoneKey/decisions')
  @ApiOperation({
    summary:
      'Decision history for a milestone (recipient, org owner/admin, or assigned verifier)',
  })
  listDecisions(
    @Param('orgId', new ParseObjectIdPipe()) orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Param('milestoneKey') milestoneKey: string,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.verification.listDecisions(orgId, awardId, milestoneKey, actor);
  }
}
