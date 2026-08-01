import { ApiBearerAuth } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReportAbuseService } from './report-abuse.service';
import { CreateReportAbuseDto } from './dto/create-report-abuse.dto';
import { UpdateReportAbuseDto } from './dto/update-report-abuse.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditActor } from '../common/audit/audit-context';
import type { AuditContext } from '../common/audit/audit-context';
import { FindReportsDto } from './dto/find-reports.dto';

@ApiBearerAuth('access-token')
@Controller('report-abuse')
@UseGuards(JwtAuthGuard)
export class ReportAbuseController {
  constructor(private readonly service: ReportAbuseService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT, Role.TUTOR, Role.MODERATOR)
  create(
    @Req() req: { user: { id: string } },
    @Body() payload: CreateReportAbuseDto,
  ) {
    return this.service.create(req.user.id, payload);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  findAll(@Query() paginationDto: FindReportsDto) {
    return this.service.findAll(paginationDto);
  }

  @Get('me')
  findMyReports(
    @Req() req: { user: { id: string } },
    @Query() paginationDto: FindReportsDto,
  ) {
    return this.service.findByReporter(req.user.id, paginationDto);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateReportAbuseDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.update(id, payload, audit);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.remove(id, audit);
  }
}
