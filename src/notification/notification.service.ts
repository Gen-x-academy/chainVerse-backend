import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { PaginationService } from '../common/pagination/pagination.service';
import { FindNotificationsDto } from './dto/find-notifications.dto';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async create(payload: CreateNotificationDto): Promise<Notification> {
    const notification = new this.notificationModel(payload);
    return notification.save();
  }

  async findAll(paginationDto: FindNotificationsDto) {
    return this.paginationService.paginate(
      this.notificationModel,
      paginationDto,
    );
  }

  async findByUserId(userId: string, paginationDto: FindNotificationsDto) {
    return this.paginationService.paginate(
      this.notificationModel,
      paginationDto,
      { userId },
    );
  }

  async findOne(id: string): Promise<NotificationDocument> {
    const notification = await this.notificationModel.findById(id).exec();
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  async update(
    id: string,
    payload: UpdateNotificationDto,
  ): Promise<Notification> {
    const notification = await this.notificationModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  async markAsRead(id: string): Promise<Notification> {
    const notification = await this.notificationModel
      .findByIdAndUpdate(id, { isRead: true }, { new: true })
      .exec();
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.notificationModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Notification not found');
    }
    return { id, deleted: true };
  }
}
