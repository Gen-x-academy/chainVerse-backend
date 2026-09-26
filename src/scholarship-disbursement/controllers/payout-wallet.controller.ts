import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditActor } from '../../common/audit/audit-context';
import type { AuditContext } from '../../common/audit/audit-context';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  OrgRoles,
  OrgScope,
} from '../../common/decorators/org-roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationRolesGuard } from '../../common/guards/organization-roles.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreateWalletChallengeDto,
  VerifyWalletChallengeDto,
} from '../dto/payout-wallet.dto';
import { PayoutWalletService } from '../services/payout-wallet.service';
import { PayoutWalletDocument } from '../schemas/payout-wallet.schema';
import { ALL_MEMBERS, STAFF } from './roles';

function toWalletView(w: PayoutWalletDocument) {
  return {
    id: w.id,
    recipientId: w.recipientId,
    address: w.address,
    status: w.status,
    verifiedAt: w.verifiedAt,
    supersededAt: w.supersededAt,
  };
}

@ApiBearerAuth('access-token')
@ApiTags('Scholarship Disbursements')
@Controller('organizations/:organizationId/scholarships')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@OrgScope({ source: 'param', key: 'organizationId' })
export class PayoutWalletController {
  constructor(private readonly wallets: PayoutWalletService) {}

  @Post('payout-wallet/challenges')
  @OrgRoles(...ALL_MEMBERS)
  @ApiOperation({
    summary:
      'Request a single-use challenge to prove control of a payout address',
  })
  challenge(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateWalletChallengeDto,
  ) {
    return this.wallets.issueChallenge(organizationId, userId, dto.address);
  }

  @Post('payout-wallet/challenges/:challengeId/verify')
  @OrgRoles(...ALL_MEMBERS)
  @ApiOperation({
    summary:
      'Submit the SEP-53 signature; changing an existing address puts scheduled payments on hold',
  })
  async verify(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Param('challengeId', new ParseObjectIdPipe()) challengeId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: VerifyWalletChallengeDto,
    @AuditActor() audit: AuditContext,
  ) {
    const result = await this.wallets.verifyChallenge(
      organizationId,
      userId,
      challengeId,
      dto.signature,
      audit,
    );
    return {
      wallet: toWalletView(result.wallet),
      changed: result.changed,
      heldPayments: result.heldPayments,
    };
  }

  @Get('payout-wallet')
  @OrgRoles(...ALL_MEMBERS)
  @ApiOperation({ summary: "The caller's verified payout wallet" })
  async mine(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return toWalletView(
      await this.wallets.requireVerified(organizationId, userId),
    );
  }

  @Get('payout-wallets/:recipientId')
  @OrgRoles(...STAFF)
  @ApiOperation({ summary: "A recipient's payout address history (staff)" })
  async history(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Param('recipientId', new ParseObjectIdPipe()) recipientId: string,
  ) {
    const wallets = await this.wallets.history(organizationId, recipientId);
    return wallets.map(toWalletView);
  }
}
