import { ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Query, UseGuards, Version } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { FindNotificationsDto } from './dto/find-notifications.dto';

@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationControllerV2 {
  constructor(private readonly service: NotificationService) {}

  @Get()
  @Version('2')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findAll(@Query() paginationDto: FindNotificationsDto) {
    return this.service.findAll(paginationDto);
  }
}
