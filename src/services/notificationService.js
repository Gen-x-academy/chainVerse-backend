const Notification = require("../models/Notification");
const User = require("../models/User");
const { Queue } = require("bullmq");

const emailQueue = new Queue('email-sending-queue', {
  connection: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  }
});

class NotificationService {
  // Create notification for course updates
  async createCourseUpdateNotification(
    userId,
    courseTitle,
    updateType = "info"
  ) {
    try {
      const notification = new Notification({
        userId,
        title: "Course Updated",
        message: `The course "${courseTitle}" has been updated with new content.`,
        type: updateType,
      });
      await notification.save();
      return notification;
    } catch (error) {
      console.error("Error creating course update notification:", error);
      throw error;
    }
  }

  // Create notification for course approval
  async createCourseApprovalNotification(userId, courseTitle, approved = true) {
    try {
      const notification = new Notification({
        userId,
        title: approved ? "Course Approved" : "Course Rejected",
        message: approved
          ? `Your course "${courseTitle}" has been approved and is now live!`
          : `Your course "${courseTitle}" requires changes before approval.`,
        type: approved ? "success" : "warning",
      });
      await notification.save();
      return notification;
    } catch (error) {
      console.error("Error creating course approval notification:", error);
      throw error;
    }
  }

  // Create system notification
  async createSystemNotification(userId, title, message, type = "info") {
    try {
      const notification = new Notification({
        userId,
        title,
        message,
        type,
      });
      await notification.save();
      return notification;
    } catch (error) {
      console.error("Error creating system notification:", error);
      throw error;
    }
  }

  // Bulk create notifications for multiple users
  async createBulkNotifications(userIds, title, message, type = "info") {
    try {
      const notifications = userIds.map((userId) => ({
        userId,
        title,
        message,
        type,
      }));

      const result = await Notification.insertMany(notifications);
      return result;
    } catch (error) {
      console.error("Error creating bulk notifications:", error);
      throw error;
    }
  }

  // Clean up old archived notifications (utility method)
  async cleanupOldNotifications(daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await Notification.deleteMany({
        archived: true,
        createdAt: { $lt: cutoffDate },
      });

      return result.deletedCount;
    } catch (error) {
      console.error("Error cleaning up old notifications:", error);
      throw error;
    }
  }

  async createChallengeReceivedNotification(challengedStudentId, challengerId, courseId, courseTitle, topic, challengeId) {
    try {
      const challenger = await User.findById(challengerId).select('fullName').lean();
      if (!challenger) throw new Error(`Challenger with ID ${challengerId} not found.`);
      const challengerName = `${challenger.fullName}`;

      const notification = new Notification({
        userId: challengedStudentId,
        title: "You've Been Challenged!",
        message: `${challengerName} has challenged you in ${courseTitle} (Topic: ${topic}).`,
        type: "challenge_received",
        metadata: {
          challengeId,
          challengerId,
          challengerName,
          courseId,
          courseTitle,
          topic,
        },
      });
      await notification.save();
      
      await emailQueue.add('sendChallengeReceivedEmail', {
        recipientId: challengedStudentId,
        challengerName: challengerName,
        courseTitle: courseTitle,
        topic: topic,
        challengeId: challengeId,
        challengeLink: `${process.env.FRONTEND_URL}/challenges/${challengeId}`,
        templateName: 'challengeReceived',
      });

      return notification;
    } catch (error) {
      console.error("Error creating challenge received notification:", error);
      throw error;
    }
  }

  async createChallengeResultNotification(participantId, opponentName, courseTitle, outcome, yourScore, opponentScore, matchSummaryLink, challengeId) {
    try {
      const notification = new Notification({
        userId: participantId,
        title: `Challenge Result: You ${outcome}!`,
        message: `Results for your challenge with ${opponentName} in ${courseTitle}: You ${outcome}. Score: ${yourScore} - ${opponentScore}.`,
        type: "challenge_result",
        metadata: { challengeId, opponentName, courseTitle, outcome, yourScore, opponentScore, matchSummaryLink },
      });
      await notification.save();
      
      await emailQueue.add('sendChallengeResultEmail', {
        recipientId: participantId,
        opponentName,
        courseTitle,
        outcome,
        yourScore,
        opponentScore,
        matchSummaryLink: `${process.env.FRONTEND_URL}${matchSummaryLink}`,
        challengeId,
        templateName: 'challengeResult',
      });

      return notification;
    } catch (error) {
      console.error("Error creating challenge result notification:", error);
      throw error;
    }
  }

  async createRewardNotification(userId, title, message, rewardMetadata) {
    try {
      const notification = new Notification({ userId, title, message, type: "reward_earned", metadata: rewardMetadata });
      await notification.save();
      
      await emailQueue.add('sendRewardEmail', {
        recipientId: userId,
        emailSubject: title,
        emailBody: message,
        rewardDetails: rewardMetadata,
        templateName: 'rewardEarned',
      })
      
      return notification;
    } catch (error) {
      console.error("Error creating reward notification:", error);
      throw error;
    }
  }
}

module.exports = new NotificationService();
