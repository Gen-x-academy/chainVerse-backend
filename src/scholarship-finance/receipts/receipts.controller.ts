import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import * as Joi from 'joi';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-user';
import { JoiValidationPipe } from '../common/joi-validation.pipe';
import { TenantAccessService } from '../common/tenant-access.service';
import { presentReceipt, ReceiptsService } from './receipts.service';

class ListOrganizationReceiptsQuery {
  @ApiPropertyOptional() programId?: string;
  @ApiPropertyOptional() recipientId?: string;
  @ApiPropertyOptional({ default: 50 }) limit?: number;
}

const listOrganizationReceiptsSchema =
  Joi.object<ListOrganizationReceiptsQuery>({
    programId: Joi.string().hex().length(24),
    recipientId: Joi.string().max(128),
    limit: Joi.number().integer().min(1).max(200).default(50),
  });

@ApiTags('Scholarship Finance — Receipts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('scholarship-finance/receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get('me')
  @ApiOperation({ summary: 'List the caller’s own payment receipts' })
  listMine(@Req() req: AuthenticatedRequest) {
    return this.receipts.listMine(req.user);
  }

  @Get(':receiptId')
  @ApiOperation({
    summary: 'Get a receipt (recipient or organization finance staff)',
  })
  async get(
    @Param('receiptId') receiptId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return presentReceipt(
      await this.receipts.getAuthorized(req.user, receiptId),
    );
  }

  @Post(':receiptId/verifications')
  @ApiOperation({
    summary: 'Re-verify the receipt’s transaction against Stellar Horizon',
  })
  verify(
    @Param('receiptId') receiptId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.receipts.verify(req.user, receiptId);
  }
}

@ApiTags('Scholarship Finance — Receipts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/scholarship-receipts')
export class OrganizationReceiptsController {
  constructor(
    private readonly receipts: ReceiptsService,
    private readonly tenant: TenantAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List payment receipts issued by an organization' })
  async list(
    @Param('organizationId') organizationId: string,
    @Query(new JoiValidationPipe(listOrganizationReceiptsSchema))
    q: ListOrganizationReceiptsQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    return this.receipts.listForOrganization(organizationId, q);
  }
}
