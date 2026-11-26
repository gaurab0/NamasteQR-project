import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { db } from './db.service';
import { config } from '../config/env';

export function escapeHtml(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isTransporterReady: boolean = false;

  constructor() {
    this.initTransporter();
  }

  private fromAddress(label = 'NamasteQR'): string {
    if (config.email.from.trim()) return config.email.from.trim();
    if (config.email.user.includes('@')) return `"${label}" <${config.email.user}>`;
    return config.email.user;
  }

  private deliveryError(cause?: unknown): Error & { code: string; statusCode: number } {
    const error = new Error('Email delivery is temporarily unavailable. Please request a new verification code shortly.') as Error & { code: string; statusCode: number; cause?: unknown };
    error.name = 'EmailDeliveryError';
    error.code = 'EMAIL_DELIVERY_FAILED';
    error.statusCode = 503;
    error.cause = cause;
    return error;
  }

  private initTransporter() {
    try {
      if (config.email.user && config.email.password) {
        this.transporter = nodemailer.createTransport({
          host: config.email.host,
          port: config.email.port,
          secure: config.email.port === 465,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
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
    const subject = 'Your NamasteQR verification code';
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px 24px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
        <div style="margin-bottom: 24px; border-bottom: 1px solid #f4f4f5; padding-bottom: 16px;">
          <h2 style="margin: 0; color: #18181b; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">NamasteQR</h2>
          <p style="margin: 4px 0 0 0; color: #71717a; font-size: 13px;">Business Authentication</p>
        </div>
        
        <p style="color: #3f3f46; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">
          Hello ${businessName ? `<strong>${escapeHtml(businessName)}</strong>,` : ''}
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
          &copy; ${new Date().getFullYear()} NamasteQR Platform. All rights reserved.
        </div>
      </div>
    `;

    if (config.devOtpMode && !config.isProduction) {
      console.log(`[Email:OTP] Development code created for ${formattedEmail}; expires in ${config.otpExpiryMinutes} minutes.`);
    }

    if (this.transporter && this.isTransporterReady) {
      try {
        const info = await this.transporter.sendMail({
          from: this.fromAddress(),
          to: formattedEmail,
          replyTo: config.email.user,
          subject,
          text: `Your NamasteQR verification code is: ${otp}. This code is valid for ${config.otpExpiryMinutes} minutes. If you did not request this, please ignore this email.`,
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
        console.error('[SMTP ERROR] Verification email delivery failed:', err.code || err.responseCode || 'SMTP_ERROR');
        if (config.isProduction || !config.devOtpMode) throw this.deliveryError(err);
      }
    } else if (config.isProduction || !config.devOtpMode) {
      throw this.deliveryError(new Error('SMTP credentials are not configured.'));
    }

    // In local development, the API can return the code through the dev-only response field.
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
          from: this.fromAddress(),
          to: email,
          subject: 'Reset your NamasteQR account password',
          text: `Please use the following link to reset your password: ${resetUrl}`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e4e4e7; border-radius: 8px;">
              <h2 style="color: #18181b;">Reset Your Password</h2>
              <p style="color: #52525b;">Click the button below to choose a new password for your NamasteQR account:</p>
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

  /**
   * Routes a "Book Demo" submission directly to info@namasteqr.com
   */
  async sendDemoBookingNotification(data: {
    name: string;
    businessName: string;
    email: string;
    phone: string;
    location: string;
    queries?: string;
  }): Promise<{ success: boolean; messageId?: string }> {
    const targetEmail = 'info@namasteqr.com';
    const subject = `📅 [Book Demo Request] ${data.businessName} - ${data.name}`;

    const textBody = `
========================================
NEW DEMO BOOKING REQUEST FOR NAMASTEQR
========================================
Client Name: ${data.name}
Business / Venue: ${data.businessName}
Email Address: ${data.email}
Phone Number: ${data.phone}
Venue Location: ${data.location}
Other Queries / Notes: ${data.queries || 'None specified'}
Submitted At: ${new Date().toUTCString()}
Routed Directly To: ${targetEmail}
========================================
    `.trim();

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 14px;">
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 22px 24px; border-radius: 10px; color: #ffffff; margin-bottom: 24px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">📅 New Demo Booking Request</h2>
          <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 13px;">NamasteQR Hospitality OS • Leads Dispatch</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
          <tbody>
            <tr style="border-bottom: 1px solid #f4f4f5;">
              <td style="padding: 10px 0; color: #71717a; width: 140px; font-weight: 600;">Client Name</td>
              <td style="padding: 10px 0; color: #18181b; font-weight: 700;">${escapeHtml(data.name)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f4f4f5;">
              <td style="padding: 10px 0; color: #71717a; font-weight: 600;">Business / Venue</td>
              <td style="padding: 10px 0; color: #18181b; font-weight: 700;">${escapeHtml(data.businessName)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f4f4f5;">
              <td style="padding: 10px 0; color: #71717a; font-weight: 600;">Email Address</td>
              <td style="padding: 10px 0;">
                <a href="mailto:${encodeURIComponent(data.email)}" style="color: #2563eb; font-weight: 600; text-decoration: none;">${escapeHtml(data.email)}</a>
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #f4f4f5;">
              <td style="padding: 10px 0; color: #71717a; font-weight: 600;">Phone Number</td>
              <td style="padding: 10px 0;">
                <a href="tel:${encodeURIComponent(data.phone)}" style="color: #059669; font-weight: 700; text-decoration: none;">${escapeHtml(data.phone)}</a>
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #f4f4f5;">
              <td style="padding: 10px 0; color: #71717a; font-weight: 600;">Venue Location</td>
              <td style="padding: 10px 0; color: #18181b; font-weight: 600;">${escapeHtml(data.location)}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #71717a; font-weight: 600; vertical-align: top;">Other Queries</td>
              <td style="padding: 10px 0; color: #27272a; line-height: 1.5; background: #fafafa; padding: 10px 14px; border-radius: 8px;">
                ${data.queries ? escapeHtml(data.queries).replace(/\n/g, '<br/>') : '<em>No specific queries provided</em>'}
              </td>
            </tr>
          </tbody>
        </table>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-size: 13px; color: #475569;">
          <strong>Quick Action:</strong> You can click "Reply" in your email client to respond directly to <strong>${data.name}</strong> at <strong>${data.email}</strong>.
        </div>

        <div style="border-top: 1px solid #f4f4f5; padding-top: 14px; font-size: 11px; color: #a1a1aa; text-align: center;">
          Sent to <strong>${targetEmail}</strong> via NamasteQR Lead Notification Engine • ${new Date().toLocaleString()}
        </div>
      </div>
    `;

    console.log(`\n========================================`);
    console.log(`📅 [BOOK DEMO DISPATCHED TO ${targetEmail}]`);
    console.log(`   Client: ${data.name} (${data.businessName})`);
    console.log(`   Email: ${data.email} | Phone: ${data.phone}`);
    console.log(`   Location: ${data.location}`);
    console.log(`   Queries: ${data.queries || 'None'}`);
    console.log(`========================================\n`);

    if (this.transporter && this.isTransporterReady) {
      try {
        const info = await this.transporter.sendMail({
          from: this.fromAddress('NamasteQR Leads'),
          to: targetEmail,
          replyTo: `"${data.name}" <${data.email}>`,
          subject,
          text: textBody,
          html: htmlBody,
          headers: {
            'X-Priority': '1 (Highest)',
            'X-MSMail-Priority': 'High',
            'Importance': 'High',
          },
        });
        console.log(`✅ [SMTP SUCCESS] Demo booking email delivered to ${targetEmail}. MessageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
      } catch (err: any) {
        console.error(`❌ [SMTP ERROR] Failed to send demo booking email to ${targetEmail}:`, err.message);
      }
    }

    return { success: true, messageId: `dev-demo-${Date.now()}` };
  }

  /**
   * Routes a "Send Enquiry" submission directly to info@namasteqr.com
   */
  async sendContactEnquiryNotification(data: {
    name: string;
    email: string;
    message: string;
    phone?: string;
  }): Promise<{ success: boolean; messageId?: string }> {
    const targetEmail = 'info@namasteqr.com';
    const subject = `💬 [Customer Enquiry] From ${data.name}`;

    const textBody = `
========================================
NEW CUSTOMER ENQUIRY VIA NAMASTEQR
========================================
From: ${data.name}
Email: ${data.email}
Phone: ${data.phone || 'Not provided'}
Message:
${data.message}
Submitted At: ${new Date().toUTCString()}
Routed Directly To: ${targetEmail}
========================================
    `.trim();

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 14px;">
        <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 22px 24px; border-radius: 10px; color: #ffffff; margin-bottom: 24px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">💬 New Customer Enquiry</h2>
          <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 13px;">NamasteQR Support & Inquiries</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
          <tbody>
            <tr style="border-bottom: 1px solid #f4f4f5;">
              <td style="padding: 10px 0; color: #71717a; width: 140px; font-weight: 600;">Sender Name</td>
              <td style="padding: 10px 0; color: #18181b; font-weight: 700;">${escapeHtml(data.name)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f4f4f5;">
              <td style="padding: 10px 0; color: #71717a; font-weight: 600;">Email Address</td>
              <td style="padding: 10px 0;">
                <a href="mailto:${encodeURIComponent(data.email)}" style="color: #2563eb; font-weight: 600; text-decoration: none;">${escapeHtml(data.email)}</a>
              </td>
            </tr>
            ${data.phone ? `
            <tr style="border-bottom: 1px solid #f4f4f5;">
              <td style="padding: 10px 0; color: #71717a; font-weight: 600;">Phone Number</td>
              <td style="padding: 10px 0;">
                <a href="tel:${encodeURIComponent(data.phone)}" style="color: #059669; font-weight: 700; text-decoration: none;">${escapeHtml(data.phone)}</a>
              </td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 10px 0; color: #71717a; font-weight: 600; vertical-align: top;">Message</td>
              <td style="padding: 10px 0; color: #27272a; line-height: 1.6; background: #fafafa; padding: 12px 14px; border-radius: 8px;">
                ${escapeHtml(data.message).replace(/\n/g, '<br/>')}
              </td>
            </tr>
          </tbody>
        </table>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-size: 13px; color: #475569;">
          <strong>Quick Action:</strong> Click "Reply" in your email client to respond directly to <strong>${data.name}</strong> at <strong>${data.email}</strong>.
        </div>

        <div style="border-top: 1px solid #f4f4f5; padding-top: 14px; font-size: 11px; color: #a1a1aa; text-align: center;">
          Sent to <strong>${targetEmail}</strong> via NamasteQR Inquiry Pipeline • ${new Date().toLocaleString()}
        </div>
      </div>
    `;

    console.log(`\n========================================`);
    console.log(`💬 [CUSTOMER ENQUIRY DISPATCHED TO ${targetEmail}]`);
    console.log(`   From: ${data.name} (${data.email})`);
    console.log(`   Message: ${data.message.substring(0, 100)}...`);
    console.log(`========================================\n`);

    if (this.transporter && this.isTransporterReady) {
      try {
        const info = await this.transporter.sendMail({
          from: this.fromAddress('NamasteQR Inquiries'),
          to: targetEmail,
          replyTo: `"${data.name}" <${data.email}>`,
          subject,
          text: textBody,
          html: htmlBody,
          headers: {
            'X-Priority': '1 (Highest)',
            'X-MSMail-Priority': 'High',
            'Importance': 'High',
          },
        });
        console.log(`✅ [SMTP SUCCESS] Customer enquiry email delivered to ${targetEmail}. MessageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
      } catch (err: any) {
        console.error(`❌ [SMTP ERROR] Failed to send enquiry email to ${targetEmail}:`, err.message);
      }
    }

    return { success: true, messageId: `dev-enquiry-${Date.now()}` };
  }
}

export const emailService = new EmailService();
