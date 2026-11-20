import http from 'node:http';
import net from 'node:net';
import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';
import { createApp } from '../src/app';
import { generateToken } from '../src/middleware/auth.middleware';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runQuickAvailabilityTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 QUICK ITEM AVAILABILITY & BULK RESET TEST SUITE');
  console.log('======================================================\n');

  const bizId = `test-avail-${Date.now()}`;
  const adminId = `admin-${bizId}`;
  const testUser = { id: adminId, role: 'OWNER', email: `owner@${bizId}.com` };

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as net.AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const token = generateToken({
    userId: adminId,
    role: 'OWNER',
    email: `owner@${bizId}.com`,
    businessId: bizId,
  });

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await db.ensureBusiness(bizId, 'Quick Availability Test Cafe');
        break;
      } catch (e: any) {
        if (attempt === 3) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    const cat = await rbacService.createCategory(bizId, { name: 'Desserts', order: 0 }, testUser);

    // 1. Create an item with variants
    const dessert = await rbacService.createMenuItem(bizId, {
      name: 'Chocolate Lava Cake',
      category: 'Desserts',
      category_id: cat.id,
      price: 250,
      status: 'available',
      is_available: true,
      has_variants: true,
      variants: [
        { id: 'v-single', name: 'Single Scoop', price: 250, is_available: true, status: 'available' },
        { id: 'v-double', name: 'Double Scoop', price: 350, is_available: true, status: 'available' },
      ],
    }, testUser);

    // 2. Create another item
    const tea = await rbacService.createMenuItem(bizId, {
      name: 'Masala Chai',
      category: 'Desserts',
      category_id: cat.id,
      price: 50,
      status: 'available',
      is_available: true,
    }, testUser);

    console.log('📦 Test 1: Toggle single variant to out_of_stock via API');
    const toggleVarRes = await fetch(`${baseUrl}/api/menus/${dessert.id}/status?businessId=${bizId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        variant_id: 'v-single',
        status: 'out_of_stock',
      }),
    });
    const toggleVarJson = await toggleVarRes.json();
    assert(toggleVarRes.ok && toggleVarJson.success, 'Successfully toggled variant status to out_of_stock');

    const freshDessert = await prisma.menuItem.findUnique({ where: { id: dessert.id } });
    const singleVar = (freshDessert?.variants as any[])?.find((v: any) => v.id === 'v-single');
    const doubleVar = (freshDessert?.variants as any[])?.find((v: any) => v.id === 'v-double');
    assert(singleVar?.is_available === false && singleVar?.status === 'out_of_stock', 'Single Scoop is marked out_of_stock');
    assert(doubleVar?.is_available === true && doubleVar?.status === 'available', 'Double Scoop is still available');
    assert(freshDessert?.is_available === true, 'Parent item is still available because one variant is active');

    console.log('\n📦 Test 2: Toggle entire item to unavailable');
    const toggleItemRes = await fetch(`${baseUrl}/api/menus/${tea.id}/status?businessId=${bizId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'unavailable',
        is_available: false,
      }),
    });
    const toggleItemJson = await toggleItemRes.json();
    assert(toggleItemRes.ok && toggleItemJson.success, 'Successfully toggled item status to unavailable');

    const freshTea = await prisma.menuItem.findUnique({ where: { id: tea.id } });
    assert(freshTea?.is_available === false && freshTea?.status === 'unavailable', 'Masala Chai is marked unavailable');

    console.log('\n📦 Test 3: Bulk Make All Available');
    const bulkRes = await fetch(`${baseUrl}/api/menus/availability/bulk-available?businessId=${bizId}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    const bulkJson = await bulkRes.json();
    assert(bulkRes.ok && bulkJson.success, 'Bulk available API returned success');
    assert(bulkJson.count >= 2, `Bulk reset updated at least 2 items (updated: ${bulkJson.count})`);

    const resetDessert = await prisma.menuItem.findUnique({ where: { id: dessert.id } });
    const resetSingleVar = (resetDessert?.variants as any[])?.find((v: any) => v.id === 'v-single');
    const resetTea = await prisma.menuItem.findUnique({ where: { id: tea.id } });

    assert(resetDessert?.is_available === true && resetDessert?.status === 'available', 'Dessert is available');
    assert(resetSingleVar?.is_available === true && resetSingleVar?.status === 'available', 'Single Scoop variant is restored to available');
    assert(resetTea?.is_available === true && resetTea?.status === 'available', 'Masala Chai is restored to available');

    console.log('\n======================================================');
    console.log(`🏁 RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

runQuickAvailabilityTestSuite().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
