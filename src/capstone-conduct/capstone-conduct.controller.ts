import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CapstoneConductService } from './capstone-conduct.service';
import { ConductActor, ConductTrack } from './capstone-conduct.types';
import {
  AcknowledgePolicyDto,
  PublishPolicyDto,
  RecordBreachDto,
  TransitionBreachDto,
} from './dto/capstone-conduct.dto';

@ApiTags('Capstone Code of Conduct')
@ApiBearerAuth('access-token')
@ApiParam({
  name: 'tenantId',
  description: 'Tenant that owns the conduct data',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT)
@Controller('capstone-conduct/tenants/:tenantId')
export class CapstoneConductController {
  constructor(private readonly service: CapstoneConductService) {}

  @Post('policies')
  @ApiOperation({
    summary: 'Publish a new conduct policy version (CAPSTONE-055)',
    description:
      'Admin/moderator only. Supersedes the current version. Stores a content digest, never the policy text.',
  })
  @ApiResponse({ status: 201, description: 'Policy version published' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 409, description: 'BIZ_IDEMPOTENCY_KEY_REUSED' })
  publishPolicy(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: PublishPolicyDto,
  ) {
    return this.service.publishPolicy(
      this.actor(tenantId, user),
      tenantId,
      dto,
    );
  }

  @Get('policies')
  @ApiOperation({ summary: 'List all policy versions (admin/moderator)' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  listPolicies(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listPolicies(this.actor(tenantId, user), tenantId);
  }

  @Get('policies/current')
  @ApiOperation({ summary: 'Get the current policy for a track' })
  @ApiQuery({ name: 'track', enum: ConductTrack })
  @ApiResponse({ status: 404, description: 'RES_CONDUCT_POLICY_NOT_FOUND' })
  currentPolicy(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Query('track', new ParseEnumPipe(ConductTrack)) track: ConductTrack,
  ) {
    return this.service.getCurrentPolicy(
      this.actor(tenantId, user),
      tenantId,
      track,
    );
  }

  @Post('acknowledgements')
  @ApiOperation({
    summary:
      'Acknowledge the current conduct policy as the caller (CAPSTONE-055)',
    description:
      'Self-service only. Repeating the request is safe: an existing acknowledgement is returned with created=false.',
  })
  @ApiResponse({
    status: 201,
    description: 'Acknowledgement recorded or replayed',
  })
  @ApiResponse({ status: 409, description: 'BIZ_IDEMPOTENCY_KEY_REUSED' })
  @ApiResponse({
    status: 422,
    description: 'BIZ_CONDUCT_POLICY_STALE | BIZ_CONDUCT_POLICY_NOT_APPLICABLE',
  })
  acknowledge(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: AcknowledgePolicyDto,
  ) {
    return this.service.acknowledge(this.actor(tenantId, user), tenantId, dto);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Acknowledgement standing for a track (CAPSTONE-055)',
    description:
      'Defaults to the caller. Reading another user requires admin/moderator.',
  })
  @ApiQuery({ name: 'track', enum: ConductTrack })
  @ApiQuery({ name: 'userId', required: false })
  status(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Query('track', new ParseEnumPipe(ConductTrack)) track: ConductTrack,
    @Query('userId') userId?: string,
  ) {
    return this.service.getStatus(
      this.actor(tenantId, user),
      tenantId,
      track,
      userId,
    );
  }

  @Post('breaches')
  @ApiOperation({
    summary: 'Record a restricted breach reference (CAPSTONE-055)',
    description:
      'Admin/moderator only. Stores an opaque case id, subject, track, policy version and severity — no narrative or evidence.',
  })
  @ApiResponse({ status: 201, description: 'Breach reference recorded' })
  @ApiResponse({ status: 403, description: 'AUTH_INSUFFICIENT_PERMISSIONS' })
  @ApiResponse({ status: 404, description: 'RES_CONDUCT_POLICY_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description: 'RES_ALREADY_EXISTS | BIZ_IDEMPOTENCY_KEY_REUSED',
  })
  recordBreach(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: RecordBreachDto,
  ) {
    return this.service.recordBreach(this.actor(tenantId, user), tenantId, dto);
  }

  @Get('breaches')
  @ApiOperation({ summary: 'List breach references (admin/moderator)' })
  listBreaches(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.listBreaches(this.actor(tenantId, user), tenantId);
  }

  @Get('breaches/:breachId')
  @ApiOperation({ summary: 'Get a breach reference (admin/moderator)' })
  @ApiParam({ name: 'breachId' })
  @ApiResponse({ status: 404, description: 'RES_CONDUCT_BREACH_NOT_FOUND' })
  getBreach(
    @Param('tenantId') tenantId: string,
    @Param('breachId') breachId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getBreach(
      this.actor(tenantId, user),
      tenantId,
      breachId,
    );
  }

  @Post('breaches/:breachId/transitions')
  @ApiOperation({ summary: 'Move a breach reference through its lifecycle' })
  @ApiParam({ name: 'breachId' })
  @ApiResponse({
    status: 422,
    description: 'BIZ_CONDUCT_BREACH_INVALID_TRANSITION',
  })
  transitionBreach(
    @Param('tenantId') tenantId: string,
    @Param('breachId') breachId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
    @Body() dto: TransitionBreachDto,
  ) {
    return this.service.transitionBreach(
      this.actor(tenantId, user),
      tenantId,
      breachId,
      dto,
    );
  }

  @Get('audit')
  @ApiOperation({ summary: 'Read conduct audit metadata (admin/moderator)' })
  audit(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: Record<string, unknown> | undefined,
  ) {
    return this.service.getAudit(this.actor(tenantId, user), tenantId);
  }

  private actor(
    tenantId: string,
    user: Record<string, unknown> | undefined,
  ): ConductActor | undefined {
    if (!user) return undefined;
    return {
      actorId: typeof user['sub'] === 'string' ? user['sub'] : '',
      tenantId,
      roles: typeof user['role'] === 'string' ? [user['role']] : [],
    };
  }
}
