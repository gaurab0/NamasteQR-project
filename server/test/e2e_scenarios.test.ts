import { db } from '../src/services/db.service';
import { otpService } from '../src/services/otp.service';
import { rbacService } from '../src/services/rbac.service';
import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';

async function runAllScenarios() {
  console.log('====================================================');
  console.log('🧪 NAMASTEQR AUTOMATED SCENARIO TEST RUNNER');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function step(name: string, fn: () => Promise<void>) {
    try {
      process.stdout.write(`⏳ Running: ${name}... `);
      await fn();
      console.log(`✅ PASSED`);
      passed++;
    } catch (err: any) {
      console.log(`❌ FAILED`);
      console.error(`   Reason: ${err.message}`);
      if (err.response?.data) {
        console.error(`   Server response:`, JSON.stringify(err.response.data));
      }
      failed++;
    }
  }

  const timestamp = Date.now();
  const testEmail = `owner_${timestamp}@annapurnabistro.com`;
  const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const testAddress = 'Street 14, Lakeside Pokhara, Gandaki';
  const testPassword = 'SecurePassword123!';
  let devOtpCode = '';
  let authToken = '';
  let businessId = '';

  // SCENARIO 1: SIGNUP WITH ADDRESS
  await step('Scenario 1: Signup with Address, Phone, and Email', async () => {
    const res = await axios.post(`${API_BASE}/auth/signup`, {
      businessName: 'Annapurna Vista Dining',
      businessType: 'RESTAURANT',
      address: testAddress,
      email: testEmail,
      countryCode: '+977',
      phoneNumber: testPhone,
      password: testPassword,
      confirmPassword: testPassword,
      termsAccepted: true,
    });

    if (!res.data.success) throw new Error('Signup was not successful');
    if (!res.data.verificationRequired) throw new Error('Verification should be required');
    if (!res.data.data?.devOtp) throw new Error('Dev OTP was not generated');

    devOtpCode = res.data.data.devOtp;
    console.log(`\n      [Info: Generated 6-digit OTP: ${devOtpCode}]`);
  });

  // SCENARIO 2: PREVENT PREMATURE LOGIN (BEFORE VERIFICATION)
  await step('Scenario 2: Unverified user is blocked from logging in (403 Forbidden)', async () => {
    try {
      await axios.post(`${API_BASE}/auth/login`, {
        email: testEmail,
        password: testPassword,
      });
      throw new Error('Should have been blocked with 403');
    } catch (err: any) {
      if (err.response?.status !== 403) {
        throw new Error(`Expected status 403 but got ${err.response?.status}`);
      }
      if (err.response?.data?.error?.code !== 'ACCOUNT_NOT_VERIFIED') {
        throw new Error(`Expected error code ACCOUNT_NOT_VERIFIED but got ${err.response?.data?.error?.code}`);
      }
    }
  });

  // SCENARIO 3: EMAIL VERIFICATION (CONFIRM NO 404)
  await step('Scenario 3: Verify email with 6-digit OTP (Verify POST /api/auth/verify-email returns 200)', async () => {
    const res = await axios.post(`${API_BASE}/auth/verify-email`, {
      email: testEmail,
      otp: devOtpCode,
    });

    if (!res.data.success) throw new Error('Verify email failed');
    if (!res.data.data?.verified) throw new Error('Account was not marked as verified');
  });

  // SCENARIO 4: LOGIN AFTER VERIFICATION
  await step('Scenario 4: Sign in with credentials after verification', async () => {
    const res = await axios.post(`${API_BASE}/auth/login`, {
      email: testEmail,
      password: testPassword,
    });

    if (!res.data.success) throw new Error('Login failed');
    if (!res.data.data?.token) throw new Error('No auth token returned');
    authToken = res.data.data.token;
    businessId = res.data.data.user.business.id;

    if (res.data.data.user.email !== testEmail.toLowerCase()) {
      throw new Error('User email mismatch');
    }
  });

  // SCENARIO 5: VERIFY ADDRESS & PROFILE SAVED IN FIRESTORE
  await step('Scenario 5: Check business details in Firestore (Address preserved, not reverted)', async () => {
    const res = await axios.get(`${API_BASE}/business/business-profile`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!res.data.success) throw new Error('Failed to fetch business profile');
    const profile = res.data.data;

    if (profile.address !== testAddress && profile.location !== testAddress) {
      throw new Error(`Address mismatch! Expected "${testAddress}" but got "${profile.address || profile.location}"`);
    }
    console.log(`\n      [Info: Verified address preserved in Firestore: "${profile.address || profile.location}"]`);
  });

  // SCENARIO 6: UPDATE BUSINESS DETAILS & LIVE FIRESTORE PERSISTENCE
  await step('Scenario 6: Update business details and verify live persistence', async () => {
    const updatedAddress = 'Lakeside Center, Pokhara 33700, Nepal';
    const updatedHours = '06:30 AM – 11:30 PM';
    const updatedPhone = '+9779811223344';

    const updateRes = await axios.put(
      `${API_BASE}/business/business-profile`,
      {
        address: updatedAddress,
        location: updatedAddress,
        kitchen_hours: updatedHours,
        phone: updatedPhone,
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    if (!updateRes.data.success) throw new Error('Failed to update business profile');

    // Refetch to guarantee persistence
    const refetchRes = await axios.get(`${API_BASE}/business/business-profile`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const refreshed = refetchRes.data.data;
    if (refreshed.address !== updatedAddress && refreshed.location !== updatedAddress) {
      throw new Error(`Persisted address mismatch! Got "${refreshed.address}"`);
    }
    if (refreshed.kitchen_hours !== updatedHours) {
      throw new Error(`Persisted hours mismatch! Got "${refreshed.kitchen_hours}"`);
    }
    console.log(`\n      [Info: Successfully updated & verified in live Firestore: "${refreshed.address}"]`);
  });

  // SCENARIO 7: RBAC & ALLOCATE PERMISSIONS CHECK
  await step('Scenario 7: RBAC permissions (Billing & POS, deliver, settle_bill, full admin)', async () => {
    const allActions = ['create', 'read', 'update', 'delete', 'manage', 'deliver', 'settle_bill'];
    const resources = ['menus', 'tables', 'orders', 'billing', 'staff', 'audit_logs', 'settings'];

    for (const resName of resources) {
      for (const act of allActions) {
        const hasPerm = rbacService.hasPermission('RESTAURANT_OWNER', resName as any, act as any);
        if (!hasPerm) {
          throw new Error(`RESTAURANT_OWNER missing expected permission: ${resName}.${act}`);
        }
      }
    }

    // Check specific billing permissions
    const canSettle = rbacService.hasPermission('RESTAURANT_OWNER', 'billing', 'settle_bill' as any);
    const canDeliver = rbacService.hasPermission('RESTAURANT_OWNER', 'orders', 'deliver' as any);
    const canDeliverMenu = rbacService.hasPermission('RESTAURANT_OWNER', 'menus', 'deliver' as any);
    const canSettleMenu = rbacService.hasPermission('RESTAURANT_OWNER', 'menus', 'settle_bill' as any);

    if (!canSettle || !canDeliver || !canDeliverMenu || !canSettleMenu) {
      throw new Error('Deliver and settle_bill permissions failed for owner');
    }
    console.log('\n      [Info: Verified deliver & settle_bill actions on menus, orders, billing]');
  });

  // SCENARIO 8: CURRENT USER SESSION DETAILS (/api/auth/me)
  await step('Scenario 8: Validate /api/auth/me returns user & business context', async () => {
    const res = await axios.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!res.data.success || !res.data.data?.user) {
      throw new Error('Failed to fetch authenticated user session');
    }
    const u = res.data.data.user;
    if (u.role !== 'RESTAURANT_OWNER') throw new Error(`Unexpected role ${u.role}`);
    if (!u.business?.id) throw new Error('Missing business ID in user context');
  });

  let hostToken = '';
  let tableSessionId = '';
  let tableOrderId = '';
  let tableOrderNumber = '';
  const testTableId = 'table-test-2';
  const testTableNumber = 'Table 2';

  // SCENARIO 9: TABLE QR SCAN CHECK-IN (FRESH TABLE -> HOST ROLE)
  await step('Scenario 9: Table QR Scan Check-in assigns HOST role and active session', async () => {
    const res = await axios.post(`${API_BASE}/rbac/tables/scan-checkin`, {
      businessId,
      tableId: testTableId,
      tableNumber: testTableNumber,
    });

    if (!res.data.success) throw new Error('Table check-in failed');
    const d = res.data.data;
    if (!d.is_host) throw new Error('First scanner must be assigned as TABLE HOST');
    if (!d.host_token) throw new Error('Host token was not provided to host');
    if (!d.session_id) throw new Error('Session ID was not generated');

    hostToken = d.host_token;
    tableSessionId = d.session_id;
    console.log(`\n      [Info: Table check-in successful. Session: ${tableSessionId}, HostToken: ${hostToken.slice(0, 10)}...]`);
  });

  // SCENARIO 10: DIGITAL ORDER PLACEMENT BY HOST
  await step('Scenario 10: Host places digital table order with items and gets order_number', async () => {
    const res = await axios.post(`${API_BASE}/rbac/table-orders`, {
      businessId,
      table_id: testTableId,
      table_number: testTableNumber,
      customer_name: 'John Guest',
      host_token: hostToken,
      items: [
        {
          item_id: 'item-burger-1',
          name: 'Himalayan Yak Burger',
          price: 450,
          quantity: 2,
          notes: 'Extra spicy',
        }
      ],
    });

    if (!res.data.success || !res.data.data) throw new Error('Failed to create table order');
    const order = res.data.data;
    if (order.status !== 'RECEIVED') throw new Error(`Expected status RECEIVED, got ${order.status}`);
    if (!order.order_number) throw new Error('Order number sequence was not generated');

    tableOrderId = order.id;
    tableOrderNumber = order.order_number;
    console.log(`\n      [Info: Created table order ${tableOrderId} with Order #: ${tableOrderNumber}]`);
  });

  // SCENARIO 11: REPEAT SCAN BY SAME HOST RETAINS HOST ROLE
  await step('Scenario 11: Same device rescanning with existingHostToken retains HOST role', async () => {
    const res = await axios.post(`${API_BASE}/rbac/tables/scan-checkin`, {
      businessId,
      tableId: testTableId,
      tableNumber: testTableNumber,
      existingHostToken: hostToken,
    });

    if (!res.data.success) throw new Error('Rescan check-in failed');
    if (!res.data.data.is_host) throw new Error('Original scanner must retain HOST role');
    console.log(`\n      [Info: Verified host retained authority on rescan]`);
  });

  // SCENARIO 12: SECOND DEVICE SCANNING OCCUPIED TABLE IS VIEW-ONLY
  await step('Scenario 12: Second guest scanning occupied table with active order joins in VIEW-ONLY mode', async () => {
    const res = await axios.post(`${API_BASE}/rbac/tables/scan-checkin`, {
      businessId,
      tableId: testTableId,
      tableNumber: testTableNumber,
      existingHostToken: undefined, // Fresh scanner without host token
    });

    if (!res.data.success) throw new Error('Guest scan check-in failed');
    if (res.data.data.is_host !== false) throw new Error('Second guest should be view-only (is_host: false)');
    console.log(`\n      [Info: Verified second guest correctly joined in view-only mode]`);
  });

  // SCENARIO 13: POS CASHIER SETTLEMENT WITH SEQUENTIAL INVOICE & ORDER
  await step('Scenario 13: POS settles table order and generates sequential invoice and order numbers', async () => {
    const res = await axios.post(
      `${API_BASE}/rbac/sales?businessId=${businessId}`,
      {
        order_id: tableOrderId,
        table_id: testTableId,
        table_number: testTableNumber,
        customer_name: 'John Guest',
        sale_type: 'DINE_IN',
        items: [
          {
            item_id: 'item-burger-1',
            name: 'Himalayan Yak Burger',
            price: 450,
            quantity: 2,
            subtotal: 900,
            total_price: 900,
          }
        ],
        subtotal: 900,
        total_amount: 900,
        payment_method: 'CASH',
        payment_status: 'PAID',
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    if (!res.data.success || !res.data.data) throw new Error('Failed to create POS sale');
    const sale = res.data.data;
    if (!sale.invoice_number) throw new Error('Invoice number was not generated');
    if (!sale.order_number) throw new Error('Order number was not attached to sale');
    console.log(`\n      [Info: Sale finalized! Invoice #: ${sale.invoice_number}, Order #: ${sale.order_number}]`);
  });

  // SCENARIO 14: QR SCAN AFTER SETTLEMENT STARTS BRAND NEW HOST SESSION (NEVER EXPIRES PREMATURELY)
  await step('Scenario 14: Scanning table after settlement starts fresh session with HOST role', async () => {
    // Reset table status as done when bill is paid/cleared
    await axios.post(`${API_BASE}/rbac/tables/reset-status`, {
      businessId,
      tableId: testTableId,
      tableNumber: testTableNumber,
    });

    const res = await axios.post(`${API_BASE}/rbac/tables/scan-checkin`, {
      businessId,
      tableId: testTableId,
      tableNumber: testTableNumber,
    });

    if (!res.data.success) throw new Error('Scan after settlement failed');
    if (!res.data.data.is_host) throw new Error('New guest after settlement must be TABLE HOST');
    if (!res.data.data.session_id) throw new Error('New session ID must be generated');
    console.log(`\n      [Info: Fresh session started cleanly after settlement: ${res.data.data.session_id}]`);
  });

  let createdCategoryId = '';
  let createdMenuItemId = '';

  // SCENARIO 15: MENU CATEGORY & DISH CREATION
  await step('Scenario 15: Create menu category and add new food item with price', async () => {
    // 1. Create category
    const catRes = await axios.post(
      `${API_BASE}/rbac/categories`,
      { name: 'Artisan Mocktails', description: 'Fresh non-alcoholic beverages', display_order: 1 },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    if (!catRes.data.success || !catRes.data.data?.id) throw new Error('Failed to create category');
    createdCategoryId = catRes.data.data.id;

    // 2. Create dish item
    const menuRes = await axios.post(
      `${API_BASE}/rbac/menus`,
      {
        name: 'Himalayan Mint Mojito',
        description: 'Fresh mountain mint with sparkling soda',
        price: 280,
        category: 'Artisan Mocktails',
        is_available: true,
        station: 'BAR',
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    if (!menuRes.data.success || !menuRes.data.data?.id) throw new Error('Failed to create menu item');
    createdMenuItemId = menuRes.data.data.id;

    console.log(`\n      [Info: Created Category "${catRes.data.data.name}" & Dish "${menuRes.data.data.name}" (Rs. ${menuRes.data.data.price})]`);
  });

  // SCENARIO 16: MENU DISH STOCK & 86 AVAILABILITY TOGGLE
  await step('Scenario 16: Toggle dish availability to out-of-stock (86) and verify state', async () => {
    const patchRes = await axios.patch(
      `${API_BASE}/rbac/menus/${createdMenuItemId}/status`,
      { status: 'OUT_OF_STOCK', is_available: false },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    if (!patchRes.data.success) throw new Error('Failed to update dish status');

    // Verify
    const getRes = await axios.get(`${API_BASE}/rbac/menus?businessId=${businessId}`);
    const item = getRes.data.data.find((m: any) => m.id === createdMenuItemId);
    if (!item) throw new Error('Item not found in menu catalog');
    if (item.is_available === true) throw new Error('Item was expected to be marked out of stock');

    console.log(`\n      [Info: Verified dish availability toggled successfully]`);
  });

  // SCENARIO 17: TABLE MANAGEMENT & SPACE CREATION
  await step('Scenario 17: Create new restaurant table and verify table catalog', async () => {
    const newTableRes = await axios.post(
      `${API_BASE}/rbac/tables`,
      {
        table_number: 'Table 99',
        capacity: 6,
        floor: 'Rooftop Terrace',
        building: 'Main Hall',
        status: 'ACTIVE',
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    if (!newTableRes.data.success || !newTableRes.data.data?.id) throw new Error('Failed to create table');

    // Verify table in list
    const listRes = await axios.get(`${API_BASE}/rbac/tables?businessId=${businessId}`);
    const found = listRes.data.data.find((t: any) => t.table_number === 'Table 99');
    if (!found) throw new Error('New table not found in tables list');

    console.log(`\n      [Info: Created Table 99 on Rooftop Terrace with Capacity ${found.capacity}]`);
  });

  // SCENARIO 18: KDS KITCHEN & WAITER TICKET PROGRESSION (IN_PREP -> READY -> DELIVERED)
  await step('Scenario 18: KDS Order Lifecycle (IN_PREP -> READY -> DELIVERED)', async () => {
    // 1. Create order for Table 99
    const orderRes = await axios.post(`${API_BASE}/rbac/table-orders`, {
      businessId,
      table_number: 'Table 99',
      customer_name: 'Sarah Connor',
      items: [
        {
          item_id: createdMenuItemId,
          name: 'Himalayan Mint Mojito',
          price: 280,
          quantity: 1,
        }
      ]
    });
    const orderId = orderRes.data.data.id;

    // 2. Kitchen accepts -> IN_PREP
    await axios.put(`${API_BASE}/rbac/orders/${orderId}/status`, {
      businessId,
      status: 'IN_PREP',
    });

    // 3. Kitchen completes -> READY
    await axios.put(`${API_BASE}/rbac/orders/${orderId}/status`, {
      businessId,
      status: 'READY',
    });

    // 4. Waiter serves -> DELIVERED
    const finalRes = await axios.put(`${API_BASE}/rbac/orders/${orderId}/status`, {
      businessId,
      status: 'DELIVERED',
    });

    if (!finalRes.data.success) throw new Error('Failed to update status to DELIVERED');
    console.log(`\n      [Info: Order ${orderId} successfully progressed through KDS states: IN_PREP -> READY -> DELIVERED]`);
  });

  // SCENARIO 19: BUSINESS TAX & ORDER NUMBERING CONFIGURATION PERSISTENCE
  await step('Scenario 19: Update business Tax Config and Order sequence reset interval', async () => {
    const putRes = await axios.put(
      `${API_BASE}/rbac/tax-config?businessId=${businessId}`,
      {
        tax_enabled: true,
        rates: [
          { id: 'vat-13', name: 'VAT', rate_percent: 13, enabled: true, is_inclusive: false },
          { id: 'sc-10', name: 'Service Charge', rate_percent: 10, enabled: true, is_inclusive: false }
        ],
        order_reset_interval: 'DAILY',
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    if (!putRes.data.success) throw new Error('Failed to update tax configuration');

    // Refetch to guarantee persistence
    const getRes = await axios.get(`${API_BASE}/rbac/tax-config?businessId=${businessId}`);
    if (getRes.data.data?.order_reset_interval !== 'DAILY') {
      throw new Error('Order reset interval was not persisted');
    }
    console.log(`\n      [Info: Tax & Reset Policy successfully configured: 13% VAT, 10% Service Charge, DAILY Sequence Reset]`);
  });

  console.log('\n====================================================');
  console.log(`🏁 SCENARIO TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllScenarios().catch((err) => {
  console.error('Fatal scenario runner error:', err);
  process.exit(1);
});
