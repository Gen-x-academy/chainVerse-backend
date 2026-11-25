import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateSafetyReportDto, UpdateSafetyCaseDto, UpdateSafetySettingsDto } from './dto/safety.dto';
import { MentorshipSafetyCenterService } from './safety-center.service';
import { SafetyCaseStatus } from './schemas/safety.schema';

@ApiTags('Mentorship Safety Center')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/safety')
export class MentorshipSafetyCenterController {
  constructor(private readonly safety: MentorshipSafetyCenterService) {}

  @Get('guidance')
  @ApiOperation({ summary: 'Conduct rules and emergency guidance' })
  guidance() {
    return this.safety.guidance();
  }

  @Get('settings')
  @ApiOperation({ summary: 'My privacy choices and trusted contacts' })
  getSettings(@CurrentUser('sub') userId: string) {
    return this.safety.getSettings(userId);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update my privacy choices and trusted contacts (own settings only)' })
  updateSettings(@CurrentUser('sub') userId: string, @Body() dto: UpdateSafetySettingsDto) {
    return this.safety.updateSettings(userId, dto);
  }

  @Post('reports')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Report a user (idempotent per idempotencyKey)',
    description: 'Pass alsoBlock=true to block the reported user in the same call.',
  })
  @ApiQuery({ name: 'alsoBlock', required: false, type: Boolean })
  @ApiResponse({ status: 409, description: 'CANNOT_REPORT_SELF' })
  report(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSafetyReportDto,
    @Query('alsoBlock') alsoBlock?: string,
  ) {
    return this.safety.report(userId, dto, alsoBlock === 'true');
  }

  @Get('reports')
  @ApiOperation({ summary: 'My reports and their status' })
  myReports(@CurrentUser('sub') userId: string) {
    return this.safety.myReports(userId);
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'One of my reports (404 for anyone else’s)' })
  getMyReport(@CurrentUser('sub') userId: string, @Param('id', new ParseObjectIdPipe()) id: string) {
    return this.safety.getMyReport(userId, id);
  }

  @Get('cases')
  @ApiOperation({ summary: 'Safety staff: list cases' })
  @ApiQuery({ name: 'status', required: false, enum: SafetyCaseStatus })
  @ApiResponse({ status: 403, description: 'MENTOR_ACCESS_DENIED' })
  listCases(
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
    @Query('status') status?: SafetyCaseStatus,
  ) {
    return this.safety.listCases({ userId, roles: roles ?? [] }, status);
  }

  @Patch('cases/:id')
  @ApiOperation({ summary: 'Safety staff: move a case along (open → under_review → resolved/dismissed)' })
  updateCase(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: UpdateSafetyCaseDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.safety.updateCase(id, dto, { userId, roles: roles ?? [] });
  }
}
