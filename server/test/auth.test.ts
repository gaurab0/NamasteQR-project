import bcrypt from 'bcryptjs';
import { db } from '../src/services/db.service';
import { otpService } from '../src/services/otp.service';
import { emailService } from '../src/services/email.service';
import { signupSchema, loginSchema, verifyOtpSchema, resetPasswordSchema } from '../src/validators/auth.validator';
import { generateToken } from '../src/middleware/auth.middleware';
import jwt from 'jsonwebtoken';
import { config } from '../src/config/env';
import { authController } from '../src/controllers/auth.controller';

// Standalone automated test runner that can run via `npm test`
async function runTests() {
  console.log('🧪 Starting NamasteQR Authentication Test Suite...\n');
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
      businessName: 'Royal Palace Bistro',
      businessType: 'RESTAURANT',
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
    const business = await db.createBusiness('Grand Mirage Bistro', 'RESTAURANT');
    const passwordHash = await bcrypt.hash('Secure123!@#', 10);
    const user = await db.createUser({
      business_id: business.id,
      email: 'manager@grandmirage.com',
      password_hash: passwordHash,
      role: 'RESTAURANT_OWNER',
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

  await test('Signup verification consumes the OTP and activates the user and business together', async () => {
    const business = await db.createBusiness('Atomic Verify Bistro', 'RESTAURANT');
    const user = await db.createUser({
      business_id: business.id,
      email: `verify-${Date.now()}@example.com`,
      password_hash: await bcrypt.hash('Secure123!', 10),
      role: 'RESTAURANT_OWNER',
    });
    const rawOtp = '123456';
    const otp = await db.createOtpVerification({
      user_id: user.id,
      phone_e164: `+1555${Date.now().toString().slice(-7)}`,
      email: user.email,
      otp_hash: await bcrypt.hash(rawOtp, 10),
      purpose: 'SIGNUP_VERIFICATION',
      expires_at: new Date(Date.now() + 60_000),
    });
    const checked = await otpService.verifyOtp({
      userId: user.id,
      otp: rawOtp,
      purpose: 'SIGNUP_VERIFICATION',
      consume: false,
    });
    await db.completeEmailVerification(user.id, business.id, checked.otpId);
    const activeUser = await db.findUserById(user.id);
    const activeBusiness = await db.findBusinessById(business.id);
    const consumed = await db.getLatestOtp(user.id, 'SIGNUP_VERIFICATION');
    if (activeUser?.status !== 'ACTIVE' || activeBusiness?.status !== 'ACTIVE' || !consumed?.verified_at) {
      throw new Error('User, business, and OTP were not completed together.');
    }
    if (consumed.id !== otp.id) throw new Error('Verification consumed a different OTP record.');
  });

  console.log('\n🚪 Testing 3: Authentication & Session Token');

  await test('Generates and verifies JWT token for authenticated user', async () => {
    const token = generateToken({
      userId: 'u47a11c8-2b87-4321-b328-91c64e52a001',
      role: 'RESTAURANT_OWNER',
    });
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    if (decoded.userId !== 'u47a11c8-2b87-4321-b328-91c64e52a001') {
      throw new Error('JWT payload mismatch');
    }
  });

  console.log('\n🔑 Testing 4: Password Reset Token Workflow');

  await test('Generates cryptographically random reset token, hashes, and validates', async () => {
    const biz = await db.createBusiness('Reset Test Bistro', 'RESTAURANT');
    const user = await db.createUser({
      business_id: biz.id,
      email: `reset-test-${Date.now()}@example.com`,
      password_hash: await bcrypt.hash('SecurePassword123!', 10),
      role: 'RESTAURANT_OWNER',
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

  console.log('\n👤 Testing 5: User Profile & Display Name');

  await test('db.updateUserName updates and persists display name', async () => {
    const biz = await db.createBusiness('Profile Test Restro', 'RESTAURANT');
    const user = await db.createUser({
      business_id: biz.id,
      email: `profile-test-${Date.now()}@example.com`,
      password_hash: await bcrypt.hash('SecurePassword123!', 10),
      role: 'RESTAURANT_OWNER',
    });

    const updated = await db.updateUserName(user.id, 'Chef Gordon');
    if (!updated) throw new Error('updateUserName returned null');
    if (updated.name !== 'Chef Gordon') throw new Error(`Expected name 'Chef Gordon', got '${updated.name}'`);

    const fetched = await db.findUserById(user.id);
    if (!fetched || fetched.name !== 'Chef Gordon') throw new Error(`Fetched user did not have updated name`);
  });

  await test('authController.updateProfile validates input and updates name', async () => {
    const biz = await db.createBusiness('Controller Test Restro', 'RESTAURANT');
    const user = await db.createUser({
      business_id: biz.id,
      email: `controller-test-${Date.now()}@example.com`,
      password_hash: await bcrypt.hash('SecurePassword123!', 10),
      role: 'RESTAURANT_OWNER',
    });

    // 1. Unauthorized if req.user missing
    let unauthStatusCode = 0;
    const mockRes1: any = {
      status: (code: number) => {
        unauthStatusCode = code;
        return { json: (data: any) => data };
      },
    };
    await authController.updateProfile({ body: { name: 'New Name' } } as any, mockRes1, (() => {}) as any);
    if (unauthStatusCode !== 401) throw new Error(`Expected 401 for missing user, got ${unauthStatusCode}`);

    // 2. Invalid name (empty or whitespace)
    let badNameCode = 0;
    let badNameError = '';
    const mockRes2: any = {
      status: (code: number) => {
        badNameCode = code;
        return {
          json: (data: any) => {
            badNameError = data?.error?.code;
            return data;
          },
        };
      },
    };
    const authReq: any = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        business: { id: biz.id, name: biz.name },
      },
      body: { name: '   ' },
    };
    await authController.updateProfile(authReq, mockRes2, (() => {}) as any);
    if (badNameCode !== 400 || badNameError !== 'INVALID_NAME') {
      throw new Error(`Expected 400 INVALID_NAME for empty name, got ${badNameCode} ${badNameError}`);
    }

    // 3. Valid name update
    let successCode = 0;
    let responseData: any = null;
    const mockRes3: any = {
      status: (code: number) => {
        successCode = code;
        return {
          json: (data: any) => {
            responseData = data;
            return data;
          },
        };
      },
    };
    authReq.body = { name: 'Master Chef Ram' };
    await authController.updateProfile(authReq, mockRes3, (() => {}) as any);
    if (successCode !== 200 || responseData?.data?.user?.name !== 'Master Chef Ram') {
      throw new Error(`Expected 200 with name 'Master Chef Ram', got ${successCode} ${JSON.stringify(responseData)}`);
    }

    // 4. Over 80 characters rejected
    let tooLongCode = 0;
    const mockRes4: any = {
      status: (code: number) => {
        tooLongCode = code;
        return { json: (data: any) => data };
      },
    };
    authReq.body = { name: 'A'.repeat(81) };
    await authController.updateProfile(authReq, mockRes4, (() => {}) as any);
    if (tooLongCode !== 400) {
      throw new Error(`Expected 400 for 81-character name, got ${tooLongCode}`);
    }

    // 5. Non-string types rejected
    let nonStringCode = 0;
    const mockRes5: any = {
      status: (code: number) => {
        nonStringCode = code;
        return { json: (data: any) => data };
      },
    };
    authReq.body = { name: 12345 };
    await authController.updateProfile(authReq, mockRes5, (() => {}) as any);
    if (nonStringCode !== 400) {
      throw new Error(`Expected 400 for non-string name, got ${nonStringCode}`);
    }

    // 6. Unicode / multi-byte Nepali name & emojis accepted
    let unicodeCode = 0;
    let unicodeData: any = null;
    const mockRes6: any = {
      status: (code: number) => {
        unicodeCode = code;
        return {
          json: (data: any) => {
            unicodeData = data;
            return data;
          },
        };
      },
    };
    authReq.body = { name: 'शेफ राजाराम (Chef Ram) 👨‍🍳' };
    await authController.updateProfile(authReq, mockRes6, (() => {}) as any);
    if (unicodeCode !== 200 || unicodeData?.data?.user?.name !== 'शेफ राजाराम (Chef Ram) 👨‍🍳') {
      throw new Error(`Expected 200 with unicode name, got ${unicodeCode} ${JSON.stringify(unicodeData)}`);
    }

    // 7. Unknown user returns 404
    let notFoundCode = 0;
    const mockRes7: any = {
      status: (code: number) => {
        notFoundCode = code;
        return { json: (data: any) => data };
      },
    };
    const unknownReq: any = {
      user: { id: 'non-existent-user-uuid', email: 'ghost@example.com' },
      body: { name: 'Ghost' },
    };
    await authController.updateProfile(unknownReq, mockRes7, (() => {}) as any);
    if (notFoundCode !== 404) {
      throw new Error(`Expected 404 for non-existent user, got ${notFoundCode}`);
    }
  });

  await test('authController.getMe returns user name and created_at', async () => {
    const biz = await db.createBusiness('GetMe Test Restro', 'RESTAURANT');
    const user = await db.createUser({
      business_id: biz.id,
      email: `getme-test-${Date.now()}@example.com`,
      password_hash: await bcrypt.hash('SecurePassword123!', 10),
      role: 'RESTAURANT_OWNER',
      name: 'Chef Auguste',
    });

    let meStatusCode = 0;
    let meData: any = null;
    const mockRes: any = {
      status: (code: number) => {
        meStatusCode = code;
        return {
          json: (data: any) => {
            meData = data;
            return data;
          },
        };
      },
    };

    const req: any = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
        role: user.role,
        status: user.status,
        business: { id: biz.id, name: biz.name },
      },
    };

    await authController.getMe(req, mockRes);
    if (meStatusCode !== 200) throw new Error(`Expected 200 from getMe, got ${meStatusCode}`);
    if (meData?.data?.user?.name !== 'Chef Auguste') {
      throw new Error(`Expected name 'Chef Auguste', got '${meData?.data?.user?.name}'`);
    }
    if (!meData?.data?.user?.created_at) {
      throw new Error(`Expected created_at to be present in getMe response`);
    }
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
