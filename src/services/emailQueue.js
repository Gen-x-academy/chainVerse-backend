const { Queue } = require("bullmq");

const QUEUE_NAME = "email-sending-queue";

const emailQueue = new Queue(QUEUE_NAME, {
  connection: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

/**
 * Add email job to queue
 */
const addEmailJob = async (emailData) => {
  try {
    const job = await emailQueue.add("send-email", emailData, {
      priority: emailData.priority || 5,
    });

    console.log(`Email job added to queue: ${job.id}`);
    return job;
  } catch (error) {
    console.error("Error adding email to queue:", error);
    throw error;
  }
};

/**
 * Add bulk email jobs
 */
const addBulkEmailJobs = async (emailsData) => {
  try {
    const jobs = emailsData.map((emailData) => ({
      name: "send-email",
      data: emailData,
      opts: {
        priority: emailData.priority || 5,
      },
    }));

    const addedJobs = await emailQueue.addBulk(jobs);
    console.log(`${addedJobs.length} email jobs added to queue`);
    return addedJobs;
  } catch (error) {
    console.error("Error adding bulk emails to queue:", error);
    throw error;
  }
};

/**
 * Get queue stats
 */
const getQueueStats = async () => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      emailQueue.getWaitingCount(),
      emailQueue.getActiveCount(),
      emailQueue.getCompletedCount(),
      emailQueue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
    };
  } catch (error) {
    console.error("Error getting queue stats:", error);
    throw error;
  }
};

module.exports = {
  emailQueue,
  addEmailJob,
  addBulkEmailJobs,
  getQueueStats,
};
