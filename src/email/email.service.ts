import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('smtpHost');
    const port = this.configService.get<number>('smtpPort');
    const user = this.configService.get<string>('emailUser');
    const pass = this.configService.get<string>('emailPass');

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransporter({
        host,
        port,
        secure: this.configService.get<boolean>('smtpSecure') ?? false,
        auth: { user, pass },
      });
    } else {
      this.logger.warn(
        'SMTP not configured. Emails will be logged but NOT sent.',
      );
    }
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    const from =
      this.configService.get<string>('emailFrom') ??
      'noreply@chainverse.academy';
    if (this.transporter) {
      await this.transporter.sendMail({ from, to, subject, text });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } else {
      this.logger.warn(
        `SMTP not configured. Email to ${to} was NOT sent: ${subject}`,
      );
    }
  }

  async sendPasswordReset(
    to: string,
    resetToken: string,
    baseUrl: string,
  ): Promise<void> {
    const from =
      this.configService.get<string>('emailFrom') ??
      'noreply@chainverse.academy';
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from,
      to,
      subject: 'Password Reset Request',
      text: `You requested a password reset. Click the link to reset your password: ${resetLink}\n\nIf you did not request this, please ignore this email.`,
      html: `<p>You requested a password reset.</p>
<p><a href="${resetLink}">Click here to reset your password</a></p>
<p>If you did not request this, please ignore this email.</p>`,
    };

    if (this.transporter) {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Password reset email sent to ${to}`);
    } else {
      this.logger.warn(
        `SMTP not configured. Password reset email to ${to} was NOT sent.`,
      );
    }
  }

  async sendVerificationEmail(
    to: string,
    verificationToken: string,
  ): Promise<void> {
    const from =
      this.configService.get<string>('emailFrom') ??
      'noreply@chainverse.academy';
    const baseUrl =
      this.configService.get<string>('baseUrl') ?? 'http://localhost:3000';
    const verificationLink = `${baseUrl}/student/verify-email?token=${encodeURIComponent(
      verificationToken,
    )}`;

    const mailOptions = {
      from,
      to,
      subject: 'Verify your ChainVerse email',
      text: `Please verify your email by visiting: ${verificationLink}`,
      html: `<p>Welcome to ChainVerse!</p>
<p>Please verify your email by clicking the link below:</p>
<p><a href="${verificationLink}">Verify my email</a></p>
<p>If you did not create an account, please ignore this message.</p>`,
    };

    if (this.transporter) {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Verification email sent to ${to}`);
    } else {
      this.logger.warn(
        `SMTP not configured. Verification email to ${to} was NOT sent.`,
      );
    }
  }
}
