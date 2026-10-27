import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { 
  signupLimiter, 
  loginLimiter, 
  otpVerifyLimiter, 
  otpResendLimiter, 
  forgotPasswordLimiter,
  resetPasswordLimiter,
} from '../middleware/rateLimit.middleware';

const router = Router();

// Public routes with specific strict rate limits
router.post('/signup', signupLimiter, (req, res, next) => authController.signup(req, res, next));
router.post('/verify-email', otpVerifyLimiter, (req, res, next) => authController.verifyEmail(req, res, next));
router.post('/verify-whatsapp', otpVerifyLimiter, (req, res, next) => authController.verifyEmail(req, res, next));
router.post('/verify-otp', otpVerifyLimiter, (req, res, next) => authController.verifyEmail(req, res, next));
router.post('/resend-otp', otpResendLimiter, (req, res, next) => authController.resendOtp(req, res, next));
router.post('/login', loginLimiter, (req, res, next) => authController.login(req, res, next));
router.post('/forgot-password', forgotPasswordLimiter, (req, res, next) => authController.forgotPassword(req, res, next));
router.post('/request-reset', forgotPasswordLimiter, (req, res, next) => authController.forgotPassword(req, res, next));
router.post('/reset-password', resetPasswordLimiter, (req, res, next) => authController.resetPassword(req, res, next));

// Dev helper (only active when devOtpMode is true; strictly disabled in production)
router.get('/dev-info', (req, res) => authController.getDevInfo(req, res));

// Session restoration & termination routes
router.get('/me', optionalAuthenticate, (req, res) => authController.getMe(req as any, res));
router.put('/profile', authenticate, (req, res, next) => authController.updateProfile(req as any, res, next));
router.post('/logout', optionalAuthenticate, (req, res) => authController.logout(req as any, res));

// Audit log management (Strictly authenticated and isolated per tenant)
router.get('/audit-logs', authenticate, (req, res) => authController.getAuditLogs(req as any, res));
router.post('/audit-logs/delete', authenticate, (req, res) => authController.deleteAuditLogs(req as any, res));

export default router;
