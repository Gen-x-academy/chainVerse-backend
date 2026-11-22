import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { MentorshipCtx, MentorshipRequestContext } from '../shared/mentorship-context';
import { CapacityAccessPolicy } from './capacity-access.policy';
import { CapacityService } from './capacity.service';
import {
  DefineCapacityPolicyDto,
  ExpireReservationsDto,
  InspectAllocationQueryDto,
  ReserveCapacityDto,
} from './dto/capacity.dto';

@ApiTags('Mentorship Capacity (MENTOR-041)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/capacity')
export class CapacityController {
  constructor(
    private readonly service: CapacityService,
    private readonly access: CapacityAccessPolicy,
  ) {}

  @Post('policies')
  @ApiOperation({
    summary: 'Define (or re-publish) a versioned capacity policy — staff only',
    description:
      'Identical limits return the current version. A stale expectedVersion is rejected with MENTOR_STALE_VERSION.',
  })
  @ApiOkResponse({ description: 'The published (or unchanged) policy.' })
  @ApiForbiddenResponse({ description: 'MENTOR_ACCESS_DENIED' })
  @ApiConflictResponse({ description: 'MENTOR_STALE_VERSION' })
  definePolicy(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Body() dto: DefineCapacityPolicyDto,
  ) {
    return this.service.definePolicy(ctx, dto);
  }

  @Get('mentors/:mentorId/allocation')
  @ApiOperation({
    summary: 'Inspect a mentor’s capacity calculation — read-only, staff only',
    description:
      'Returns the effective policy, current usage and remaining capacity. Inspectors never bypass limits; no state is written.',
  })
  @ApiOkResponse({ description: 'The calculation and its blocking reasons.' })
  @ApiForbiddenResponse({ description: 'MENTOR_ACCESS_DENIED' })
  inspect(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('mentorId', new ParseObjectIdPipe()) mentorId: string,
    @Query() query: InspectAllocationQueryDto,
  ) {
    return this.service.inspectAllocation(ctx, mentorId, query);
  }

  @Post('reservations')
  @ApiOperation({
    summary: 'Reserve one proposal slot (mentor for self, or staff on their behalf)',
    description:
      'Atomic and idempotent: retries return the original reservation without holding a second slot.',
  })
  @ApiOkResponse({ description: 'The active reservation.' })
  @ApiForbiddenResponse({ description: 'MENTOR_ACCESS_DENIED' })
  @ApiConflictResponse({ description: 'MENTOR_CAPACITY_EXHAUSTED / MENTOR_CAPACITY_RESERVATION_CONFLICT' })
  reserve(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Body() dto: ReserveCapacityDto,
  ) {
    return this.service.reserveCapacity(ctx, dto);
  }

  @Delete('reservations/:proposalId')
  @ApiOperation({ summary: 'Release a proposal’s reserved slot (idempotent)' })
  @ApiOkResponse({ description: 'The released (or already terminal) reservation.' })
  @ApiForbiddenResponse({ description: 'MENTOR_ACCESS_DENIED' })
  release(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('proposalId', new ParseObjectIdPipe()) proposalId: string,
    @Query('mentorId', new ParseObjectIdPipe()) mentorId: string,
  ) {
    return this.service.releaseCapacity(ctx, mentorId, proposalId);
  }

  @Post('sweep')
  @ApiOperation({
    summary: 'Release expired reservations — staff only',
    description: 'Bounded, idempotent sweeper; safe to run repeatedly.',
  })
  @ApiOkResponse({ description: 'Number of reservations scanned and expired.' })
  @ApiForbiddenResponse({ description: 'MENTOR_ACCESS_DENIED' })
  sweep(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Body() dto: ExpireReservationsDto,
  ) {
    // Sweeping is a staff operation; enforce the same deny-by-default rule.
    this.access.assertCanSweep(ctx.user);
    return this.service.expireReservations(dto);
  }
}
