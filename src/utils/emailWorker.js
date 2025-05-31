const dotenv = require('dotenv');
dotenv.config();
const { Worker } = require('bullmq');
const { sendEmail } = require('./sendMail');
const User = require('../models/User');
const mongoose = require('mongoose');
const dbConnect = require('../config/database/connection');

const QUEUE_NAME = 'email-sending-queue';

async function connectToDatabase() {
  if (mongoose.connection.readyState === 0) { 
    await dbConnect();
    console.log('Email Worker: MongoDB connected');
  }
}

const processEmailJob = async (job) => {
  await connectToDatabase();
  const { recipientId, emailSubject, emailBody, templateName, ...emailData } = job.data;

  console.log(`Processing job ${job.id} for ${job.name} to recipient ID: ${recipientId}`);

  try {
    const recipient = await User.findById(recipientId).select('email fullName').lean();

    if (!recipient || !recipient.email) {
      throw new Error(`Recipient not found or email missing for ID: ${recipientId}`);
    }

    let htmlContent = emailBody;

    if (templateName === 'challengeReceived') {
      htmlContent = `
        <h1>You've Been Challenged!</h1>
        <p>Hi ${recipient.fullName || 'Student'},</p>
        <p>${emailData.challengerName} has challenged you in ${emailData.courseTitle} (Topic: ${emailData.topic}).</p>
        <p>View the challenge: <a href="${emailData.challengeLink}">Click here</a></p>
        <p>Good luck!</p>
      `;
    } else if (templateName === 'challengeResult') {
      htmlContent = `
        <h1>Challenge Result: You ${emailData.outcome}!</h1>
        <p>Hi ${recipient.fullName || 'Student'},</p>
        <p>The results for your challenge with ${emailData.opponentName} in ${emailData.courseTitle} are in.</p>
        <p>You ${emailData.outcome}. Score: ${emailData.yourScore} - ${emailData.opponentScore}.</p>
        <p><a href="${emailData.matchSummaryLink}">View Match Summary</a></p>
      `;
    } else if (templateName === 'rewardEarned') {
      let rewardMessage = `<p>You've received the "${emailData.rewardDetails.badgeName || emailData.rewardDetails.tokenAmount || emailData.rewardDetails.nftName}"!</p>`;
      if(emailData.rewardDetails.badgeIconUrl) rewardMessage += `<img src="${emailData.rewardDetails.badgeIconUrl}" alt="Badge">`;

      htmlContent = `
        <h1>Congratulations!</h1>
        <p>Hi ${recipient.fullName || 'Student'},</p>
        ${rewardMessage}
        <p>Keep up the great work!</p>
      `;
    }

    const emailSent = await sendEmail(recipient.email, null, emailSubject, htmlContent);

    if (emailSent) {
      console.log(`Email for job ${job.id} sent successfully to ${recipient.email}`);
    } else {
      console.error(`Email for job ${job.id} failed to send to ${recipient.email} (sendEmail returned false)`);

      throw new Error(`sendEmail utility reported failure for ${recipient.email}`);
    }

  } catch (error) {
    console.error(`Failed to process email job ${job.id} for recipient ${recipientId}:`, error.message);

    throw error;
  }
};

const emailWorker = new Worker(QUEUE_NAME, processEmailJob, {
  connection: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  concurrency: 5,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
});

console.log(`📧 Email worker started for queue: ${QUEUE_NAME}`);

emailWorker.on('completed', (job) => {
  console.log(`Job ${job.id} (type: ${job.name}) has completed.`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} (type: ${job.name}) has failed with error: ${err.message}`);
});

process.on('SIGTERM', () => emailWorker.close());
process.on('SIGINT', () => emailWorker.close());