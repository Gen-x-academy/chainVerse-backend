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
import { RemovalRequestService } from './removal-request.service';
import { CreateRemovalRequestDto } from './dto/create-removal-request.dto';
import { UpdateRemovalRequestDto } from './dto/update-removal-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Removal Requests')
@ApiBearerAuth('access-token')
@Controller('removal-requests')
@UseGuards(JwtAuthGuard)
export class RemovalRequestController {
  constructor(private readonly service: RemovalRequestService) {}

  @Post()
  @ApiOperation({ summary: 'Create a removal request' })
  @ApiResponse({ status: 201, description: 'Created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  create(
    @Req() req: { user: { id: string } },
    @Body() payload: CreateRemovalRequestDto,
  ) {
    return this.service.create(req.user.id, payload);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all removal requests' })
  @ApiResponse({ status: 200, description: 'List returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @ApiOperation({ summary: "Retrieve the authenticated user's removal requests" })
  @ApiResponse({ status: 200, description: 'List returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findMyRequests(@Req() req: { user: { id: string } }) {
    return this.service.findByUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a specific removal request' })
  @ApiResponse({ status: 200, description: 'Record found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/moderate')
  @ApiOperation({ summary: 'Moderate a removal request (approve/reject)' })
  @ApiResponse({ status: 200, description: 'Moderated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  moderate(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateRemovalRequestDto,
  ) {
    return this.service.moderate(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a removal request' })
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
