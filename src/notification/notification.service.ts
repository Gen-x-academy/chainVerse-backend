import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async create(payload: CreateNotificationDto): Promise<Notification> {
    const notification = new this.notificationModel(payload);
    return notification.save();
  }

  async findAll(page = 1, limit = 10): Promise<PaginatedResult<Notification>> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.notificationModel.find().skip(skip).limit(limit).exec(),
      this.notificationModel.countDocuments().exec(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByUserId(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<Notification>> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.notificationModel.find({ userId }).skip(skip).limit(limit).exec(),
      this.notificationModel.countDocuments({ userId }).exec(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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
