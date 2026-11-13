import assert from 'assert';
import http from 'http';
import { createApp } from '../src/app';
import { db } from '../src/services/db.service';
import { prisma } from '../src/lib/prisma';
import { generateToken } from '../src/middleware/auth.middleware';
import { SUPPORTED_LANGUAGES, INCLUDED_LANGUAGES_PARAM } from '../../src/utils/googleTranslate';

async function runTests() {
  console.log('🧪 Starting Customer Language Preference & Translation Test Suite...\n');
  let passed = 0;
  let failed = 0;

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const defaultBiz = await db.getDefaultBusiness();
  const businessId = defaultBiz?.id || 'namaste-bistro';

  // Test 1: Verify all 10 supported languages and their configuration
  try {
    console.log('📦 Test 1: Supported Languages Specifications & Inclusions...');
    assert.strictEqual(SUPPORTED_LANGUAGES.length, 10, 'Must support exactly 10 languages');

    const expectedCodes = ['en', 'ne', 'zh-CN', 'hi', 'ko', 'ja', 'th', 'tl', 'si', 'ta'];
    const actualCodes = SUPPORTED_LANGUAGES.map((l) => l.code);
    assert.deepStrictEqual(actualCodes, expectedCodes, 'Language codes must match the 10 specified languages');

    // Check inclusion param
    assert.strictEqual(INCLUDED_LANGUAGES_PARAM, 'en,ne,zh-CN,hi,ko,ja,th,tl,si,ta');

    // Check native labels
    const ne = SUPPORTED_LANGUAGES.find((l) => l.code === 'ne');
    assert.strictEqual(ne?.nativeLabel, 'नेपाली');
    const zh = SUPPORTED_LANGUAGES.find((l) => l.code === 'zh-CN');
    assert.strictEqual(zh?.nativeLabel, '简体中文');
    const hi = SUPPORTED_LANGUAGES.find((l) => l.code === 'hi');
    assert.strictEqual(hi?.nativeLabel, 'हिन्दी');
    const ko = SUPPORTED_LANGUAGES.find((l) => l.code === 'ko');
    assert.strictEqual(ko?.nativeLabel, '한국어');

    console.log('  ✅ PASS: All 10 languages and native labels accurately configured.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 1:', e.message);
    failed++;
  }

  // Test 2: Database Persistence & db.service for default_language
  try {
    console.log('📦 Test 2: Database Profile Persistence for default_language...');
    const originalLang = defaultBiz?.default_language || 'en';

    // Update to Nepali ('ne')
    const updatedBiz = await db.updateBusinessProfile(businessId, { default_language: 'ne' });
    assert.strictEqual(updatedBiz?.default_language, 'ne', 'default_language should be updated to ne');

    // Retrieve fresh from DB
    const retrieved = await db.findBusinessById(businessId);
    assert.strictEqual(retrieved?.default_language, 'ne', 'retrieved business should have default_language ne');

    // Verify in prisma direct query
    const rawBiz = await prisma.business.findUnique({ where: { id: businessId } });
    assert.strictEqual(rawBiz?.default_language, 'ne', 'PostgreSQL direct record must reflect default_language ne');

    // Revert to original
    await db.updateBusinessProfile(businessId, { default_language: originalLang });
    console.log('  ✅ PASS: default_language persists and syncs cleanly with Supabase PostgreSQL.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 2:', e.message);
    failed++;
  }

  // Test 3: API Endpoints (GET and PUT /api/rbac/business-profile)
  try {
    console.log('📦 Test 3: Business Profile API Endpoints (GET / PUT /api/rbac/business-profile)...');
    const testAdminId = `lang-admin-${Date.now()}`;
    await db.ensureUser({
      id: testAdminId,
      business_id: businessId,
      email: `${testAdminId}@example.com`,
      role: 'RESTAURANT_OWNER',
    });

    const token = generateToken({
      userId: testAdminId,
      role: 'RESTAURANT_OWNER',
      businessId,
    });

    // 1. GET business profile
    const getRes = await fetch(`${baseUrl}/api/rbac/business-profile?businessId=${encodeURIComponent(businessId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getBody: any = await getRes.json();
    assert.strictEqual(getBody.success, true, 'GET /api/rbac/business-profile should succeed');
    assert.ok(getBody.data.default_language !== undefined, 'Response must include default_language');

    // 2. PUT business profile to update default_language to 'zh-CN'
    const putRes = await fetch(`${baseUrl}/api/rbac/business-profile?businessId=${encodeURIComponent(businessId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        default_language: 'zh-CN',
      }),
    });
    const putBody: any = await putRes.json();
    assert.strictEqual(putBody.success, true, 'PUT /api/rbac/business-profile should succeed');
    assert.strictEqual(putBody.data.default_language, 'zh-CN', 'Returned profile must have default_language zh-CN');

    // 3. Verify subsequent GET returns 'zh-CN'
    const getRes2 = await fetch(`${baseUrl}/api/rbac/business-profile?businessId=${encodeURIComponent(businessId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getBody2: any = await getRes2.json();
    assert.strictEqual(getBody2.data.default_language, 'zh-CN', 'Subsequent GET must return default_language zh-CN');

    // Revert back to 'en'
    await fetch(`${baseUrl}/api/rbac/business-profile?businessId=${encodeURIComponent(businessId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ default_language: 'en' }),
    });

    console.log('  ✅ PASS: GET and PUT /api/rbac/business-profile read & write default_language accurately.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 3:', e.message);
    failed++;
  }

  // Test 4: Default language fallback behavior
  try {
    console.log('📦 Test 4: Default language fallback behavior when null or omitted...');
    const bizWithoutLang = {
      id: `biz-no-lang-${Date.now()}`,
      name: 'No Lang Bistro',
    };
    await db.ensureBusiness(bizWithoutLang.id, bizWithoutLang.name);
    const retrieved = await db.findBusinessById(bizWithoutLang.id);
    assert.strictEqual(retrieved?.default_language, 'en', 'Must fallback to en when not set');

    console.log('  ✅ PASS: Default language falls back safely to en.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 4:', e.message);
    failed++;
  }

  // Test 5: Validation of invalid language code in PUT /api/rbac/business-profile
  try {
    console.log('📦 Test 5: Validation of invalid language codes (returns 400 INVALID_LANGUAGE)...');
    const testAdminId = `lang-validator-${Date.now()}`;
    await db.ensureUser({
      id: testAdminId,
      business_id: businessId,
      email: `${testAdminId}@example.com`,
      role: 'RESTAURANT_OWNER',
    });

    const token = generateToken({
      userId: testAdminId,
      role: 'RESTAURANT_OWNER',
      businessId,
    });

    // Try sending an unsupported language code 'fr'
    const invalidRes = await fetch(`${baseUrl}/api/rbac/business-profile?businessId=${encodeURIComponent(businessId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ default_language: 'fr' }),
    });
    const invalidBody: any = await invalidRes.json();
    assert.strictEqual(invalidRes.status, 400, 'Invalid language code must return 400');
    assert.strictEqual(invalidBody.success, false, 'Invalid language response success must be false');
    assert.strictEqual(invalidBody.error.code, 'INVALID_LANGUAGE', 'Error code must be INVALID_LANGUAGE');

    // Try sending script tag injection
    const xssRes = await fetch(`${baseUrl}/api/rbac/business-profile?businessId=${encodeURIComponent(businessId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ default_language: '<script>alert(1)</script>' }),
    });
    assert.strictEqual(xssRes.status, 400, 'XSS language payload must return 400');

    console.log('  ✅ PASS: Invalid language codes properly rejected with 400 INVALID_LANGUAGE.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ FAIL Test 5:', e.message);
    failed++;
  }

  server.close();

  console.log('\n========================================');
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
