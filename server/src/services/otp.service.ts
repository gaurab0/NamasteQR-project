import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.service';
import { whatsAppService } from './whatsapp.service';
import { emailService } from './email.service';
import { config } from '../config/env';
import { OtpPurpose } from '../types';

export class OtpService {
  /**
   * Generates a cryptographically random numeric OTP
   */
  generateSecureOtp(length: number = config.otpLength): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const randomInt = crypto.randomInt(min, max + 1);
    return randomInt.toString();
  }

  /**
   * Checks rate limiting for OTP generation
   */
  async checkRateLimit(phone_e164: string, userId: string, purpose: OtpPurpose): Promise<{ allowed: boolean; reason?: string; retryAfterSeconds?: number }> {
    // 1. Resend cooldown check
    const latestOtp = await db.getLatestOtp(userId, purpose);
    if (latestOtp) {
      const timeSinceLastCreation = (Date.now() - latestOtp.created_at.getTime()) / 1000;
      if (timeSinceLastCreation < config.otpResendCooldownSeconds) {
        const waitTime = Math.ceil(config.otpResendCooldownSeconds - timeSinceLastCreation);
        return {
          allowed: false,
          reason: `Please wait ${waitTime} seconds before requesting a new verification code.`,
          retryAfterSeconds: waitTime,
        };
      }
    }

    // 2. Hourly requests limit check
    const oneHourMs = 60 * 60 * 1000;
    const recentRequestsCount = await db.getRecentOtpRequestsCount(phone_e164, oneHourMs);
    if (recentRequestsCount >= config.otpMaxRequestsPerHour) {
      return {
        allowed: false,
        reason: 'Maximum verification code requests exceeded for this hour. Please try again later.',
        retryAfterSeconds: 3600,
      };
    }

    return { allowed: true };
  }

  /**
   * Generates, hashes, stores, and sends an Email & WhatsApp verification code
   */
  async sendOtp(data: {
    userId: string;
    phone_e164: string;
    email?: string;
    businessName?: string;
    purpose: OtpPurpose;
  }): Promise<{ success: boolean; message: string; retryAfterSeconds?: number; devOtp?: string }> {
    // Rate limit checks
    const rateCheck = await this.checkRateLimit(data.phone_e164, data.userId, data.purpose);
    if (!rateCheck.allowed) {
      const error: any = new Error(rateCheck.reason);
      error.code = 'OTP_RATE_LIMITED';
      error.retryAfterSeconds = rateCheck.retryAfterSeconds;
      throw error;
    }

    const rawOtp = this.generateSecureOtp();
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);

    // Save to DB (hashed only!)
    await db.createOtpVerification({
      user_id: data.userId,
      phone_e164: data.phone_e164,
      email: data.email,
      otp_hash: otpHash,
      purpose: data.purpose,
      expires_at: expiresAt,
      rawOtpDev: config.devOtpMode ? rawOtp : undefined,
    });

    // 1. Send via Email Service (Reliable delivery)
    if (data.email) {
      try {
        await emailService.sendVerificationOTP(data.email, rawOtp, data.businessName);
      } catch (err: any) {
        console.warn('Email OTP delivery notice:', err.message);
      }
    }

    // 2. Also attempt WhatsApp service if provider configured
    if (config.whatsapp.accessToken || config.whatsapp.twilioSid) {
      try {
        await whatsAppService.sendVerificationOTP(data.phone_e164, rawOtp);
      } catch (err: any) {
        console.warn('WhatsApp OTP delivery notice:', err.message);
      }
    }

    return {
      success: true,
      message: data.email
        ? `A 6-digit verification code has been dispatched to ${data.email}.`
        : `A 6-digit verification code has been sent.`,
      devOtp: config.devOtpMode ? rawOtp : undefined,
    };
  }

  /**
   * Validates the submitted OTP against the stored hash
   */
  async verifyOtp(data: {
    userId: string;
    otp: string;
    purpose: OtpPurpose;
  }): Promise<{ success: boolean; message: string }> {
    const latestOtp = await db.getLatestOtp(data.userId, data.purpose);

    if (!latestOtp) {
      const error: any = new Error('No active verification code found. Please request a new one.');
      error.code = 'INVALID_OTP';
      throw error;
    }

    // Check if already verified
    if (latestOtp.verified_at) {
      const error: any = new Error('This verification code has already been used.');
      error.code = 'INVALID_OTP';
      throw error;
    }

    // Check expiration
    if (new Date() > latestOtp.expires_at) {
      const error: any = new Error('The verification code has expired. Please request a new code.');
      error.code = 'OTP_EXPIRED';
      throw error;
    }

    // Check max attempts
    if (latestOtp.attempt_count >= config.otpMaxAttempts) {
      const error: any = new Error('Maximum verification attempts exceeded. Please request a new code.');
      error.code = 'OTP_MAX_ATTEMPTS_EXCEEDED';
      throw error;
    }

    // Compare hash
    const isMatch = await bcrypt.compare(data.otp.trim(), latestOtp.otp_hash);

    if (!isMatch) {
      const currentAttempts = await db.incrementOtpAttempt(latestOtp.id);
      const remaining = config.otpMaxAttempts - currentAttempts;
      const error: any = new Error(
        remaining > 0
          ? `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Maximum verification attempts exceeded. Please request a new code.'
      );
      error.code = remaining > 0 ? 'INVALID_OTP' : 'OTP_MAX_ATTEMPTS_EXCEEDED';
      throw error;
    }

    // Mark as verified and invalidate
    await db.markOtpVerified(latestOtp.id);

    return {
      success: true,
      message: 'Phone number verified successfully.',
    };
  }
}

export const otpService = new OtpService();
