import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AssignMentorshipFacilitatorDto } from './dto/assign-mentorship-facilitator.dto';
import { MentorshipFacilitatorService } from './mentorship-facilitator.service';

@ApiTags('Mentorship Facilitators and Reviewers')
@ApiBearerAuth('access-token')
@Controller('mentorship/programs/:programId/facilitators')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR)
export class MentorshipFacilitatorController {
  constructor(private readonly service: MentorshipFacilitatorService) {}
  @Post()
  @ApiOperation({ summary: 'Assign a coordinator, reviewer, safeguarding contact, or finance approver with bounded tenure' })
  assign(@Param('programId', new ParseObjectIdPipe()) programId: string, @Body() dto: AssignMentorshipFacilitatorDto, @CurrentUser('sub') actorId: string, @CurrentUser('role') role: string) { return this.service.assign(programId, dto, actorId, role); }
  @Get()
  @ApiOperation({ summary: 'List current and historical scoped assignments' })
  list(@Param('programId', new ParseObjectIdPipe()) programId: string, @CurrentUser('role') role: string) { return this.service.list(programId, role); }
  @Delete(':assignmentId')
  @ApiOperation({ summary: 'Revoke facilitator access immediately; expiry is also revoked by the worker' })
  revoke(@Param('programId', new ParseObjectIdPipe()) programId: string, @Param('assignmentId', new ParseObjectIdPipe()) assignmentId: string, @CurrentUser('sub') actorId: string, @CurrentUser('role') role: string) { return this.service.revoke(programId, assignmentId, actorId, role); }
}
