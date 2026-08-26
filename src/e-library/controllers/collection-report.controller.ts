import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CollectionReportService } from '../services/collection-report.service';
import { CollectionReportQueryDto } from '../dto/collection-report-query.dto';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Analytics')
@Controller('e-library/analytics/collection')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionReportController {
  constructor(
    private readonly collectionReportService: CollectionReportService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({
    summary:
      'Get collection development reports: high-demand, low-availability, unused, aging, and lost/damaged materials',
  })
  getReport(@Query() query: CollectionReportQueryDto) {
    return this.collectionReportService.getCollectionReport(query);
  }

  @Get('demand')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({
    summary: 'Identify high-demand books by loan and hold frequency',
  })
  getDemandReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const now = new Date();
    return this.collectionReportService.getHighDemandBooks(
      from ? new Date(from) : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      to ? new Date(to) : now,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('low-availability')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({
    summary: 'Identify books with high utilization and low available copies',
  })
  getLowAvailabilityReport(@Query('limit') limit?: string) {
    return this.collectionReportService.getLowAvailabilityBooks(
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('unused')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({
    summary: 'Identify books with no recent loans in the specified window',
  })
  getUnusedReport(
    @Query('from') from?: string,
    @Query('limit') limit?: string,
  ) {
    const now = new Date();
    return this.collectionReportService.getUnusedBooks(
      from ? new Date(from) : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('aging')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({
    summary: 'Identify aging materials with condition breakdown',
  })
  getAgingReport(@Query('limit') limit?: string) {
    return this.collectionReportService.getAgingBooks(
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('lost-damaged')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({
    summary: 'Identify frequently lost, damaged, or flagged materials',
  })
  getLostDamagedReport(@Query('limit') limit?: string) {
    return this.collectionReportService.getLostAndDamagedBooks(
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
