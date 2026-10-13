import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { optionalAuthenticate } from '../middleware/auth.middleware';
import { 
  signupLimiter, 
  loginLimiter, 
  otpVerifyLimiter, 
  otpResendLimiter, 
  forgotPasswordLimiter 
} from '../middleware/rateLimit.middleware';

const router = Router();

// Public routes with specific rate limits
router.post('/signup', signupLimiter, (req, res, next) => authController.signup(req, res, next));
router.post('/verify-email', otpVerifyLimiter, (req, res, next) => authController.verifyEmail(req, res, next));
router.post('/verify-whatsapp', otpVerifyLimiter, (req, res, next) => authController.verifyEmail(req, res, next));
router.post('/resend-otp', otpResendLimiter, (req, res, next) => authController.resendOtp(req, res, next));
router.post('/login', loginLimiter, (req, res, next) => authController.login(req, res, next));
router.post('/forgot-password', forgotPasswordLimiter, (req, res, next) => authController.forgotPassword(req, res, next));
router.post('/reset-password', (req, res, next) => authController.resetPassword(req, res, next));

// Dev helper
router.get('/dev-info', (req, res) => authController.getDevInfo(req, res));

// Session restoration & termination routes
router.get('/me', optionalAuthenticate, (req, res) => authController.getMe(req as any, res));
router.post('/logout', optionalAuthenticate, (req, res) => authController.logout(req as any, res));
router.get('/audit-logs', optionalAuthenticate, (req, res) => authController.getAuditLogs(req as any, res));
router.post('/audit-logs/delete', optionalAuthenticate, (req, res) => authController.deleteAuditLogs(req as any, res));

export default router;
