import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from '../config/env';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // If response headers were already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: firstIssue?.message || 'Invalid input data',
        details: err.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
    });
  }

  // Handle known custom business errors vs 500 internal errors
  const rawStatus = err.statusCode || err.status || (err.name === 'UnauthorizedError' ? 401 : 500);
  const status = typeof rawStatus === 'number' && rawStatus >= 100 && rawStatus < 600 ? rawStatus : 500;

  const isPrismaOrDbError =
    err.name?.startsWith('PrismaClient') ||
    (typeof err.code === 'string' && /^P\d{4}$/.test(err.code)) ||
    (typeof err.message === 'string' && (
      err.message.includes('prisma') ||
      err.message.includes('PostgreSQL') ||
      err.message.includes('relation') ||
      err.message.includes('syntax error at or near')
    ));

  let code = err.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  let message = err.message || 'An unexpected error occurred';

  // Production information disclosure protection:
  // Suppress database internals, raw SQL queries, Prisma traces, and internal 500 details
  if (config.isProduction) {
    if (status >= 500 || isPrismaOrDbError) {
      code = 'INTERNAL_SERVER_ERROR';
      message = 'An unexpected internal server error occurred. Please contact support if the issue persists.';
    }
  } else {
    // In development mode, log the full error for debugging
    console.error(`[Error Handler] ${status} ${code}:`, err);
  }

  // Never leak devOtp in production
  const includeDevOtp = config.devOtpMode && !config.isProduction && err.devOtp;

  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
      ...(includeDevOtp ? { devOtp: err.devOtp } : {}),
    },
  });
}
