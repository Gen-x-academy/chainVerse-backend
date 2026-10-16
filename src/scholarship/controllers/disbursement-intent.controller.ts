import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
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
  CreateDisbursementIntentDto,
  ListDisbursementIntentsDto,
  RecordIntentTransitionDto,
} from '../dto/disbursement-intent.dto';
import { Actor } from '../scholarship-actor';
import type { ScholarshipActor } from '../scholarship-actor';
import { DisbursementIntentService } from '../services/disbursement-intent.service';

@ApiBearerAuth('access-token')
@ApiTags('Scholarship Disbursements')
@Controller('organizations/:organizationId/scholarships/disbursement-intents')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@OrgScope(ORG_SCOPE_FROM_PATH)
@OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
export class DisbursementIntentController {
  constructor(private readonly intents: DisbursementIntentService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create (or reconcile) the single disbursement intent for a payment eligibility',
  })
  @ApiResponse({ status: 201, description: 'Intent created' })
  @ApiResponse({ status: 200, description: 'Existing intent returned' })
  async create(
    @OrganizationIdParam() orgId: string,
    @Body() dto: CreateDisbursementIntentDto,
    @Actor() actor: ScholarshipActor,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.intents.createForEligibility(
      orgId,
      dto.eligibilityId,
      actor.userId,
      actor.audit,
    );
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'List disbursement intents' })
  list(
    @OrganizationIdParam() orgId: string,
    @Query() query: ListDisbursementIntentsDto,
  ) {
    return this.intents.list(orgId, query);
  }

  @Get(':intentId')
  @ApiOperation({ summary: 'Get one disbursement intent' })
  findOne(
    @OrganizationIdParam() orgId: string,
    @Param('intentId', new ParseObjectIdPipe()) intentId: string,
  ) {
    return this.intents.findOne(orgId, intentId);
  }

  @Post(':intentId/transitions')
  @ApiOperation({
    summary:
      'Record external execution state (submitted/confirmed/failed/cancelled). Exact repeats are no-ops.',
  })
  transition(
    @OrganizationIdParam() orgId: string,
    @Param('intentId', new ParseObjectIdPipe()) intentId: string,
    @Body() dto: RecordIntentTransitionDto,
    @Actor() actor: ScholarshipActor,
  ) {
    return this.intents.transition(
      orgId,
      intentId,
      dto,
      actor.userId,
      actor.audit,
    );
  }
}
