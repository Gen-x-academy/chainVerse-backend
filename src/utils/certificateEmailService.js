const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * Send email notification to student when a certificate is generated
 * @param {string} studentEmail - Email of the student
 * @param {string} studentName - Name of the student
 * @param {string} courseTitle - Title of the course
 * @param {string} certificateUrl - URL to access the certificate
 * @param {string} verificationLink - Link to verify the certificate
 * @returns {Promise<boolean>} Success status
 */
const sendCertificateNotification = async (
  studentEmail,
  studentName,
  courseTitle,
  certificateUrl,
  verificationLink
) => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransporter({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // Email template
    const mailOptions = {
      from: process.env.EMAIL_USERNAME,
      to: studentEmail,
      subject: `🎉 Congratulations! Your Certificate for ${courseTitle} is Ready`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Congratulations on Your Certificate!</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    background-color: #f9f9f9;
                    margin: 0;
                    padding: 20px;
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    background: white;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .header { 
                    background: linear-gradient(135deg, #667eea, #764ba2); 
                    color: white; 
                    padding: 40px 20px; 
                    text-align: center;
                }
                .content { 
                    padding: 30px; 
                    text-align: center;
                }
                .certificate-badge {
                    background: #4CAF50;
                    color: white;
                    padding: 8px 16px;
                    border-radius: 20px;
                    display: inline-block;
                    margin-bottom: 20px;
                    font-weight: bold;
                }
                .btn {
                    display: inline-block;
                    background: #667eea;
                    color: white !important;
                    padding: 12px 30px;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                    font-weight: bold;
                }
                .btn:hover {
                    background: #5a6fd8;
                }
                .footer {
                    background: #f5f5f5;
                    padding: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 28px;">🎉 Congratulations!</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">You've earned a new certificate</p>
                </div>
                
                <div class="content">
                    <div class="certificate-badge">WEB3 CERTIFIED</div>
                    
                    <h2 style="color: #333; margin-top: 0;">${studentName},</h2>
                    
                    <p>Congratulations on successfully completing the course:</p>
                    <h3 style="color: #667eea; margin: 20px 0;">${courseTitle}</h3>
                    
                    <p>Your official certificate is now available! You can view, download, and share it with your network.</p>
                    
                    <a href="${certificateUrl}" class="btn" style="display: inline-block; background: #667eea; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold;">
                        View My Certificate
                    </a>
                    
                    <p style="margin-top: 30px;">
                        <strong>Verify Certificate Authenticity:</strong><br>
                        <a href="${verificationLink}" style="color: #667eea;">${verificationLink}</a>
                    </p>
                    
                    <p style="margin-top: 30px; font-style: italic;">
                        This certificate is securely stored and can be verified on the blockchain.
                    </p>
                </div>
                
                <div class="footer">
                    <p>Sent from ChainVerse Academy<br>
                    The Leading Web3 Education Platform</p>
                    <p style="margin-top: 10px;">© ${new Date().getFullYear()} ChainVerse Academy. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
      `
    };

    // Send email
    const result = await transporter.sendMail(mailOptions);
    logger.info(`Certificate notification sent successfully to ${studentEmail}`);
    return true;
  } catch (error) {
    logger.error(`Error sending certificate notification to ${studentEmail}:`, error);
    return false;
  }
};

module.exports = {
  sendCertificateNotification
};