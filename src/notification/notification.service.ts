import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type?: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class NotificationService {
  private readonly notifications: Notification[] = [];

  create(payload: CreateNotificationDto): Notification {
    const notification: Notification = {
      id: crypto.randomUUID(),
      userId: payload.userId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      isRead: false,
      metadata: payload.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.notifications.push(notification);
    return notification;
  }

  findAll(page = 1, limit = 10): PaginatedResult<Notification> {
    const total = this.notifications.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const data = this.notifications.slice(start, start + limit);

    return { data, total, page, limit, totalPages };
  }

  findByUserId(
    userId: string,
    page = 1,
    limit = 10,
  ): PaginatedResult<Notification> {
    const userNotifications = this.notifications.filter(
      (n) => n.userId === userId,
    );
    const total = userNotifications.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const data = userNotifications.slice(start, start + limit);

    return { data, total, page, limit, totalPages };
  }

  findOne(id: string): Notification {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  update(id: string, payload: UpdateNotificationDto): Notification {
    const notification = this.findOne(id);
    Object.assign(notification, { ...payload, updatedAt: new Date() });
    return notification;
  }

  markAsRead(id: string): Notification {
    const notification = this.findOne(id);
    notification.isRead = true;
    notification.updatedAt = new Date();
    return notification;
  }

  remove(id: string): { id: string; deleted: boolean } {
    const index = this.notifications.findIndex((n) => n.id === id);
    if (index === -1) {
      throw new NotFoundException('Notification not found');
    }
    this.notifications.splice(index, 1);
    return { id, deleted: true };
  }
}
