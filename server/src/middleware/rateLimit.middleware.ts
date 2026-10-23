import { Request, Response, NextFunction } from 'express';
import { rateLimit, Options } from 'express-rate-limit';

export function createRateLimiter(options: {
  windowMs: number;
  max?: number;
  limit?: number;
  message: string;
  code?: string;
  skip?: (req: Request) => boolean;
  keyGenerator?: (req: Request) => string;
}) {
  const limit = options.limit ?? options.max ?? 100;
  return rateLimit({
    windowMs: options.windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: { trustProxy: false },
    skip: options.skip,
    keyGenerator: options.keyGenerator,
    handler: (req: Request, res: Response, _next: NextFunction, limitOptions: Options) => {
      const retryAfter = res.getHeader('Retry-After');
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : Math.ceil(limitOptions.windowMs / 1000);
      return res.status(limitOptions.statusCode).json({
        success: false,
        error: {
          code: options.code || 'RATE_LIMITED',
          message: options.message,
          retryAfterSeconds,
        },
      });
    },
  });
}

// ---------------------------------------------------------------------------
// 1. Strict Authentication & Sensitive Endpoints Rate Limiters
// ---------------------------------------------------------------------------

export const signupLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 15,
  message: 'Too many accounts created from this IP. Please try again later.',
  code: 'SIGNUP_RATE_LIMITED',
});

export const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 mins
  limit: 15,
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
  code: 'LOGIN_RATE_LIMITED',
});

export const otpVerifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 mins
  limit: 25,
  message: 'Too many verification attempts. Please wait before retrying.',
  code: 'OTP_RATE_LIMITED',
});

export const otpResendLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  message: 'Too many OTP requests. Please wait an hour before requesting more codes.',
  code: 'OTP_RATE_LIMITED',
});

export const forgotPasswordLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  message: 'Too many password reset requests. Please check your email or try again in an hour.',
  code: 'PASSWORD_RESET_RATE_LIMITED',
});

export const resetPasswordLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 15,
  message: 'Too many password reset attempts. Please wait before retrying.',
  code: 'PASSWORD_RESET_RATE_LIMITED',
});

// ---------------------------------------------------------------------------
// 2. Scoped Public Dining / Customer Endpoints Rate Limiter
// ---------------------------------------------------------------------------
// Protects order placement, bill requests, table pings, and waiter service calls
// from automated flood/DoS attacks while allowing normal dining interactions.
export const customerDiningLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  limit: 60,
  message: 'Too many dining requests. Please wait a moment before sending more orders or requests.',
  code: 'DINING_RATE_LIMITED',
});

// ---------------------------------------------------------------------------
// 3. Hardware & LAN Printer Bridge Rate Limiter (/api/print/*)
// ---------------------------------------------------------------------------
// Restricts rapid socket scanning and print flooding across internal LAN targets.
export const printerLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  limit: 60,
  message: 'Printer bridge request limit exceeded. Please wait a moment before submitting more print jobs.',
  code: 'PRINTER_RATE_LIMITED',
});

// ---------------------------------------------------------------------------
// 4. Contact & Demo Enquiry Rate Limiter (/api/contact/*)
// ---------------------------------------------------------------------------
// Mitigates automated email spam and SMTP quota exhaustion.
export const contactLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  message: 'Too many contact/demo requests from this IP. Please wait an hour before submitting again.',
  code: 'CONTACT_RATE_LIMITED',
});

export function shouldSkipGeneralApiLimit(req: Request): boolean {
  const p = req.path || '';
  const orig = req.originalUrl || '';
  return p === '/health' || p === '/api/health' || orig.startsWith('/api/health');
}

// ---------------------------------------------------------------------------
// 5. General API Rate Limiter
// ---------------------------------------------------------------------------
// Broad protection for general authenticated and standard endpoints.
export const generalApiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  limit: 1000,
  message: 'API request limit exceeded. Please reduce request frequency and try again later.',
  code: 'API_RATE_LIMITED',
  skip: shouldSkipGeneralApiLimit,
});

