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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../../common/guards/organization-roles.guard';
import { OrgRoles, OrgScope } from '../../common/decorators/org-roles.decorator';
import { OrganizationRole } from '../../common/enums/organization-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { EligibilityAttestationService } from '../services/eligibility-attestation.service';
import { IssueAttestationDto, RevokeAttestationDto } from '../dto/attestation.dto';
import { AttestationScope } from '../schemas/eligibility-attestation.schema';
import { OrgScopedQueryDto } from '../dto/scholarship-program.dto';

@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Eligibility Attestations')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/attestations')
export class EligibilityAttestationController {
  constructor(private readonly attestationService: EligibilityAttestationService) {}

  @Post()
  @OrgScope({ source: 'body', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary:
      'Issue a new eligibility attestation claim (issuer, scope, expiry, version, privacy-minimized payload)',
  })
  @ApiResponse({ status: 201, description: 'Attestation issued' })
  @ApiResponse({ status: 400, description: 'expiresAt is not in the future' })
  issue(
    @Body() dto: IssueAttestationDto,
    @CurrentUser('sub') issuerId: string,
  ) {
    return this.attestationService.issueAttestation(dto, issuerId);
  }

  @Delete(':attestationId')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({
    summary: 'Revoke an attestation immediately — claim becomes invalid at once',
  })
  @ApiResponse({ status: 200, description: 'Attestation revoked' })
  @ApiResponse({ status: 409, description: 'Already revoked' })
  revoke(
    @Param('attestationId', new ParseObjectIdPipe()) attestationId: string,
    @Body() dto: RevokeAttestationDto,
    @CurrentUser('sub') revokerId: string,
  ) {
    return this.attestationService.revokeAttestation(attestationId, revokerId, dto);
  }

  @Post(':attestationId/validate')
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Validate a specific attestation — throws 409 if revoked or expired',
  })
  validate(
    @Param('attestationId', new ParseObjectIdPipe()) attestationId: string,
  ) {
    return this.attestationService.validateAttestation(attestationId);
  }
}

@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Eligibility Attestations')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@Controller('scholarships/programs/:programId/applicants/:applicantId/attestations')
export class ApplicantAttestationController {
  constructor(private readonly attestationService: EligibilityAttestationService) {}

  @Get()
  @OrgScope({ source: 'query', key: 'organizationId' })
  @OrgRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.INSTRUCTOR,
  )
  @ApiOperation({
    summary: 'Get all active, non-expired attestations for an applicant in a program',
  })
  getActive(
    @Param('programId', new ParseObjectIdPipe()) programId: string,
    @Param('applicantId') applicantId: string,
  ) {
    return this.attestationService.getActiveAttestations(programId, applicantId);
  }
}
