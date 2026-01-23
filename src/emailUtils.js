const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// Create a reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.EMAIL_USER, // Your email from .env
		pass: process.env.EMAIL_PASS, // Your app password from .env
	},
});

// Function to send email
const sendCertificateEmail = async (
	to_email,
	student_name,
	course_title,
	verification_link
) => {
	const mailOptions = {
		from: process.env.EMAIL_USER, // Sender's email
		to: to_email, // Recipient's email
		subject: `Your Certificate for ${course_title}`,
		html: `
      <h3>Congratulations, ${student_name}!</h3>
      <p>You have successfully completed the course: <strong>${course_title}</strong>.</p>
      <p>Click the link below to verify your certificate:</p>
      <a href="${verification_link}">Verify Certificate</a>
    `,
	};

	try {
		await transporter.sendMail(mailOptions);
		console.log('Certificate email sent!');
	} catch (error) {
		console.error('Error sending email:', error);
		throw new Error('Failed to send certificate email.');
	}
};

// Create email transporter
const createTransporter = () => {
	return nodemailer.createTransporter({
		host: process.env.SMTP_HOST || 'smtp.gmail.com',
		port: process.env.SMTP_PORT || 587,
		secure: false, // true for 465, false for other ports
		auth: {
			user: process.env.SMTP_USER,
			pass: process.env.SMTP_PASS,
		},
	});
};

// Send email function
const sendEmailTutorCourseAlert = async (to, subject, html, text = null) => {
	try {
		if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
			console.warn('SMTP credentials not configured. Email not sent.');
			return;
		}

		const transporter = createTransporter();

		const mailOptions = {
			from: `"ChainVerse Academy" <${process.env.SMTP_USER}>`,
			to,
			subject,
			html,
			text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
		};

		const info = await transporter.sendMail(mailOptions);
		console.log('Email sent successfully:', info.messageId);
		return info;
	} catch (error) {
		console.error('Error sending email:', error);
		throw error;
	}
};

// Send bulk emails
const sendBulkEmailTutorCourseAlert = async (
	recipients,
	subject,
	html,
	text = null
) => {
	try {
		const promises = recipients.map((recipient) =>
			this.sendEmail(recipient, subject, html, text)
		);

		const results = await Promise.allSettled(promises);

		const successful = results.filter(
			(result) => result.status === 'fulfilled'
		).length;
		const failed = results.filter(
			(result) => result.status === 'rejected'
		).length;

		console.log(
			`Bulk email results: ${successful} successful, ${failed} failed`
		);
		return { successful, failed };
	} catch (error) {
		console.error('Error sending bulk emails:', error);
		throw error;
	}
};

// Send verification email
const sendVerificationEmail = async (email, userId) => {
	try {
		const verificationToken = jwt.sign(
			{ userId, email },
			process.env.JWT_SECRET || 'fallback_secret',
			{ expiresIn: '24h' }
		);

		const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

		const mailOptions = {
			from: `"ChainVerse Academy" <${process.env.EMAIL_USER}>`,
			to: email,
			subject: 'Verify Your Email Address',
			html: `
				<div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
					<h2 style="color: #333; text-align: center;">Welcome to ChainVerse Academy!</h2>
					<p>Thank you for joining our platform. Please verify your email address to complete your registration.</p>
					<div style="text-align: center; margin: 30px 0;">
						<a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
					</div>
					<p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
					<p style="color: #666; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
				</div>
			`,
		};

		await transporter.sendMail(mailOptions);
		console.log(`Verification email sent to ${email}`);
	} catch (error) {
		console.error('Error sending verification email:', error);
		throw error;
	}
};

module.exports = {
	sendCertificateEmail,
	sendEmailTutorCourseAlert,
	sendBulkEmailTutorCourseAlert,
	sendVerificationEmail,
};
