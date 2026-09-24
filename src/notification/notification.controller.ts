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
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { FindNotificationsDto } from './dto/find-notifications.dto';
import { Deprecated } from '../common/deprecation/deprecation.decorator';

@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  create(@Body() payload: CreateNotificationDto) {
    return this.service.create(payload);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Deprecated({ successorUrl: '/api/v2/notifications' })
  findAll(@Query() paginationDto: FindNotificationsDto) {
    return this.service.findAll(paginationDto);
  }

  @Get('me')
  findMyNotifications(
    @Req() req: { user: { id: string } },
    @Query() paginationDto: FindNotificationsDto,
  ) {
    return this.service.findByUserId(req.user.id, paginationDto);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateNotificationDto,
  ) {
    return this.service.update(id, payload);
  }

  @Patch(':id/read')
  markAsRead(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.markAsRead(id);
  }

  @Delete(':id')
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
