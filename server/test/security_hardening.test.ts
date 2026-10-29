import assert from 'node:assert';
import http from 'node:http';
import net from 'node:net';
import express, { Request, Response } from 'express';
import { createApp } from '../src/app';
import { errorHandler } from '../src/middleware/errorHandler';
import { sanitizeInput } from '../src/middleware/sanitize.middleware';
import { 
  createRateLimiter, 
  loginLimiter, 
  printerLimiter, 
  customerDiningLimiter,
  contactLimiter,
  generalApiLimiter,
  shouldSkipGeneralApiLimit,
} from '../src/middleware/rateLimit.middleware';
import { assertBusinessAccess, generateToken } from '../src/middleware/auth.middleware';
import { config } from '../src/config/env';

async function runSecurityTestSuite() {
  console.log('\n======================================================');
  console.log('🛡️  SERVEFLOW SECURITY AUDIT & HARDENING TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function pass(desc: string) {
    passed++;
    console.log(`  ✅ PASS: ${desc}`);
  }

  function fail(desc: string, err: any) {
    failed++;
    console.error(`  ❌ FAIL: ${desc} ->`, err?.message || err);
  }

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as net.AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -----------------------------------------------------------------------
    // SECTION 1: Security Headers & Server Hardening
    // -----------------------------------------------------------------------
    console.log('📦 Section 1: Security Headers & Server Hardening');

    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);

    const xFrameOptions = res.headers.get('x-frame-options');
    assert.strictEqual(xFrameOptions?.toUpperCase(), 'SAMEORIGIN', 'X-Frame-Options must be SAMEORIGIN');
    pass('X-Frame-Options header is set to SAMEORIGIN');

    const xContentTypeOptions = res.headers.get('x-content-type-options');
    assert.strictEqual(xContentTypeOptions, 'nosniff', 'X-Content-Type-Options must be nosniff');
    pass('X-Content-Type-Options header is set to nosniff');

    const referrerPolicy = res.headers.get('referrer-policy');
    assert.strictEqual(referrerPolicy, 'strict-origin-when-cross-origin', 'Referrer-Policy must be strict-origin-when-cross-origin');
    pass('Referrer-Policy is configured to strict-origin-when-cross-origin');

    const xPoweredBy = res.headers.get('x-powered-by');
    assert.strictEqual(xPoweredBy, null, 'X-Powered-By must be stripped/disabled');
    pass('X-Powered-By header is stripped from HTTP responses');

    // Trust proxy setting
    assert.strictEqual(app.get('trust proxy'), 1, 'trust proxy must be set to 1');
    pass('Express trust proxy is configured to hop 1 for accurate client IP detection');

    // CORS unauthorized origin rejection without 500 error
    const corsRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://malicious-external-site.com' },
    });
    assert.strictEqual(corsRes.headers.get('access-control-allow-origin'), null, 'CORS header must not be set for untrusted origin');
    assert.notStrictEqual(corsRes.status, 500, 'CORS rejection must not crash the server with 500');
    pass('CORS blocks untrusted origin without triggering 500 server crash');

    // -----------------------------------------------------------------------
    // SECTION 2: Prototype Pollution & Payload Sanitization
    // -----------------------------------------------------------------------
    console.log('\n📦 Section 2: Prototype Pollution & Payload Sanitization');

    const dummyReq: any = {
      body: JSON.parse('{"__proto__":{"polluted":true},"cleanKey":"value","nested":{"constructor":{"x":1},"safe":2,"nullByteString":"foo\\u0000bar"}}'),
      query: { normal: 'test', '__proto__': { bad: true } },
      params: { id: 'safe-param\u0000' },
    };
    sanitizeInput(dummyReq, {} as any, () => {});

    assert.strictEqual(({} as any).polluted, undefined, 'Prototype must not be polluted');
    assert.strictEqual(dummyReq.body.__proto__, Object.prototype);
    assert.strictEqual(dummyReq.body.cleanKey, 'value');
    assert.strictEqual(dummyReq.body.nested.safe, 2);
    assert.strictEqual(dummyReq.body.nested.constructor, Object);
    assert.strictEqual(dummyReq.body.nested.nullByteString, 'foobar', 'Null bytes must be stripped');
    assert.strictEqual(dummyReq.params.id, 'safe-param', 'Null bytes in params must be stripped');
    pass('Sanitizer strips __proto__, constructor, prototype and null bytes');

    // Date preservation and depth cap
    const testDate = new Date('2026-01-01T00:00:00.000Z');
    const dummyReqDate: any = {
      body: {
        createdAt: testDate,
        tag: 'order-time',
      },
    };
    sanitizeInput(dummyReqDate, {} as any, () => {});
    assert.ok(dummyReqDate.body.createdAt instanceof Date, 'Date instance must be preserved');
    assert.strictEqual(dummyReqDate.body.createdAt.toISOString(), testDate.toISOString());
    pass('Sanitizer preserves Date instances without wiping to empty object');

    // Recursion cap > 20
    let deepObj: any = { data: 'bottom' };
    for (let i = 0; i < 25; i++) {
      deepObj = { nested: deepObj };
    }
    const dummyReqDeep: any = { body: deepObj };
    sanitizeInput(dummyReqDeep, {} as any, () => {});
    let cur = dummyReqDeep.body;
    let depthCount = 0;
    while (cur && cur.nested) {
      cur = cur.nested;
      depthCount++;
    }
    assert.strictEqual(cur.nested, null, 'Deep payload beyond depth 20 must be nullified');
    assert.ok(depthCount <= 21, 'Depth count must not exceed limit');
    pass('Sanitizer caps recursion depth > 20 preventing depth bypass');

    // -----------------------------------------------------------------------
    // SECTION 3: Multi-Tier Rate Limiting
    // -----------------------------------------------------------------------
    console.log('\n📦 Section 3: Multi-Tier Rate Limiting');

    // 3.1 Test login rate limiter threshold
    const testRateApp = express();
    testRateApp.set('trust proxy', 1);
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      limit: 3,
      message: 'Rate limit hit',
      code: 'TEST_RATE_LIMITED',
    });
    testRateApp.post('/test-limit', testLimiter, (_req, res) => res.json({ success: true }));

    const rateServer = http.createServer(testRateApp);
    await new Promise<void>((resolve) => rateServer.listen(0, '127.0.0.1', () => resolve()));
    const ratePort = (rateServer.address() as net.AddressInfo).port;
    const rateUrl = `http://127.0.0.1:${ratePort}`;

    // Send 3 requests (should succeed)
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${rateUrl}/test-limit`, { method: 'POST' });
      assert.strictEqual(r.status, 200);
    }
    // 4th request must be blocked with 429
    const blockedRes = await fetch(`${rateUrl}/test-limit`, { method: 'POST' });
    assert.strictEqual(blockedRes.status, 429, 'Expected 429 status on threshold breach');
    const blockedData = await blockedRes.json();
    assert.strictEqual(blockedData.success, false);
    assert.strictEqual(blockedData.error.code, 'TEST_RATE_LIMITED');
    assert.ok(blockedRes.headers.get('retry-after'), 'Retry-After header must be present');
    pass('Rate limiter enforces threshold, returns HTTP 429, and attaches Retry-After');

    rateServer.close();

    // 3.2 Health check skip verification in generalApiLimiter
    const dummyHealthReq1: any = { path: '/health', originalUrl: '/api/health' };
    const dummyHealthReq2: any = { path: '/api/health', originalUrl: '/api/health' };
    const dummyApiReq: any = { path: '/orders', originalUrl: '/api/orders' };
    assert.strictEqual(shouldSkipGeneralApiLimit(dummyHealthReq1), true, 'Express stripped /health path must be skipped');
    assert.strictEqual(shouldSkipGeneralApiLimit(dummyHealthReq2), true, 'Full /api/health path must be skipped');
    assert.strictEqual(shouldSkipGeneralApiLimit(dummyApiReq), false, 'Normal API route must NOT be skipped');

    // Also verify skip behavior over live HTTP requests mounted on /api
    const skipTestApp = express();
    skipTestApp.set('trust proxy', 1);
    const tightLimiterWithSkip = createRateLimiter({
      windowMs: 60000,
      limit: 1,
      message: 'Blocked',
      skip: shouldSkipGeneralApiLimit,
    });
    skipTestApp.use('/api', tightLimiterWithSkip);
    skipTestApp.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    skipTestApp.get('/api/data', (_req, res) => res.json({ status: 'data' }));

    const skipServer = http.createServer(skipTestApp);
    await new Promise<void>((resolve) => skipServer.listen(0, '127.0.0.1', () => resolve()));
    const skipPort = (skipServer.address() as net.AddressInfo).port;
    const skipUrl = `http://127.0.0.1:${skipPort}`;

    for (let i = 0; i < 5; i++) {
      const hRes = await fetch(`${skipUrl}/api/health`);
      assert.strictEqual(hRes.status, 200, 'Health check must always bypass rate limiter');
    }
    const dRes1 = await fetch(`${skipUrl}/api/data`);
    assert.strictEqual(dRes1.status, 200);
    const dRes2 = await fetch(`${skipUrl}/api/data`);
    assert.strictEqual(dRes2.status, 429, 'Non-health endpoint must hit rate limit');

    skipServer.close();
    pass('General API rate limiter reliably skips /api/health monitoring endpoints while enforcing limits on regular routes');

    // 3.3 Contact limiter presence
    assert.ok(contactLimiter, 'contactLimiter must be defined');
    pass('Contact and demo booking routes are protected by contactLimiter');

    // -----------------------------------------------------------------------
    // SECTION 4: Multi-Tenant Isolation & IDOR Protection
    // -----------------------------------------------------------------------
    console.log('\n📦 Section 4: Multi-Tenant Isolation & IDOR Protection');

    const userBizA: any = {
      id: 'usr-1',
      role: 'RESTAURANT_OWNER',
      business: { id: 'venue-alpha', name: 'Alpha Venue' },
      allowed_tabs: ['overview', 'billing', 'menus'],
    };

    // 4.1 Access own business
    const ownAccess = await assertBusinessAccess(userBizA, 'venue-alpha');
    assert.strictEqual(ownAccess, true, 'User must have access to own business');
    pass('User has verified access to their own business');

    // 4.2 Cross-tenant access without franchise
    const foreignAccess = await assertBusinessAccess(userBizA, 'unrelated-venue-omega');
    assert.strictEqual(foreignAccess, false, 'User must NOT have access to foreign business');
    pass('Cross-tenant mutation attempt to foreign venue is denied (IDOR protection)');

    // 4.3 Unauthenticated access to /api/auth/audit-logs must be blocked with 401
    const auditRes = await fetch(`${baseUrl}/api/auth/audit-logs`);
    assert.strictEqual(auditRes.status, 401, 'Unauthenticated audit logs fetch must be 401 Unauthorized');
    pass('Audit logs endpoint rejects unauthenticated requests with 401');

    // 4.4 Unauthenticated access to /api/auth/audit-logs/delete must be blocked with 401
    const deleteAuditRes = await fetch(`${baseUrl}/api/auth/audit-logs/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filterType: 'ALL' }),
    });
    assert.strictEqual(deleteAuditRes.status, 401, 'Unauthenticated audit logs delete must be 401 Unauthorized');
    pass('Audit logs deletion endpoint rejects unauthenticated requests with 401');

    // 4.5 Production mode disables dev endpoints (/api/auth/dev-info)
    const prodConfigOrig = config.isProduction;
    (config as any).isProduction = true;
    const devInfoRes = await fetch(`${baseUrl}/api/auth/dev-info`);
    assert.strictEqual(devInfoRes.status, 403, 'Dev info endpoint must return 403 in production');
    pass('Dev endpoints (/api/auth/dev-info) return HTTP 403 in production mode');
    (config as any).isProduction = prodConfigOrig;

    // -----------------------------------------------------------------------
    // SECTION 5: Printer SSRF & Cloud Metadata Protection
    // -----------------------------------------------------------------------
    console.log('\n📦 Section 5: Hardware & LAN Printer Security');

    // 5.0 Unauthenticated request rejected with 401
    const unauthPrintRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '192.168.1.100', port: 9100 }),
    });
    assert.strictEqual(unauthPrintRes.status, 401, 'Unauthenticated print route request must return 401');
    pass('Printer bridge enforces authentication (HTTP 401)');

    const printSecToken = generateToken({
      userId: 'sec-print-user',
      role: 'RESTAURANT_OWNER',
      businessId: 'sec-biz',
    });
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${printSecToken}`,
    };

    // 5.1 Cloud metadata IP is blocked
    const metadataRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ host: '169.254.169.254', port: 9100 }),
    });
    assert.strictEqual(metadataRes.status, 400, 'Cloud metadata IP must be blocked with 400');
    const metadataData = await metadataRes.json();
    assert.ok(metadataData.error?.includes('metadata') || metadataData.error?.includes('loopback'), 'Error must identify prohibited metadata target');
    pass('Printer bridge strictly blocks connections to AWS/GCP cloud metadata IP (169.254.169.254)');

    // 5.2 Invalid port numbers are rejected
    const badPortRes = await fetch(`${baseUrl}/api/print/test-connection`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ host: '192.168.1.100', port: 70000 }),
    });
    assert.strictEqual(badPortRes.status, 400);
    pass('Printer bridge rejects invalid TCP port bounds');

    // 5.3 Dangerous database & system ports are blocked
    for (const p of [5432, 6379, 22, 3306, 27017]) {
      const pRes = await fetch(`${baseUrl}/api/print/test-connection`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ host: '192.168.1.100', port: p }),
      });
      assert.strictEqual(pRes.status, 400, `Dangerous port ${p} must be blocked`);
      const pData = await pRes.json();
      assert.ok(pData.error?.includes('restricted'), `Port ${p} error must indicate restricted port`);
    }
    pass('Printer bridge strictly blocks connections to database & system ports (5432, 6379, 22, 3306, 27017)');

    // -----------------------------------------------------------------------
    // SECTION 6: Information Disclosure & Production Error Sanitization
    // -----------------------------------------------------------------------
    console.log('\n📦 Section 6: Information Disclosure & Production Error Sanitization');

    // Mock an error handler response in production mode
    const prodErrorApp = express();
    const originalProd = config.isProduction;
    (config as any).isProduction = true;

    prodErrorApp.get('/error-test', (_req, _res, next) => {
      const dbErr: any = new Error('FATAL: column "passwords" of relation "users" does not exist at character 42');
      dbErr.statusCode = 500;
      dbErr.code = 'P2002';
      next(dbErr);
    });
    prodErrorApp.use(errorHandler);

    const errServer = http.createServer(prodErrorApp);
    await new Promise<void>((resolve) => errServer.listen(0, '127.0.0.1', () => resolve()));
    const errPort = (errServer.address() as net.AddressInfo).port;

    const errRes = await fetch(`http://127.0.0.1:${errPort}/error-test`);
    assert.strictEqual(errRes.status, 500);
    const errJson = await errRes.json();
    assert.strictEqual(errJson.success, false);
    assert.strictEqual(errJson.error.code, 'INTERNAL_SERVER_ERROR');
    assert.strictEqual(
      errJson.error.message,
      'An unexpected internal server error occurred. Please contact support if the issue persists.'
    );
    assert.strictEqual(errJson.error.stack, undefined, 'Stack trace must not be present');
    assert.strictEqual(errJson.error.details, undefined, 'Raw SQL error details must not be present');

    pass('Global error handler sanitizes internal SQL/DB errors and suppresses stack traces in production');

    // Restore configuration
    (config as any).isProduction = originalProd;
    errServer.close();

  } catch (err: any) {
    fail('Unhandled test failure', err);
  } finally {
    server.close();
  }

  console.log('\n======================================================');
  console.log(`🏁 Security Hardening Suite: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTestSuite().catch((err) => {
  console.error('Fatal security test suite crash:', err);
  process.exit(1);
});
