import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'namasteqr_default_secure_jwt_secret_token_2026',
  sessionExpiryDays: parseInt(process.env.SESSION_EXPIRY_DAYS || '7', 10),
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
  
  // OTP Configuration
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),
  otpLength: parseInt(process.env.OTP_LENGTH || '6', 10),
  otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
  otpResendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10),
  otpMaxRequestsPerHour: parseInt(process.env.OTP_MAX_REQUESTS_PER_HOUR || '5', 10),
  
  // Development Mode OTP (only active when explicitly set)
  devOtpMode: process.env.DEV_OTP_MODE !== undefined ? process.env.DEV_OTP_MODE === 'true' : process.env.NODE_ENV !== 'production',

  // WhatsApp Configuration
  whatsapp: {
    provider: (process.env.WHATSAPP_PROVIDER || 'meta') as 'meta' | 'twilio' | 'mock',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    twilioSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioFrom: process.env.TWILIO_WHATSAPP_FROM || '',
    twilioContentSid: process.env.TWILIO_CONTENT_SID || '',
  },

  // Email Configuration (for Password Reset)
  email: {
    provider: process.env.EMAIL_PROVIDER || 'mock',
    host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.EMAIL_PORT || '2525', 10),
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'no-reply@namasteqr.com',
  }
};
