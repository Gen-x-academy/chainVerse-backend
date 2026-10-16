import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OfflineGrantService } from '../services/offline-grant.service';
import {
  CreateOfflineGrantDto,
  VerifyOfflineDownloadDto,
} from '../dto/offline-grant.dto';

@ApiTags('E-Library Offline Downloads')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/offline', 'v1/library/offline'])
export class OfflineGrantController {
  constructor(private readonly offlineGrantService: OfflineGrantService) {}

  @Post('grants')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({
    summary:
      'Create an offline-download grant bound to a patron, loan, rendition, device hash, and expiry',
  })
  @ApiResponse({ status: 201, description: 'Offline grant created' })
  @ApiResponse({ status: 403, description: 'Loan belongs to another patron' })
  @ApiResponse({ status: 404, description: 'Digital loan not found' })
  @ApiResponse({ status: 409, description: 'Loan not active, expired, or device limit reached' })
  createGrant(
    @CurrentUser('sub') patronId: string,
    @Body() dto: CreateOfflineGrantDto,
  ) {
    return this.offlineGrantService.createGrant(patronId, dto);
  }

  @Get('grants')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'List the caller-owned offline grants' })
  @ApiResponse({ status: 200, description: 'Grants owned by the caller, most recent first' })
  listGrants(@CurrentUser('sub') patronId: string) {
    return this.offlineGrantService.listGrants(patronId);
  }

  @Delete('grants/:grantId')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'Revoke an offline grant (devices lose download rights immediately)' })
  @ApiParam({ name: 'grantId', description: 'Offline grant ObjectId' })
  @ApiResponse({ status: 200, description: 'Grant revoked' })
  @ApiResponse({ status: 403, description: 'Grant belongs to another patron' })
  @ApiResponse({ status: 404, description: 'Grant not found' })
  @ApiResponse({ status: 409, description: 'Grant is not active' })
  revokeGrant(
    @Param('grantId') grantId: string,
    @CurrentUser('sub') patronId: string,
  ) {
    return this.offlineGrantService.revokeGrant(grantId, patronId);
  }

  @Post('verify')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({
    summary:
      'Verify an offline-download capability before serving an offline rendition',
  })
  @ApiResponse({ status: 200, description: 'Authorization granted' })
  @ApiResponse({ status: 403, description: 'Grant invalid, revoked, expired, or loan no longer active' })
  verify(
    @CurrentUser('sub') patronId: string,
    @Body() dto: VerifyOfflineDownloadDto,
  ) {
    return this.offlineGrantService.authorizeDownload(
      patronId,
      dto.grantToken,
      dto.deviceId,
    );
  }
}