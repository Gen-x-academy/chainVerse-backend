import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { MentorshipUser } from '../shared/mentorship-context';
import {
  AcceptGuardianConsentDto,
  EvaluateAgePolicyDto,
  InviteGuardianDto,
  ReConsentGuardianDto,
  RevokeGuardianConsentDto,
} from './dto/guardian-consent.dto';
import { GuardianConsentService } from './guardian-consent.service';

@ApiTags('Mentorship Guardian Consent')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/guardian-consent')
export class GuardianConsentController {
  constructor(private readonly service: GuardianConsentService) {}

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate whether a minor needs guardian consent' })
  @ApiOkResponse({ description: 'Age-policy decision with policy version.' })
  evaluate(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Body() dto: EvaluateAgePolicyDto,
  ) {
    return this.service.evaluate(this.user(raw), dto);
  }

  @Post('invites')
  @ApiOperation({ summary: 'Invite a guardian (minor or coordinator only)' })
  @ApiCreatedResponse({
    description:
      'Append-only invite record plus the one-time invite token, which is never stored in plain text.',
  })
  invite(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Body() dto: InviteGuardianDto,
  ) {
    return this.service.invite(this.user(raw), dto);
  }

  @Post('accept')
  @ApiOperation({ summary: 'Accept an invite as the verified guardian' })
  @ApiCreatedResponse({ description: 'New granted consent record (privacy-safe).' })
  accept(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Body() dto: AcceptGuardianConsentDto,
  ) {
    return this.service.accept(this.user(raw), dto);
  }

  @Post('revoke')
  @ApiOperation({ summary: 'Revoke an active guardian consent' })
  @ApiCreatedResponse({ description: 'New revoked consent record (privacy-safe).' })
  revoke(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Body() dto: RevokeGuardianConsentDto,
  ) {
    return this.service.revoke(this.user(raw), dto);
  }

  @Post('re-consent')
  @ApiOperation({ summary: 'Re-consent after a material change to scope or terms' })
  @ApiCreatedResponse({
    description: 'Fresh invite bound to the new material-change hash.',
  })
  reConsent(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Body() dto: ReConsentGuardianDto,
  ) {
    return this.service.reConsent(this.user(raw), dto);
  }

  @Get('engagements/:engagementId/snapshot')
  @ApiOperation({
    summary: 'Privacy-safe current consent snapshot for an engagement',
  })
  @ApiOkResponse({
    description:
      'Snapshot without guardian contact, invite token or free-text reason. Coordinators additionally see the verification reference.',
  })
  snapshot(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Param('engagementId', new ParseObjectIdPipe()) engagementId: string,
    @Query('minorId') minorId?: string,
  ) {
    return this.service.snapshot(this.user(raw), engagementId, minorId);
  }

  @Get('engagements/:engagementId/history')
  @ApiOperation({ summary: 'Append-only consent history for an engagement' })
  @ApiOkResponse({ description: 'Records ordered by ascending sequence.' })
  history(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Param('engagementId', new ParseObjectIdPipe()) engagementId: string,
    @Query('minorId') minorId?: string,
  ) {
    return this.service.history(this.user(raw), engagementId, minorId);
  }

  private user(raw: Record<string, unknown> | undefined): MentorshipUser {
    if (!raw) throw new UnauthorizedException();
    return {
      id: String(raw['sub'] ?? raw['id'] ?? ''),
      email: String(raw['email'] ?? ''),
      role: String(raw['role'] ?? ''),
    };
  }
}
