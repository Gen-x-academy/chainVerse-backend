import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  ReviewDeliverableDto,
  SubmitDeliverableDto,
} from './dto/mentorship-deliverable.dto';
import { MentorshipDeliverablesService } from './mentorship-deliverables.service';

@ApiTags('Mentorship Deliverables')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/deliverables')
export class MentorshipDeliverablesController {
  constructor(private readonly service: MentorshipDeliverablesService) {}

  @Post()
  @ApiOperation({
    summary: 'Submit a versioned deliverable against a milestone',
  })
  @ApiResponse({ status: 201, description: 'Deliverable version created' })
  @ApiResponse({
    status: 400,
    description: 'DELIVERABLE_TOO_LARGE | SUBMITTER_CANNOT_REVIEW',
  })
  submit(
    @CurrentUser('sub') actorId: string,
    @Body() dto: SubmitDeliverableDto,
  ) {
    return this.service.submit(actorId, dto);
  }

  @Get('milestone/:milestoneId')
  @ApiOperation({
    summary: 'List deliverables for a milestone visible to the caller',
  })
  list(
    @CurrentUser('sub') actorId: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return this.service.listForMilestone(actorId, milestoneId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a deliverable (submitter, reviewer or decider only)',
  })
  @ApiResponse({ status: 404, description: 'MENTOR_DELIVERABLE_NOT_FOUND' })
  @ApiResponse({ status: 403, description: 'MENTOR_ACCESS_DENIED' })
  get(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ParseObjectIdPipe()) id: string,
  ) {
    return this.service.get(actorId, id);
  }

  @Post(':id/reviews')
  @ApiOperation({
    summary: 'Accept, request changes on, or reject the current version',
  })
  @ApiResponse({
    status: 201,
    description: 'Decision recorded (idempotent per reviewer+decision)',
  })
  @ApiResponse({
    status: 403,
    description: 'MENTOR_NOT_A_REVIEWER | SUBMITTER_CANNOT_REVIEW',
  })
  @ApiResponse({
    status: 400,
    description: 'MENTOR_ALREADY_DECIDED | DELIVERABLE_VERSION_NOT_CURRENT',
  })
  review(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: ReviewDeliverableDto,
  ) {
    return this.service.review(actorId, id, dto);
  }

  @Get(':id/access')
  @ApiOperation({
    summary: 'Resolve the private reference while its access window is open',
  })
  @ApiResponse({ status: 403, description: 'DELIVERABLE_ACCESS_EXPIRED' })
  access(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ParseObjectIdPipe()) id: string,
  ) {
    return this.service.accessReference(actorId, id);
  }
}
