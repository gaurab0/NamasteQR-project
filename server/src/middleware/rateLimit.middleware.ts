import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  code?: string;
  keyGenerator?: (req: Request) => string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const clientIp = Array.isArray(ip) ? ip[0] : ip.toString();
    const customKey = options.keyGenerator ? options.keyGenerator(req) : '';
    const key = `${req.path}:${clientIp}:${customKey}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + options.windowMs,
      };
      rateLimitStore.set(key, record);
      return next();
    }

    if (record.count >= options.max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        success: false,
        error: {
          code: options.code || 'RATE_LIMITED',
          message: options.message,
          retryAfterSeconds,
        },
      });
    }

    record.count += 1;
    rateLimitStore.set(key, record);
    next();
  };
}

// Preset rate limiters
export const signupLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,
  message: 'Too many accounts created from this IP. Please try again later.',
  code: 'SIGNUP_RATE_LIMITED',
});

export const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 10,
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
  code: 'LOGIN_RATE_LIMITED',
});

export const otpVerifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 20,
  message: 'Too many verification attempts. Please wait before retrying.',
  code: 'OTP_RATE_LIMITED',
});

export const otpResendLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 6,
  message: 'Too many OTP requests. Please wait an hour before requesting more codes.',
  code: 'OTP_RATE_LIMITED',
});

export const forgotPasswordLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many password reset requests. Please check your email or try again in an hour.',
  code: 'PASSWORD_RESET_RATE_LIMITED',
});
