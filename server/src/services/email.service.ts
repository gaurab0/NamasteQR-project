import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { db } from './db.service';
import { config } from '../config/env';

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isTransporterReady: boolean = false;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    try {
      if (config.email.user && config.email.password) {
        this.transporter = nodemailer.createTransport({
          host: config.email.host,
          port: config.email.port,
          secure: config.email.port === 465,
          auth: {
            user: config.email.user,
            pass: config.email.password,
          },
        });
        this.isTransporterReady = true;
        console.log(`✉️ Email Service initialized with SMTP (${config.email.host}:${config.email.port})`);
      } else {
        console.log(`✉️ Email Service running in simulated/dev mode (configure EMAIL_USER & EMAIL_PASSWORD in .env for real SMTP)`);
      }
    } catch (err: any) {
      console.warn('⚠️ Could not initialize SMTP transporter:', err.message);
    }
  }

  /**
   * Sends a 6-digit OTP verification code via Email
   */
  async sendVerificationOTP(email: string, otp: string, businessName?: string): Promise<{ success: boolean; messageId?: string }> {
    const formattedEmail = email.toLowerCase().trim();
    const subject = `Your ServeFlow Verification Code: ${otp}`;
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px 24px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
        <div style="margin-bottom: 24px; border-bottom: 1px solid #f4f4f5; padding-bottom: 16px;">
          <h2 style="margin: 0; color: #18181b; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">ServeFlow</h2>
          <p style="margin: 4px 0 0 0; color: #71717a; font-size: 13px;">Business Authentication</p>
        </div>
        
        <p style="color: #3f3f46; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">
          Hello ${businessName ? `<strong>${businessName}</strong>,` : ''}
        </p>
        <p style="color: #3f3f46; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0;">
          Use the following 6-digit verification code to complete your business registration and activate your portal:
        </p>

        <div style="background-color: #faf5ff; border: 1.5px solid #d8b4fe; border-radius: 8px; padding: 18px 24px; text-align: center; margin: 20px 0;">
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #6b21a8;">
            ${otp}
          </span>
          <p style="margin: 8px 0 0 0; color: #7e22ce; font-size: 12px; font-weight: 600;">
            Expires in ${config.otpExpiryMinutes} minutes
          </p>
        </div>

        <p style="color: #71717a; font-size: 13px; line-height: 1.5; margin: 24px 0 8px 0;">
          If you did not request this security code, please ignore this email or contact support if you have concerns.
        </p>
        
        <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #f4f4f5; text-align: center; color: #a1a1aa; font-size: 11px;">
          &copy; ${new Date().getFullYear()} ServeFlow Platform. All rights reserved.
        </div>
      </div>
    `;

    console.log(`\n========================================`);
    console.log(`📧 [EMAIL OTP DISPATCHED]`);
    console.log(`   To: ${formattedEmail}`);
    console.log(`   Code: ${otp}`);
    console.log(`   Expires in: ${config.otpExpiryMinutes} minutes`);
    console.log(`========================================\n`);

    if (this.transporter && this.isTransporterReady) {
      try {
        const fromAddress = config.email.from || `"ServeFlow" <${config.email.user}>`;
        const info = await this.transporter.sendMail({
          from: fromAddress,
          to: formattedEmail,
          replyTo: config.email.user,
          subject,
          text: `Your ServeFlow verification code is: ${otp}. This code is valid for ${config.otpExpiryMinutes} minutes. If you did not request this, please ignore this email.`,
          html: htmlBody,
          headers: {
            'X-Priority': '1 (Highest)',
            'X-MSMail-Priority': 'High',
            'Importance': 'High',
          },
        });
        console.log(`✅ [SMTP SUCCESS] Message accepted by Gmail server. MessageId: ${info.messageId} | Response: ${info.response}`);
        return { success: true, messageId: info.messageId };
      } catch (err: any) {
        console.error('❌ [SMTP ERROR] Failed to send email via SMTP:', err.message);
        if (!config.devOtpMode) {
          throw new Error(`Email delivery failed: ${err.message}`);
        }
      }
    }

    return { success: true, messageId: `dev-email-${Date.now()}` };
  }

  /**
   * Generates a cryptographically random reset token and saves hash to DB
   */
  async createPasswordResetToken(user: { id: string; email: string }): Promise<{ token: string; expiresAt: Date }> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.createPasswordResetToken({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      rawTokenDev: config.devOtpMode ? rawToken : undefined,
    });

    return {
      token: rawToken,
      expiresAt,
    };
  }

  /**
   * Sends password reset email
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${config.frontendUrl}/reset-password/${token}?email=${encodeURIComponent(email)}`;
    console.log(`[Email:PasswordReset] To: ${email} | Reset Link: ${resetUrl}`);

    if (this.transporter && this.isTransporterReady) {
      try {
        await this.transporter.sendMail({
          from: config.email.from,
          to: email,
          subject: 'Reset your ServeFlow account password',
          text: `Please use the following link to reset your password: ${resetUrl}`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e4e4e7; border-radius: 8px;">
              <h2 style="color: #18181b;">Reset Your Password</h2>
              <p style="color: #52525b;">Click the button below to choose a new password for your ServeFlow account:</p>
              <div style="margin: 24px 0;">
                <a href="${resetUrl}" style="background-color: #d97706; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
                  Reset Password
                </a>
              </div>
              <p style="color: #71717a; font-size: 12px;">This link will expire in 1 hour. If you did not request this, you can safely ignore this email.</p>
            </div>
          `,
        });
      } catch (err: any) {
        console.error('Failed to send password reset email via SMTP:', err.message);
      }
    }
  }

  /**
   * Validates a submitted password reset token
   */
  async verifyPasswordResetToken(userId: string, submittedToken: string) {
    const activeTokens = await db.findActivePasswordResetTokens(userId);
    
    for (const record of activeTokens) {
      const match = await bcrypt.compare(submittedToken, record.token_hash);
      if (match) {
        return record;
      }
    }

    return null;
  }
}

export const emailService = new EmailService();
