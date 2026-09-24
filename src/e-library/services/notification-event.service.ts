import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException, ResourceConflictException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import {
  NotificationEvent,
  NotificationEventDocument,
  LibraryEventType,
} from '../schemas/notification-event.schema';
import { PublishNotificationEventDto } from '../dto/publish-notification-event.dto';

@Injectable()
export class NotificationEventService {
  private readonly logger = new Logger(NotificationEventService.name);

  constructor(
    @InjectModel(NotificationEvent.name)
    private readonly eventModel: Model<NotificationEventDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async publish(dto: PublishNotificationEventDto): Promise<NotificationEventDocument> {
    const existing = await this.eventModel.findOne({ eventId: dto.eventId }).exec();
    if (existing) {
      throw new ResourceConflictException(
        'Event with this ID already exists',
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    return this.eventModel.create({
      eventType: dto.eventType,
      eventId: dto.eventId,
      schemaVersion: dto.schemaVersion ?? 1,
      payload: dto.payload ?? {},
      publishedAt: new Date(),
    });
  }

  async findById(eventId: string): Promise<NotificationEventDocument> {
    const event = await this.eventModel.findOne({ eventId });
    if (!event) {
      throw new ResourceNotFoundException(
        'Notification event not found',
        ErrorCode.RES_NOTIFICATION_EVENT_NOT_FOUND,
      );
    }
    return event;
  }

  async list(paginationDto: PaginationDto, filters?: { eventType?: LibraryEventType }) {
    const query: Record<string, unknown> = {};
    if (filters?.eventType) query.eventType = filters.eventType;
    return this.paginationService.paginate(this.eventModel, paginationDto, query);
  }

  async markConsumerStatus(
    eventId: string,
    consumerId: string,
    status: string,
  ): Promise<NotificationEventDocument> {
    const event = await this.findById(eventId);

    const existingIndex = event.consumerStatuses.findIndex(
      (c) => c.consumerId === consumerId,
    );

    if (existingIndex >= 0) {
      event.consumerStatuses[existingIndex].status = status;
      event.consumerStatuses[existingIndex].processedAt = new Date();
    } else {
      event.consumerStatuses.push({
        consumerId,
        status,
        processedAt: new Date(),
      } as any);
    }

    return event.save();
  }

  async getEventHistory(
    eventType?: LibraryEventType,
    from?: Date,
    to?: Date,
    limit = 50,
  ): Promise<NotificationEventDocument[]> {
    const filter: Record<string, unknown> = {};
    if (eventType) filter.eventType = eventType;
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = from;
      if (to) dateFilter.$lte = to;
      filter.publishedAt = dateFilter;
    }

    return this.eventModel
      .find(filter)
      .sort({ publishedAt: -1 })
      .limit(limit)
      .exec();
  }
}
