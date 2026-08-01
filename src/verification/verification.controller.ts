import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { VerificationService } from './verification.service';
import type {
  VerificationResult,
  VerificationStats,
  VerificationLog,
} from './interfaces/verification.interface';
import { VerificationStatus } from './interfaces/verification.interface';

// ─── inline DTOs ────────────────────────────────────────────────────────────

class VerifyTicketDto {
  @IsString()
  ticketCode: string;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsString()
  verifierId?: string;

  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;
}

// ─── Controller ─────────────────────────────────────────────────────────────

@ApiTags('Verification')
@Controller(['verification', 'v1/verification'])
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a ticket verification attempt' })
  @ApiResponse({ status: 200, description: 'Verification attempt recorded' })
  async verify(@Body() dto: VerifyTicketDto): Promise<VerificationResult> {
    const status = dto.status ?? VerificationStatus.VALID;
    return this.verificationService.logVerification({
      ticketCode: dto.ticketCode,
      eventId: dto.eventId,
      verifierId: dto.verifierId,
      status,
      message: this.verificationService.getStatusMessage(status),
    });
  }

  @Get('stats/:eventId')
  @ApiOperation({ summary: 'Get verification statistics for an event' })
  @ApiParam({ name: 'eventId', type: String, description: 'Event identifier' })
  @ApiResponse({ status: 200, description: 'Verification statistics returned' })
  async getStats(
    @Param('eventId') eventId: string,
  ): Promise<VerificationStats> {
    return this.verificationService.getStatsForEvent(eventId);
  }

  @Get('logs/event/:eventId')
  @ApiOperation({ summary: 'Get all verification logs for an event' })
  @ApiParam({ name: 'eventId', type: String, description: 'Event identifier' })
  @ApiResponse({ status: 200, description: 'Verification logs returned' })
  async getLogsForEvent(
    @Param('eventId') eventId: string,
  ): Promise<VerificationLog[]> {
    return this.verificationService.getLogsForEvent(eventId);
  }

  @Get('logs/ticket/:ticketCode')
  @ApiOperation({ summary: 'Get all verification logs for a ticket' })
  @ApiParam({
    name: 'ticketCode',
    type: String,
    description: 'Ticket code / QR value',
  })
  @ApiResponse({ status: 200, description: 'Verification logs returned' })
  async getLogsForTicket(
    @Param('ticketCode') ticketCode: string,
  ): Promise<VerificationLog[]> {
    return this.verificationService.getLogsForTicket(ticketCode);
  }
}
