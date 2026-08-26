import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StocktakeService } from '../services/stocktake.service';
import { CreateStocktakeSessionDto, RecordScanDto, ReconcileStocktakeDto } from '../dto/stocktake.dto';

@ApiTags('E-Library Inventory')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/stocktake', 'v1/library/stocktake'])
export class StocktakeController {
  constructor(private readonly stocktakeService: StocktakeService) {}

  @Post('sessions')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Start a new stocktake session' })
  @ApiResponse({ status: 201, description: 'Session created' })
  @ApiResponse({ status: 409, description: 'A session is already in progress for this branch' })
  createSession(
    @CurrentUser('sub') startedBy: string,
    @Body() dto: CreateStocktakeSessionDto,
  ) {
    return this.stocktakeService.createSession(dto, startedBy);
  }

  @Get('sessions')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'List stocktake sessions' })
  listSessions() {
    return this.stocktakeService.listSessions();
  }

  @Get('sessions/:sessionId')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get stocktake session details' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  getSession(@Param('sessionId') sessionId: string) {
    return this.stocktakeService.getSession(sessionId);
  }

  @Post('sessions/:sessionId/scan')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Record a barcode scan during stocktake' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 201, description: 'Scan recorded' })
  recordScan(
    @Param('sessionId') sessionId: string,
    @CurrentUser('sub') scannedBy: string,
    @Body() dto: RecordScanDto,
  ) {
    return this.stocktakeService.recordScan(sessionId, dto, scannedBy);
  }

  @Post('sessions/:sessionId/reconcile')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reconcile stocktake session (admin only, requires permission)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Reconciliation complete' })
  reconcile(
    @Param('sessionId') sessionId: string,
    @CurrentUser('sub') reconciledBy: string,
    @Body() dto: ReconcileStocktakeDto,
  ) {
    return this.stocktakeService.reconcile(sessionId, dto, reconciledBy);
  }
}
