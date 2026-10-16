import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditActor } from '../../common/audit/audit-context';
import type { AuditContext } from '../../common/audit/audit-context';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgMembership } from '../../common/decorators/org-membership.decorator';
import {
  OrgRoles,
  OrgScope,
} from '../../common/decorators/org-roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  OrganizationRolesGuard,
  ResolvedOrgMembership,
} from '../../common/guards/organization-roles.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  ListPaymentsQueryDto,
  PaymentActionReasonDto,
  RecordReversalDto,
  SchedulePaymentDto,
} from '../dto/scholarship-payment.dto';
import { ScholarshipPaymentService } from '../services/scholarship-payment.service';
import { ALL_MEMBERS, isStaff, STAFF } from './roles';

@ApiBearerAuth('access-token')
@ApiTags('Scholarship Disbursements')
@Controller('organizations/:organizationId/scholarships/payments')
@UseGuards(JwtAuthGuard, OrganizationRolesGuard)
@OrgScope({ source: 'param', key: 'organizationId' })
export class ScholarshipPaymentController {
  constructor(private readonly payments: ScholarshipPaymentService) {}

  @Post()
  @OrgRoles(...STAFF)
  @ApiOperation({ summary: 'Schedule a scholarship installment' })
  schedule(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Body() dto: SchedulePaymentDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.payments.schedule(organizationId, dto, audit);
  }

  @Get()
  @OrgRoles(...STAFF)
  @ApiOperation({ summary: 'List payments in the organization (staff)' })
  list(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Query() query: ListPaymentsQueryDto,
  ) {
    return this.payments.list(organizationId, query);
  }

  @Get('me')
  @OrgRoles(...ALL_MEMBERS)
  @ApiOperation({ summary: "The caller's own scholarship payments" })
  mine(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Query() query: ListPaymentsQueryDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.payments.list(organizationId, query, userId);
  }

  @Get(':paymentId')
  @OrgRoles(...ALL_MEMBERS)
  @ApiOperation({ summary: 'Get a payment (staff, or the recipient)' })
  get(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Param('paymentId', new ParseObjectIdPipe()) paymentId: string,
    @CurrentUser('sub') userId: string,
    @OrgMembership() membership: ResolvedOrgMembership | undefined,
  ) {
    return this.payments.getVisible(
      organizationId,
      paymentId,
      userId,
      isStaff(membership?.role),
    );
  }

  @Post(':paymentId/cancel')
  @OrgRoles(...STAFF)
  @ApiOperation({ summary: 'Cancel a scheduled or held payment' })
  cancel(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Param('paymentId', new ParseObjectIdPipe()) paymentId: string,
    @Body() dto: PaymentActionReasonDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.payments.cancel(organizationId, paymentId, dto.reason, audit);
  }

  @Post(':paymentId/release-hold')
  @OrgRoles(...STAFF)
  @ApiOperation({
    summary: 'Release a payment held by a payout wallet change',
  })
  releaseHold(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Param('paymentId', new ParseObjectIdPipe()) paymentId: string,
    @Body() dto: PaymentActionReasonDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.payments.releaseHold(
      organizationId,
      paymentId,
      dto.reason,
      audit,
    );
  }

  @Post(':paymentId/retry')
  @OrgRoles(...STAFF)
  @ApiOperation({
    summary:
      'Re-queue a failed or expired payment once its last attempt is dead',
  })
  retry(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Param('paymentId', new ParseObjectIdPipe()) paymentId: string,
    @Body() dto: PaymentActionReasonDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.payments.retry(organizationId, paymentId, dto.reason, audit);
  }

  @Post(':paymentId/reversal')
  @OrgRoles(...STAFF)
  @ApiOperation({
    summary:
      'Record a reversal, verified against a confirmed clawback or return transaction',
  })
  reversal(
    @Param('organizationId', new ParseObjectIdPipe()) organizationId: string,
    @Param('paymentId', new ParseObjectIdPipe()) paymentId: string,
    @Body() dto: RecordReversalDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.payments.recordReversal(organizationId, paymentId, dto, audit);
  }
}
