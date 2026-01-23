const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Send welcome email with login credentials to new organization member
 * @param {string} to - Recipient email
 * @param {string} fullName - Member's full name
 * @param {string} organizationName - Organization name
 * @param {string} email - Login email (same as 'to')
 * @param {string} password - Generated password for the user
 */
exports.sendMemberWelcomeEmail = async (to, fullName, organizationName, email, password) => {
  try {
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;
    
    const mailOptions = {
      from: `ChainVerse <${process.env.EMAIL_USERNAME}>`,
      to,
      subject: `Welcome to ${organizationName} - Your Account Credentials`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #4CAF50;">Welcome to ${organizationName}!</h1>
          <p>Dear ${fullName},</p>
          <p>You have been successfully added as a member of <strong>${organizationName}</strong> on ChainVerse Academy.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h2 style="color: #333; margin-top: 0;">Your Login Credentials</h2>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> <code style="background-color: #fff; padding: 5px 10px; border-radius: 3px; font-size: 14px;">${password}</code></p>
          </div>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${loginUrl}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Login to Your Account</a>
          </div>
          
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Security Notice:</strong> For your security, please change your password after your first login.</p>
          </div>
          
          <p>If you did not expect this invitation, please contact your organization administrator immediately.</p>
          <p>Best regards,<br><strong>The ChainVerse Academy Team</strong></p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    return info.accepted.includes(to);
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw new Error('Failed to send welcome email');
  }
};

/**
 * Legacy function - kept for backward compatibility
 * @deprecated Use sendMemberWelcomeEmail instead
 */
exports.sendMemberInvitation = async (to, fullName, organizationName, invitationToken) => {
  try {
    const invitationLink = `${process.env.FRONTEND_URL}/organization/member/accept-invitation?token=${invitationToken}`;
    
    const mailOptions = {
      from: `ChainVerse <${process.env.EMAIL_USERNAME}>`,
      to,
      subject: 'Invitation to Join Organization',
      html: `
        <h1>Welcome to ${organizationName}!</h1>
        <p>Dear ${fullName},</p>
        <p>You have been invited to join ${organizationName} on ChainVerse. Click the button below to accept the invitation and set up your account:</p>
        <div style="margin: 30px 0;">
          <a href="${invitationLink}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px;">Accept Invitation</a>
        </div>
        <p>This invitation link will expire in 24 hours.</p>
        <p>If you did not expect this invitation, please ignore this email.</p>
        <p>Best regards,<br>The ChainVerse Team</p>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    return info.accepted.includes(to);
  } catch (error) {
    console.error('Error sending invitation email:', error);
    throw new Error('Failed to send invitation email');
  }
};

exports.sendMemberRemovalNotification = async (to, fullName, organizationName) => {
  try {
    const mailOptions = {
      from: `ChainVerse <${process.env.EMAIL_USERNAME}>`,
      to,
      subject: 'Organization Membership Update',
      html: `
        <h1>Organization Membership Update</h1>
        <p>Dear ${fullName},</p>
        <p>This email is to inform you that your membership with ${organizationName} has been terminated.</p>
        <p>If you believe this is a mistake, please contact your organization administrator.</p>
        <p>Best regards,<br>The ChainVerse Team</p>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    return info.accepted.includes(to);
  } catch (error) {
    console.error('Error sending removal notification:', error);
    throw new Error('Failed to send removal notification');
  }
};