import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../services/db.service';
import { otpService } from '../services/otp.service';
import { emailService } from '../services/email.service';
import { auditService } from '../services/audit.service';
import { generateToken, setAuthCookie, clearAuthCookie, AuthenticatedRequest } from '../middleware/auth.middleware';
import { 
  signupSchema, 
  verifyOtpSchema, 
  resendOtpSchema, 
  loginSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema 
} from '../validators/auth.validator';
import { config } from '../config/env';
import { UserRole } from '../types';
import { isOwnerSubject } from '../services/tabAccess';

export class AuthController {
  /**
   * POST /api/auth/signup
   */
  async signup(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = signupSchema.parse(req.body);
      const email = validated.email.toLowerCase().trim();
      const phoneE164 = `${validated.countryCode}${validated.phoneNumber}`;

      // 1. Check email uniqueness
      const existingUser = await db.findUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'An account with this email address already exists. Please log in instead.',
          },
        });
      }

      // 2. Check phone uniqueness
      const existingPhone = await db.findPhoneByE164(phoneE164);
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'PHONE_ALREADY_EXISTS',
            message: 'This phone number is already associated with another business account.',
          },
        });
      }

      // 3. Hash password
      const passwordHash = await bcrypt.hash(validated.password, config.bcryptSaltRounds);

      // 4. Create Business
      const business = await db.createBusiness(validated.businessName, validated.businessType, {
        address: validated.address || '',
        location: validated.address || 'Main Dining & Service Area',
        phone: phoneE164,
      });

      // 5. Determine Role
      const role: UserRole = 
        validated.businessType === 'HOTEL' || validated.businessType === 'RESORT' 
          ? 'HOTEL_OWNER' 
          : 'RESTAURANT_OWNER';

      // 6. Create User (Pending)
      const user = await db.createUser({
        business_id: business.id,
        email,
        password_hash: passwordHash,
        role,
      });

      // 7. Create Phone Verification record
      await db.createPhoneVerification({
        user_id: user.id,
        phone_country_code: validated.countryCode,
        phone_number: validated.phoneNumber,
        phone_e164: phoneE164,
      });

      // 8. Generate & Dispatch OTP
      const otpResult = await otpService.sendOtp({
        userId: user.id,
        phone_e164: phoneE164,
        email: user.email,
        businessName: business.name,
        purpose: 'SIGNUP_VERIFICATION',
      });

      // 9. Account Activity Tracker
      await auditService.logActivity({
        userId: user.id,
        accountName: business.name,
        businessName: business.name,
        email: user.email,
        status: 'OFFLINE',
        eventType: 'ACCOUNT_CREATED',
        req,
      });

      return res.status(201).json({
        success: true,
        message: 'Verification code sent to your email address.',
        verificationRequired: true,
        data: {
          email: user.email,
          phoneE164,
          businessName: business.name,
          businessType: business.business_type,
          devOtp: config.devOtpMode && !config.isProduction ? otpResult.devOtp : undefined,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/verify-email
   */
  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = verifyOtpSchema.parse(req.body);
      const email = validated.email?.trim().toLowerCase() || undefined;
      const phoneE164 = validated.phone_e164?.trim() || undefined;
      
      let user = null;

      if (email) {
        user = await db.findUserByEmail(email);
      }

      if (!user && phoneE164) {
        const pv = await db.findPhoneByE164(phoneE164);
        if (pv?.user_id) {
          user = await db.findUserById(pv.user_id);
        }
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'No pending registration found for this account. Please sign up or verify your details.',
          },
        });
      }

      // Verify OTP
      await otpService.verifyOtp({
        userId: user.id,
        otp: validated.otp,
        purpose: 'SIGNUP_VERIFICATION',
      });

      // Mark email verified & activate account
      await db.updateUserStatus(user.id, 'ACTIVE');
      await db.updateBusinessStatus(user.business_id, 'ACTIVE');
      const business = user.business_id ? await db.findBusinessById(user.business_id) : null;
      // Single-row Account Activity Tracker
      const accountName = business?.name || user.email;
      await auditService.logActivity({
        userId: user.id,
        accountName,
        businessName: business?.name,
        email: user.email,
        status: 'OFFLINE',
        eventType: 'OTP_VERIFIED',
        req,
      });

      return res.status(200).json({
        success: true,
        message: 'Your email has been successfully verified. Please sign in with your credentials.',
        data: {
          verified: true,
          email: user.email,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/resend-otp
   */
  async resendOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = resendOtpSchema.parse(req.body);
      const email = validated.email?.trim().toLowerCase() || undefined;
      const phoneE164 = validated.phone_e164?.trim() || undefined;

      let user = null;
      let phone = null;

      if (email) {
        user = await db.findUserByEmail(email);
      }

      if (!user && phoneE164) {
        const pv = await db.findPhoneByE164(phoneE164);
        if (pv?.user_id) {
          user = await db.findUserById(pv.user_id);
        }
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'No account found matching this information.',
          },
        });
      }

      if (user.status === 'ACTIVE') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'ALREADY_VERIFIED',
            message: 'Your account is already verified. You can log in directly.',
          },
        });
      }

      phone = await db.findPhoneByUserId(user.id);
      const resolvedPhoneE164 = phone ? phone.phone_e164 : (phoneE164 || '+9779800000000');
      const business = await db.findBusinessById(user.business_id);
      const otpResult = await otpService.sendOtp({
        userId: user.id,
        phone_e164: resolvedPhoneE164,
        email: user.email,
        businessName: business?.name,
        purpose: 'SIGNUP_VERIFICATION',
      });

      await auditService.log({
        userId: user.id,
        businessId: user.business_id,
        eventType: 'OTP_SENT',
        req,
      });

      return res.status(200).json({
        success: true,
        message: 'A fresh verification code has been dispatched to your email address.',
        data: {
          phoneE164: resolvedPhoneE164,
          cooldownSeconds: config.otpResendCooldownSeconds,
          devOtp: config.devOtpMode && !config.isProduction ? otpResult.devOtp : undefined,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = loginSchema.parse(req.body);
      const email = validated.email.toLowerCase().trim();

      let user = await db.findUserByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email address or password.',
          },
        });
      }

      const passwordMatch = Boolean(user.password_hash && user.password_hash.trim().length > 0) && (await bcrypt.compare(validated.password, user.password_hash));
      if (!passwordMatch) {
        await auditService.log({ userId: user.id, businessId: user.business_id, eventType: 'LOGIN_FAILED', req });
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email address or password.',
          },
        });
      }

      if (user.status === 'PENDING_VERIFICATION') {
        const phone = await db.findPhoneByUserId(user.id);
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_NOT_VERIFIED',
            message: 'Please verify your email address before logging in.',
            data: {
              email: user.email,
              phoneE164: phone?.phone_e164 || '',
            },
          },
        });
      }

      if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_SUSPENDED',
            message: 'Your account is suspended. Please contact platform support.',
          },
        });
      }

      let phone = await db.findPhoneByUserId(user.id);
      if (!phone) {
        phone = await db.createPhone(user.id, '+977', '9800000000', '+9779800000000', true);
      }

      // Update last login
      await db.updateLastLogin(user.id);

      const business = await db.findBusinessById(user.business_id);
      const token = generateToken({ 
        userId: user.id, 
        role: user.role,
        email: user.email,
        businessId: business?.id || user.business_id,
        businessName: business?.name,
        businessType: business?.business_type,
      });
      setAuthCookie(res, token, validated.rememberMe);

      const accountName = business?.name || user.email;
      await auditService.logActivity({
        userId: user.id,
        accountName,
        businessName: business?.name,
        email: user.email,
        status: 'ONLINE',
        eventType: 'LOGGED_IN',
        req,
      });

      return res.status(200).json({
        success: true,
        message: 'Login successful.',
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name || (user.email ? user.email.split('@')[0] : 'User'),
            created_at: user.created_at,
            role: user.role,
            status: user.status,
            allowed_tabs: await db.ensureAllowedTabsPersisted(user),
            business: {
              id: business?.id,
              name: business?.name,
              type: business?.business_type,
              status: business?.status,
              tagline: business?.tagline || '',
              location: business?.location || '',
              address: business?.address || '',
              kitchen_hours: business?.kitchen_hours || '',
              phone: business?.phone || '',
              menu_theme_config: business?.menu_theme_config,
            },
            phone: {
              countryCode: phone.phone_country_code,
              number: phone.phone_number,
              e164: phone.phone_e164,
              isVerified: phone.is_verified,
            },
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/auth/me
   */
  async getMe(req: AuthenticatedRequest, res: Response) {
    if (req.user) {
      await auditService.logActivity({
        userId: req.user.id,
        accountName: req.user.business?.name || req.user.email,
        businessName: req.user.business?.name,
        email: req.user.email,
        status: 'ONLINE',
        eventType: 'ACTIVE_SESSION',
        req,
      });
    }

    const clientUser = req.user ? { ...req.user } : undefined;
    if (clientUser && 'acting_as' in clientUser) {
      delete (clientUser as any).acting_as;
    }

    return res.status(200).json({
      success: true,
      data: {
        user: clientUser,
      },
    });
  }

  /**
   * PUT /api/auth/profile
   */
  async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please log in to continue.',
          },
        });
      }

      const { name } = req.body || {};
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_NAME',
            message: 'Display name must be between 1 and 80 characters.',
          },
        });
      }

      const trimmedName = name.trim();
      const updatedUser = await db.updateUserName(req.user.id, trimmedName);
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User account not found.',
          },
        });
      }

      req.user.name = updatedUser.name;

      await auditService.logActivity({
        userId: req.user.id,
        accountName: req.user.business?.name || req.user.email,
        businessName: req.user.business?.name,
        businessId: req.user.business?.id,
        email: req.user.email,
        status: 'ONLINE',
        eventType: 'PROFILE_UPDATED',
        req,
      });

      const clientUser = {
        ...req.user,
        name: updatedUser.name,
        created_at: req.user.created_at || updatedUser.created_at,
      };
      if ('acting_as' in clientUser) {
        delete (clientUser as any).acting_as;
      }

      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully.',
        data: {
          user: clientUser,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/logout
   */
  async logout(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.id || req.body?.userId || null;
    const accountName = req.user?.business?.name || req.body?.accountName || req.user?.email || req.body?.email || 'NamasteQR Account';
    const email = req.user?.email || req.body?.email || null;

    if (userId || email) {
      await auditService.logActivity({
        userId: userId || email || 'unknown',
        accountName,
        businessName: req.user?.business?.name,
        email,
        status: 'OFFLINE',
        eventType: 'LOGGED_OUT',
        req,
      });
    }

    clearAuthCookie(res);
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  }

  /**
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = forgotPasswordSchema.parse(req.body);
      const email = validated.email.toLowerCase().trim();

      const user = await db.findUserByEmail(email);

      let devResetLink: string | undefined;

      if (user) {
        const { token } = await emailService.createPasswordResetToken({
          id: user.id,
          email: user.email,
        });

        await emailService.sendPasswordResetEmail(user.email, token);

        if (config.devOtpMode) {
          devResetLink = `/reset-password/${token}?email=${encodeURIComponent(user.email)}`;
        }

        await auditService.log({
          userId: user.id,
          businessId: user.business_id,
          eventType: 'PASSWORD_RESET_REQUESTED',
          req,
        });
      }

      // Security rule: Never reveal whether an email exists
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email address, you will receive password-reset instructions.',
        data: {
          devResetLink: config.devOtpMode && !config.isProduction ? devResetLink : undefined,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/reset-password
   */
  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = resetPasswordSchema.parse(req.body);
      const email = validated.email.toLowerCase().trim();

      const user = await db.findUserByEmail(email);
      if (!user) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired password reset token.',
          },
        });
      }

      const activeTokenRecord = await emailService.verifyPasswordResetToken(user.id, validated.token);
      if (!activeTokenRecord) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid, expired, or already used password reset token.',
          },
        });
      }

      // Hash new password & update
      const newHash = await bcrypt.hash(validated.password, config.bcryptSaltRounds);
      await db.updateUserPassword(user.id, newHash);
      await db.markPasswordResetTokenUsed(activeTokenRecord.id);

      await auditService.log({
        userId: user.id,
        businessId: user.business_id,
        eventType: 'PASSWORD_RESET_COMPLETED',
        req,
      });

      return res.status(200).json({
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/auth/dev-info (Development only)
   */
  async getDevInfo(req: Request, res: Response) {
    if (!config.devOtpMode || config.isProduction) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not available in production' } });
    }

    const phone = req.query.phone as string;
    const email = req.query.email as string;

    const devOtp = db.getDevOtp(phone, email);
    const devToken = email ? db.getDevResetToken(email) : null;

    return res.status(200).json({
      success: true,
      data: {
        devOtp,
        devToken,
        mode: 'DEV_OTP_MODE',
        database: db.getDbStatus(),
      },
    });
  }

  /**
   * GET /api/auth/audit-logs
   */

  async deleteAuditLogs(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }

      const businessId = req.user.business?.id;
      if (!businessId) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No business context associated with account' } });
      }

      const isOwner = isOwnerSubject(req.user);
      const hasConfig = req.user.allowed_tabs?.includes('configurations');
      if (!isOwner && !hasConfig) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Permission denied: Only business owners or staff with configurations permission can delete audit logs.',
          },
        });
      }

      const { userId, email, filterType, date } = req.body;
      const result = await db.deleteAuditLogs(userId, email, businessId, filterType, date);
      return res.status(200).json({ success: true, message: 'Logs deleted', deletedCount: result.deletedCount });
    } catch (error: any) {
      console.error('Delete audit logs error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async getAuditLogs(req: AuthenticatedRequest, res: Response) {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const businessId = req.user.business?.id;
    const userId = req.user.id;
    const email = req.user.email;

    await auditService.logActivity({
      userId: req.user.id,
      accountName: req.user.business?.name || req.user.email,
      businessName: req.user.business?.name,
      email: req.user.email,
      status: 'ONLINE',
      eventType: 'ACTIVE_SESSION',
      req,
    });

    const logs = await db.getAuditLogs(userId, email, businessId);
    return res.status(200).json({
      success: true,
      data: {
        logs,
      },
    });
  }
}

export const authController = new AuthController();
