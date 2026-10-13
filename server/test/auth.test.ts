import bcrypt from 'bcryptjs';
import { db } from '../src/services/db.service';
import { otpService } from '../src/services/otp.service';
import { emailService } from '../src/services/email.service';
import { signupSchema, loginSchema, verifyOtpSchema, resetPasswordSchema } from '../src/validators/auth.validator';
import { generateToken } from '../src/middleware/auth.middleware';
import jwt from 'jsonwebtoken';
import { config } from '../src/config/env';

// Standalone automated test runner that can run via `npm test`
async function runTests() {
  console.log('🧪 Starting ServeFlow Authentication Test Suite...\n');
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  console.log('📦 Testing 1: Signup Validation & Unique Constraints');

  await test('Valid signup payload passes schema validation', async () => {
    const validData = {
      businessName: 'Royal Palace Resort',
      businessType: 'RESORT',
      email: 'owner@royalpalace.com',
      countryCode: '+977',
      phoneNumber: '9841234567',
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
      termsAccepted: true,
    };
    const result = signupSchema.safeParse(validData);
    if (!result.success) throw new Error('Schema validation should succeed: ' + JSON.stringify(result.error));
  });

  await test('Weak password without uppercase/special char is rejected', async () => {
    const weakData = {
      businessName: 'Test Cafe',
      businessType: 'CAFE',
      email: 'test@cafe.com',
      countryCode: '+1',
      phoneNumber: '4155552671',
      password: 'weakpassword',
      confirmPassword: 'weakpassword',
      termsAccepted: true,
    };
    const result = signupSchema.safeParse(weakData);
    if (result.success) throw new Error('Weak password should be rejected');
  });

  await test('Mismatched passwords fail validation', async () => {
    const mismatchData = {
      businessName: 'Test Cafe',
      businessType: 'CAFE',
      email: 'test@cafe.com',
      countryCode: '+1',
      phoneNumber: '4155552671',
      password: 'Password123!',
      confirmPassword: 'DifferentPassword123!',
      termsAccepted: true,
    };
    const result = signupSchema.safeParse(mismatchData);
    if (result.success) throw new Error('Mismatched passwords should be rejected');
  });

  console.log('\n🔐 Testing 2: Email OTP Verification Flow');

  await test('Generates, hashes and stores 6-digit OTP', async () => {
    const business = await db.createBusiness('Grand Mirage Hotel', 'HOTEL');
    const passwordHash = await bcrypt.hash('Secure123!@#', 10);
    const user = await db.createUser({
      business_id: business.id,
      email: 'manager@grandmirage.com',
      password_hash: passwordHash,
      role: 'HOTEL_OWNER',
    });
    await db.createPhoneVerification({
      user_id: user.id,
      phone_country_code: '+1',
      phone_number: '5551234567',
      phone_e164: '+15551234567',
    });

    const sendRes = await otpService.sendOtp({
      userId: user.id,
      phone_e164: '+15551234567',
      purpose: 'SIGNUP_VERIFICATION',
    });

    if (!sendRes.success || !sendRes.devOtp) throw new Error('OTP send failed');
    if (sendRes.devOtp.length !== 6) throw new Error('OTP must be 6 digits');

    // Test verifying with wrong OTP
    let failedAsExpected = false;
    try {
      await otpService.verifyOtp({
        userId: user.id,
        otp: '000000',
        purpose: 'SIGNUP_VERIFICATION',
      });
    } catch (e: any) {
      if (e.code === 'INVALID_OTP') failedAsExpected = true;
    }
    if (!failedAsExpected) throw new Error('Wrong OTP should be rejected with INVALID_OTP');

    // Test verifying with correct OTP
    const verifyRes = await otpService.verifyOtp({
      userId: user.id,
      otp: sendRes.devOtp,
      purpose: 'SIGNUP_VERIFICATION',
    });
    if (!verifyRes.success) throw new Error('Correct OTP verification failed');
  });

  console.log('\n🚪 Testing 3: Authentication & Session Token');

  await test('Generates and verifies JWT token for authenticated user', async () => {
    const token = generateToken({
      userId: 'u47a11c8-2b87-4321-b328-91c64e52a001',
      role: 'HOTEL_OWNER',
    });
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    if (decoded.userId !== 'u47a11c8-2b87-4321-b328-91c64e52a001') {
      throw new Error('JWT payload mismatch');
    }
  });

  console.log('\n🔑 Testing 4: Password Reset Token Workflow');

  await test('Generates cryptographically random reset token, hashes, and validates', async () => {
    const biz = await db.createBusiness('Reset Test Resort', 'RESORT');
    const user = await db.createUser({
      business_id: biz.id,
      email: `reset-test-${Date.now()}@example.com`,
      password_hash: await bcrypt.hash('SecurePassword123!', 10),
      role: 'HOTEL_OWNER',
    });

    const { token } = await emailService.createPasswordResetToken({
      id: user.id,
      email: user.email,
    });

    const activeRecord = await emailService.verifyPasswordResetToken(user.id, token);
    if (!activeRecord) throw new Error('Failed to verify active reset token');

    // Invalidate
    await db.markPasswordResetTokenUsed(activeRecord.id);
    const reused = await emailService.verifyPasswordResetToken(user.id, token);
    if (reused) throw new Error('Used reset token should not be accepted again');
  });

  console.log(`\n========================================`);
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv[1]?.includes('auth.test.ts')) {
  runTests().catch((err) => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
  });
}
