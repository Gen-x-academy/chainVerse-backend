import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PointsService } from './points.service';
import { CreatePointsDto } from './dto/create-points.dto';
import { UpdatePointsDto } from './dto/update-points.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Points')
@ApiBearerAuth('access-token')
@Controller('points')
@UseGuards(JwtAuthGuard)
export class PointsController {
  constructor(private readonly service: PointsService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve all points records' })
  @ApiResponse({ status: 200, description: 'List returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @ApiOperation({ summary: "Retrieve the authenticated user's points" })
  @ApiResponse({ status: 200, description: 'Points retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMyPoints(@Req() req: { user: { id: string } }) {
    return this.service.getUserPoints(req.user.id);
  }

  @Get('balance/me')
  @ApiOperation({ summary: "Retrieve the authenticated user's point balance" })
  @ApiResponse({ status: 200, description: 'Balance retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMyBalance(@Req() req: { user: { id: string } }) {
    return this.service.getUserBalance(req.user.id);
  }

  @Get('ledger/me')
  @ApiOperation({ summary: "Retrieve the authenticated user's points ledger" })
  @ApiResponse({ status: 200, description: 'Ledger retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMyLedger(@Req() req: { user: { id: string } }) {
    return this.service.getUserLedgerEntries(req.user.id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Retrieve a specific user\'s points' })
  @ApiResponse({ status: 200, description: 'Points retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not found' })
  getUserPoints(@Param('userId', new ParseObjectIdPipe()) userId: string) {
    return this.service.getUserPoints(userId);
  }

  @Get('user/:userId/balance')
  @ApiOperation({ summary: 'Retrieve a specific user\'s point balance' })
  @ApiResponse({ status: 200, description: 'Balance retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not found' })
  getUserBalance(@Param('userId', new ParseObjectIdPipe()) userId: string) {
    return this.service.getUserBalance(userId);
  }

  @Get('user/:userId/ledger')
  @ApiOperation({ summary: 'Retrieve a specific user\'s points ledger' })
  @ApiResponse({ status: 200, description: 'Ledger retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not found' })
  getUserLedger(@Param('userId', new ParseObjectIdPipe()) userId: string) {
    return this.service.getUserLedgerEntries(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a specific points record' })
  @ApiResponse({ status: 200, description: 'Record found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Award points to a user' })
  @ApiResponse({ status: 201, description: 'Points awarded successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  awardPoints(@Body() payload: CreatePointsDto) {
    return this.service.awardPoints(payload);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a points record' })
  @ApiResponse({ status: 200, description: 'Updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdatePointsDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a points record' })
  @ApiResponse({ status: 200, description: 'Deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
