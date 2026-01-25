const cron = require("node-cron");
const Borrow = require("../models/Borrow");
const notificationService = require("../utils/notificationService");

class BorrowScheduler {
  constructor() {
    this.jobs = [];
  }

  /**
   * Initialize all scheduled jobs
   */
  init() {
    console.log("🕐 Initializing borrow notification scheduler...");

    // Check for expiry reminders every hour
    this.scheduleExpiryReminders();

    // Check for expired borrows every 30 minutes
    this.scheduleExpiredBorrowsCheck();

    console.log("✅ Borrow scheduler initialized");
  }

  /**
   * Send reminders for borrows expiring within 24 hours
   * Runs every hour
   */
  scheduleExpiryReminders() {
    const job = cron.schedule("0 * * * *", async () => {
      console.log("Running expiry reminder check...");

      try {
        // Find active borrows expiring within 24 hours that haven't been reminded
        const now = new Date();
        const twentyFourHoursLater = new Date(
          now.getTime() + 24 * 60 * 60 * 1000,
        );

        const borrowsToRemind = await Borrow.find({
          status: "active",
          reminderSent: false,
          expiryDate: {
            $gte: now,
            $lte: twentyFourHoursLater,
          },
        }).lean();

        console.log(
          `Found ${borrowsToRemind.length} borrows needing reminders`,
        );

        for (const borrow of borrowsToRemind) {
          const hoursRemaining = Math.ceil(
            (borrow.expiryDate - now) / (1000 * 60 * 60),
          );

          // Send reminder notification
          await notificationService.notifyBorrowExpirySoon({
            userId: borrow.userId,
            resourceTitle: borrow.resourceTitle,
            resourceId: borrow.resourceId,
            expiryDate: borrow.expiryDate,
            hoursRemaining,
          });

          // Mark reminder as sent
          await Borrow.findByIdAndUpdate(borrow._id, {
            reminderSent: true,
          });
        }

        console.log(`✅ Sent ${borrowsToRemind.length} expiry reminders`);
      } catch (error) {
        console.error("Error in expiry reminder job:", error);
      }
    });

    this.jobs.push(job);
    console.log("📅 Scheduled: Expiry reminders (every hour)");
  }

  /**
   * Auto-return expired borrows and send notifications
   * Runs every 30 minutes
   */
  scheduleExpiredBorrowsCheck() {
    const job = cron.schedule("*/30 * * * *", async () => {
      console.log("Running expired borrows check...");

      try {
        const now = new Date();

        // Find all active borrows that have expired
        const expiredBorrows = await Borrow.find({
          status: "active",
          expiryDate: { $lt: now },
        }).lean();

        console.log(`Found ${expiredBorrows.length} expired borrows`);

        for (const borrow of expiredBorrows) {
          // Update borrow status
          await Borrow.findByIdAndUpdate(borrow._id, {
            status: "expired",
            returnDate: now,
            autoReturned: true,
          });

          // Send auto-return notification
          await notificationService.notifyAutoReturn({
            userId: borrow.userId,
            resourceTitle: borrow.resourceTitle,
            resourceId: borrow.resourceId,
          });
        }

        console.log(
          `✅ Auto-returned ${expiredBorrows.length} expired borrows`,
        );
      } catch (error) {
        console.error("Error in expired borrows check job:", error);
      }
    });

    this.jobs.push(job);
    console.log("📅 Scheduled: Expired borrows check (every 30 minutes)");
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll() {
    this.jobs.forEach((job) => job.stop());
    console.log("⏹️ All borrow scheduler jobs stopped");
  }
}

module.exports = new BorrowScheduler();
