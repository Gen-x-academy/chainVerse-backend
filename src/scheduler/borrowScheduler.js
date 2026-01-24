const cron = require("node-cron");
const { updateExpiredBorrows } = require("../utils/borrowHelper");
const logger = require("../utils/logger");

const startBorrowScheduler = () => {
  cron.schedule("0 * * * *", async () => {
    try {
      const count = await updateExpiredBorrows();
      logger.info(`Borrow scheduler: Updated ${count} expired borrows`);
    } catch (error) {
      logger.error(`Borrow scheduler error: ${error.message}`);
    }
  });

  logger.info("Borrow scheduler started - runs every hour");
};

module.exports = { startBorrowScheduler };
