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
import { PaginationDto } from '../../common/dto/pagination.dto';
import { NotificationEventService } from '../services/notification-event.service';
import { PublishNotificationEventDto } from '../dto/publish-notification-event.dto';
import { LibraryEventType } from '../schemas/notification-event.schema';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Notifications')
@Controller('e-library/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationEventController {
  constructor(
    private readonly notificationEventService: NotificationEventService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Publish a library notification event' })
  publish(@Body() dto: PublishNotificationEventDto) {
    return this.notificationEventService.publish(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'List notification events with optional type filter' })
  list(
    @Query() paginationDto: PaginationDto,
    @Query('eventType') eventType?: LibraryEventType,
  ) {
    return this.notificationEventService.list(paginationDto, { eventType });
  }

  @Get('history')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Query event history with date range' })
  getHistory(
    @Query('eventType') eventType?: LibraryEventType,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationEventService.getEventHistory(
      eventType,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':eventId')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Get a notification event by its stable eventId' })
  findOne(@Param('eventId') eventId: string) {
    return this.notificationEventService.findById(eventId);
  }

  @Put(':eventId/consumers')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Mark consumer processing status for an event' })
  markConsumer(
    @Param('eventId') eventId: string,
    @Body('consumerId') consumerId: string,
    @Body('status') status: string,
  ) {
    return this.notificationEventService.markConsumerStatus(eventId, consumerId, status);
  }
}
