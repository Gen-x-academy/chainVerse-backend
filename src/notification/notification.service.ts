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

/** Events that must always be delivered regardless of user opt-outs. */
const MANDATORY_EVENTS = new Set(['welcome', 'password_reset', 'security']);

/**
 * Minimal shape of user account-settings documents used for preference checks.
 * Both student and tutor settings share this surface.
 */
interface UserPreferences {
  emailNotifications?: boolean;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * Resolve whether a notification should be dispatched for the given user.
   *
   * - Mandatory event types (security, password_reset, welcome) are always
   *   delivered and bypass opt-out settings.
   * - For all other types the caller MAY pass the user's stored preferences;
   *   when `prefs.emailNotifications` is explicitly `false` the notification
   *   is silently skipped.
   * - When no preferences are provided the notification is created (safe
   *   default: opt-in).
   */
  private shouldSend(type: string | undefined, prefs?: UserPreferences): boolean {
    if (type && MANDATORY_EVENTS.has(type)) return true;
    if (prefs && prefs.emailNotifications === false) return false;
    return true;
  }

  /**
   * Create a notification after enforcing the recipient's channel preferences.
   *
   * Pass the user's `prefs` from their account-settings document so that
   * opt-outs are respected before any record is persisted.
   */
  async create(
    payload: CreateNotificationDto,
    prefs?: UserPreferences,
  ): Promise<Notification | null> {
    if (!this.shouldSend(payload.type, prefs)) {
      return null;
    }
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