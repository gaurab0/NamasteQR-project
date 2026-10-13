import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
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

  // Handle known custom business errors
  const status = err.statusCode || err.status || 400;
  const code = err.code || 'BAD_REQUEST';
  const message = err.message || 'An unexpected error occurred';

  // Do not expose stack traces or DB internal errors
  return res.status(status >= 100 && status < 600 ? status : 500).json({
    success: false,
    error: {
      code,
      message,
      ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
      ...(err.devOtp ? { devOtp: err.devOtp } : {}),
    },
  });
}
