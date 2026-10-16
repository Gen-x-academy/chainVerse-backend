import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
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
import {
  ORG_SCOPE_FROM_PATH,
  OrganizationIdParam,
} from '../../common/decorators/organization-id-param.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  DecideScheduleAmendmentDto,
  MilestoneScheduleDto,
  ProposeScheduleAmendmentDto,
} from '../dto/milestone-schedule.dto';
import { Actor } from '../scholarship-actor';
import type { ScholarshipActor } from '../scholarship-actor';
import { MilestoneScheduleService } from '../services/milestone-schedule.service';

@ApiBearerAuth('access-token')
@ApiTags('Scholarship Milestones')
@Controller('organizations/:organizationId/scholarships/awards/:awardId/schedules')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@OrgScope(ORG_SCOPE_FROM_PATH)
export class MilestoneScheduleController {
  constructor(private readonly schedules: MilestoneScheduleService) {}

  @Get()
  @ApiOperation({ summary: 'List every schedule version of an award (staff)' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  list(
    @OrganizationIdParam() orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
  ) {
    return this.schedules.list(orgId, awardId);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Get the binding schedule (recipient or organization member)',
  })
  findActive(
    @OrganizationIdParam() orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.schedules.findActiveForViewer(orgId, awardId, actor);
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft schedule (org owner/admin)' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  createDraft(
    @OrganizationIdParam() orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Body() dto: MilestoneScheduleDto,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.schedules.createDraft(orgId, awardId, dto, actor);
  }

  @Put(':scheduleId')
  @ApiOperation({ summary: 'Replace the milestones of a draft schedule' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  updateDraft(
    @OrganizationIdParam() orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Param('scheduleId', new ParseObjectIdPipe()) scheduleId: string,
    @Body() dto: MilestoneScheduleDto,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.schedules.updateDraft(orgId, awardId, scheduleId, dto, actor);
  }

  @Post(':scheduleId/activate')
  @ApiOperation({ summary: 'Activate a draft; it becomes immutable' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  activate(
    @OrganizationIdParam() orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Param('scheduleId', new ParseObjectIdPipe()) scheduleId: string,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.schedules.activate(orgId, awardId, scheduleId, actor);
  }

  @Post(':scheduleId/amendments')
  @ApiOperation({
    summary: 'Propose an amendment to the active schedule (org owner/admin)',
  })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  proposeAmendment(
    @OrganizationIdParam() orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Param('scheduleId', new ParseObjectIdPipe()) scheduleId: string,
    @Body() dto: ProposeScheduleAmendmentDto,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.schedules.proposeAmendment(
      orgId,
      awardId,
      scheduleId,
      dto,
      actor,
    );
  }

  @Post(':amendmentId/amendment-decision')
  @ApiOperation({
    summary:
      'Approve or reject a pending amendment (a different org owner/admin than the proposer)',
  })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  decideAmendment(
    @OrganizationIdParam() orgId: string,
    @Param('awardId', new ParseObjectIdPipe()) awardId: string,
    @Param('amendmentId', new ParseObjectIdPipe()) amendmentId: string,
    @Body() dto: DecideScheduleAmendmentDto,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.schedules.decideAmendment(
      orgId,
      awardId,
      amendmentId,
      dto,
      actor,
    );
  }
}
