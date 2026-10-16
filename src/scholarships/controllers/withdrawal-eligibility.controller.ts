import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../../common/guards/organization-roles.guard';
import { OrgRoles, OrgScope } from '../../common/decorators/org-roles.decorator';
import { OrganizationRole } from '../../common/enums/organization-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { WithdrawalPolicyService } from '../services/withdrawal-policy.service';
import { EligibilityRuleService } from '../services/eligibility-rule.service';
import { WithdrawApplicationDto, UpsertWithdrawalPolicyDto } from '../dto/withdrawal.dto';
import { AddEligibilityRuleDto, EligibilityQueryDto } from '../dto/eligibility-rule.dto';
import { OrgScopedQueryDto } from '../dto/scholarship-program.dto';

@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Withdrawal & Eligibility')
@Controller('scholarships')
export class WithdrawalEligibilityController {
  constructor(
    private readonly withdrawalService: WithdrawalPolicyService,
    private readonly eligibilityService: EligibilityRuleService,
  ) {}

  // ── Withdrawal ─────────────────────────────────────────────────────────────

  @Delete('applications/:applicationId/withdraw')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @ApiOperation({
    summary:
      'Withdraw an application — requires explicit confirmation, records a reason category, preserves review history',
  })
  @ApiResponse({ status: 200, description: 'Application withdrawn' })
  @ApiResponse({ status: 409, description: 'Withdrawal not allowed by policy or window expired' })
  async withdraw(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @Body() dto: WithdrawApplicationDto,
    @CurrentUser('sub') applicantId: string,
  ) {
    const { application } = await this.withdrawalService.withdraw(
      applicationId,
      applicantId,
      dto,
    );
    return application;
  }

  // ── Withdrawal policy management ───────────────────────────────────────────

  @Put('programs/:programId/withdrawal-policy')
  @UseGuards(JwtAuthGuard, OrganizationRolesGuard)
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Create or update the withdrawal policy for a program' })
  upsertPolicy(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
    @Body() dto: UpsertWithdrawalPolicyDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.withdrawalService.upsertPolicy(
      scope.organizationId,
      programId,
      dto,
      actorId,
    );
  }

  @Get('programs/:programId/withdrawal-policy')
  @UseGuards(JwtAuthGuard, OrganizationRolesGuard)
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({ summary: 'Get the withdrawal policy for a program (null = permissive defaults)' })
  getPolicy(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
  ) {
    return this.withdrawalService.getPolicy(scope.organizationId, programId);
  }

  // ── Eligibility rules ──────────────────────────────────────────────────────

  @Post('programs/:programId/eligibility-rules')
  @UseGuards(JwtAuthGuard, OrganizationRolesGuard)
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Add a composable eligibility rule to a program',
  })
  @ApiResponse({ status: 409, description: 'Rule of this type already exists' })
  addRule(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
    @Body() dto: AddEligibilityRuleDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.eligibilityService.addRule(
      scope.organizationId,
      programId,
      dto,
      actorId,
    );
  }

  @Get('programs/:programId/eligibility-rules')
  @UseGuards(JwtAuthGuard, OrganizationRolesGuard)
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.MEMBER,
  )
  @ApiOperation({ summary: 'List all eligibility rules for a program' })
  listRules(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Query() scope: OrgScopedQueryDto,
  ) {
    return this.eligibilityService.listRules(scope.organizationId, programId);
  }

  @Delete('programs/:programId/eligibility-rules/:ruleId')
  @UseGuards(JwtAuthGuard, OrganizationRolesGuard)
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Remove an eligibility rule' })
  removeRule(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('ruleId', new ParseObjectIdPipe()) ruleId: string,
    @Query() scope: OrgScopedQueryDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.eligibilityService.removeRule(
      scope.organizationId,
      programId,
      ruleId,
      actorId,
    );
  }
}
