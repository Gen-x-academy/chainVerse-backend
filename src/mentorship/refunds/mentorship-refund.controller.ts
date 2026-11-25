import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CalculateRefundDto,
  DecideRefundExceptionDto,
  RequestRefundExceptionDto,
} from './dto/refund.dto';
import { MentorshipRefundService } from './mentorship-refund.service';

@ApiTags('Mentorship Refunds')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/refunds')
export class MentorshipRefundController {
  constructor(private readonly refunds: MentorshipRefundService) {}

  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calculate a cancellation refund from the snapshotted policy (idempotent, staff only)',
    description:
      'Boundaries are "N hours before start" measured between UTC instants, so they are time-zone and DST safe. Retrying with the same idempotencyKey returns the stored result; the same key with different inputs is a 409.',
  })
  @ApiResponse({ status: 200, description: 'Stored refund calculation' })
  @ApiResponse({ status: 400, description: 'Invalid payload or policy' })
  @ApiResponse({ status: 403, description: 'MENTOR_ACCESS_DENIED' })
  @ApiResponse({ status: 409, description: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT' })
  calculate(
    @Body() dto: CalculateRefundDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.refunds.calculate(dto, { userId, roles: roles ?? [] });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a refund calculation (staff only)' })
  get(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.refunds.get(id, { userId, roles: roles ?? [] });
  }

  @Post(':id/exceptions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a manual refund exception (needs a second approver)' })
  @ApiResponse({ status: 409, description: 'REFUND_NOT_IN_CALCULATED_STATE' })
  requestException(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: RequestRefundExceptionDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.refunds.requestException(id, dto, { userId, roles: roles ?? [] });
  }

  @Post(':id/exceptions/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a pending exception (not the requester)' })
  @ApiResponse({ status: 403, description: 'REFUND_EXCEPTION_NEEDS_SECOND_APPROVER' })
  decide(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: DecideRefundExceptionDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.refunds.decideException(id, dto, { userId, roles: roles ?? [] });
  }

  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pay the refund (idempotent)',
    description: 'The transfer id is derived from the calculation id; retries cannot pay twice.',
  })
  transfer(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.refunds.executeTransfer(id, { userId, roles: roles ?? [] });
  }
}
