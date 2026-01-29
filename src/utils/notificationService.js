const Notification = require("../models/Notification");
const { emitToUser } = require("../config/websocket");
const { addEmailJob } = require("../services/emailQueue");
const EventEmitter = require("events");

class NotificationService extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Create and send notification to user
   * @param {Object} options - Notification options
   * @param {String} options.userId - User ID to notify
   * @param {String} options.title - Notification title
   * @param {String} options.message - Notification message
   * @param {String} options.type - Notification type
   * @param {Object} options.metadata - Additional metadata
   * @param {Boolean} options.sendEmail - Whether to send email notification
   * @param {Boolean} options.sendWebSocket - Whether to send WebSocket notification
   */
  async createNotification({
    userId,
    title,
    message,
    type = "info",
    metadata = {},
    sendEmail = false,
    sendWebSocket = true,
  }) {
    try {
      // Create notification in database
      const notification = await Notification.create({
        userId,
        title,
        message,
        type,
        metadata,
      });

      // Send real-time notification via WebSocket
      if (sendWebSocket) {
        this.sendWebSocketNotification(userId, notification);
      }

      // Send email notification if requested
      if (sendEmail) {
        await this.sendEmailNotification(userId, notification);
      }

      // Emit event for other services to listen
      this.emit("notification:created", {
        userId,
        notification,
      });

      return notification;
    } catch (error) {
      console.error("Error creating notification:", error);
      throw error;
    }
  }

  /**
   * Send WebSocket notification
   */
  sendWebSocketNotification(userId, notification) {
    try {
      emitToUser(userId, "notification", {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        metadata: notification.metadata,
        createdAt: notification.createdAt,
        read: notification.read,
      });
    } catch (error) {
      console.error("Error sending WebSocket notification:", error);
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(userId, notification) {
    try {
      await addEmailJob({
        recipientId: userId,
        emailSubject: notification.title,
        emailBody: notification.message,
        templateName: "notification",
        metadata: notification.metadata,
      });
    } catch (error) {
      console.error("Error queueing email notification:", error);
    }
  }

  /**
   * Borrow event notifications
   */
  async notifyBorrowSuccess({ userId, resourceTitle, resourceId, expiryDate }) {
    return this.createNotification({
      userId,
      title: "📚 Resource Borrowed Successfully",
      message: `You have successfully borrowed "${resourceTitle}". It will expire on ${new Date(expiryDate).toLocaleDateString()}.`,
      type: "success",
      metadata: {
        resourceId,
        resourceTitle,
        expiryDate,
        eventType: "borrow_success",
      },
      sendEmail: true,
      sendWebSocket: true,
    });
  }

  async notifyBorrowExpirySoon({
    userId,
    resourceTitle,
    resourceId,
    expiryDate,
    hoursRemaining,
  }) {
    return this.createNotification({
      userId,
      title: "⏰ Borrowed Resource Expiring Soon",
      message: `Your borrowed resource "${resourceTitle}" will expire in ${hoursRemaining} hours. Please return or renew it.`,
      type: "warning",
      metadata: {
        resourceId,
        resourceTitle,
        expiryDate,
        hoursRemaining,
        eventType: "borrow_expiry_reminder",
      },
      sendEmail: true,
      sendWebSocket: true,
    });
  }

  async notifyAutoReturn({ userId, resourceTitle, resourceId }) {
    return this.createNotification({
      userId,
      title: "🔄 Resource Auto-Returned",
      message: `The resource "${resourceTitle}" has been automatically returned as the borrowing period has ended.`,
      type: "info",
      metadata: {
        resourceId,
        resourceTitle,
        eventType: "auto_return",
      },
      sendEmail: true,
      sendWebSocket: true,
    });
  }

  async notifyBorrowExpired({ userId, resourceTitle, resourceId }) {
    return this.createNotification({
      userId,
      title: "⚠️ Borrowed Resource Expired",
      message: `Your borrowing period for "${resourceTitle}" has expired. The resource has been returned.`,
      type: "warning",
      metadata: {
        resourceId,
        resourceTitle,
        eventType: "borrow_expired",
      },
      sendEmail: true,
      sendWebSocket: true,
    });
  }

  /**
   * Bulk notifications
   */
  async createBulkNotifications(notifications) {
    try {
      const promises = notifications.map((notification) =>
        this.createNotification(notification),
      );
      return await Promise.allSettled(promises);
    } catch (error) {
      console.error("Error creating bulk notifications:", error);
      throw error;
    }
  }
}

module.exports = new NotificationService();
