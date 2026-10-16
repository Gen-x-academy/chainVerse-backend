import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ContentReportService } from '../services/content-report.service';
import { CreateContentReportDto } from '../dto/create-content-report.dto';
import { ReportStatus } from '../schemas/content-report.schema';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Content Reports')
@Controller('e-library/content-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContentReportController {
  constructor(private readonly contentReportService: ContentReportService) {}

  @Post()
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Submit a content report' })
  create(
    @CurrentUser('sub') reporterId: string,
    @Body() dto: CreateContentReportDto,
  ) {
    return this.contentReportService.create(dto, reporterId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'List content reports (staff only)' })
  list(
    @Query() paginationDto: PaginationDto,
    @Query('status') status?: ReportStatus,
    @Query('targetType') targetType?: string,
  ) {
    return this.contentReportService.list(paginationDto, { status, targetType });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Get a content report by ID (staff only)' })
  findOne(@Param('id') id: string) {
    return this.contentReportService.findById(id);
  }

  @Put(':id/assign')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Assign a content report to a staff member' })
  assign(
    @Param('id') id: string,
    @CurrentUser('sub') staffId: string,
  ) {
    return this.contentReportService.assign(id, staffId);
  }

  @Put(':id/resolve')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Resolve or dismiss a content report' })
  resolve(
    @Param('id') id: string,
    @Body('resolutionNotes') resolutionNotes: string,
    @Body('status') status: ReportStatus.RESOLVED | ReportStatus.DISMISSED,
  ) {
    return this.contentReportService.resolve(id, resolutionNotes, status);
  }
}
