import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { FindNotificationsDto } from './dto/find-notifications.dto';
import { Deprecated } from '../common/deprecation/deprecation.decorator';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a notification (admin/moderator only)',
    description:
      'Returns the stored notification, or `null` when the recipient has ' +
      'opted out of this type and it is not mandatory.',
  })
  @ApiResponse({ status: 201, description: 'Notification created' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  create(@Body() payload: CreateNotificationDto) {
    return this.service.create(payload);
  }

  @Get()
  @ApiOperation({
    summary: 'List all notifications, newest first (admin only)',
    deprecated: true,
    description: 'Superseded by `GET /api/v2/notifications`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated notification page' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Deprecated({ successorUrl: '/api/v2/notifications' })
  findAll(@Query() paginationDto: FindNotificationsDto) {
    return this.service.findAll(paginationDto);
  }

  @Get('me')
  @ApiOperation({
    summary: 'List the caller’s own notifications, newest first',
  })
  @ApiResponse({ status: 200, description: 'Paginated notification page' })
  findMyNotifications(
    @Req() req: { user: { id: string } },
    @Query() paginationDto: FindNotificationsDto,
  ) {
    return this.service.findByUserId(req.user.id, paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one notification (admin only)' })
  @ApiNotFoundResponse({ description: 'RES_NOTIFICATION_NOT_FOUND' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a notification' })
  @ApiNotFoundResponse({ description: 'RES_NOTIFICATION_NOT_FOUND' })
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateNotificationDto,
  ) {
    return this.service.update(id, payload);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiNotFoundResponse({ description: 'RES_NOTIFICATION_NOT_FOUND' })
  markAsRead(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.markAsRead(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiNotFoundResponse({ description: 'RES_NOTIFICATION_NOT_FOUND' })
  @ApiResponse({ status: 200, description: 'Notification deleted' })
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
