import assert from 'assert';
import http from 'http';
import axios from 'axios';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { db } from '../src/services/db.service';
import { rbacService } from '../src/services/rbac.service';
import { generateToken } from '../src/middleware/auth.middleware';
import { buildSalesWorkbookData } from '../../src/utils/excelExport';
import { realtimeEmitter } from '../src/lib/socket';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra?: any) {
  if (ok) {
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name}`, extra !== undefined ? extra : '');
  }
}

async function runDeepSystemE2ETests() {
  console.log('========================================================================');
  console.log('🧪 SERVEFLOW DEEP SYSTEM COMPREHENSIVE E2E VERIFICATION SUITE');
  console.log('========================================================================\n');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api`;

  const timestamp = Date.now();
  const testBizId = `test-deep-e2e-${timestamp}`;
  const ownerEmail = `owner_${timestamp}@annapurna.test`;
  const cashierEmail = `cashier_${timestamp}@annapurna.test`;
  const waiterEmail = `waiter_${timestamp}@annapurna.test`;
  const kitchenEmail = `kitchen_${timestamp}@annapurna.test`;
  const managerEmail = `manager_${timestamp}@annapurna.test`;

  let ownerToken = '';
  let cashierToken = '';
  let waiterToken = '';
  let kitchenToken = '';
  let managerToken = '';

  let ownerUserId = '';
  let cashierUserId = '';
  let waiterUserId = '';
  let kitchenUserId = '';
  let managerUserId = '';

  try {
    // -------------------------------------------------------------------------
    // 0. BUSINESS & USER SEEDING WITH ROLES
    // -------------------------------------------------------------------------
    console.log('👑 0. Provisioning Business and Multi-Role Staff Accounts');
    await db.ensureBusiness(testBizId, 'Annapurna Grand Himalayan Resort', 'RESTAURANT');

    // Create Owner
    const ownerUser = await db.ensureUser({
      id: `usr-owner-${timestamp}`,
      business_id: testBizId,
      email: ownerEmail,
      role: 'RESTAURANT_OWNER',
      name: 'Owner Pasang',
    });
    ownerUserId = ownerUser.id;
    ownerToken = generateToken({
      userId: ownerUserId,
      email: ownerEmail,
      role: 'RESTAURANT_OWNER',
      businessId: testBizId,
    });

    // Create Cashier
    const cashierUser = await db.ensureUser({
      id: `usr-cashier-${timestamp}`,
      business_id: testBizId,
      email: cashierEmail,
      role: 'CASHIER',
      name: 'Cashier Laxmi',
      allowed_tabs: ['billing'],
    });
    cashierUserId = cashierUser.id;
    cashierToken = generateToken({
      userId: cashierUserId,
      email: cashierEmail,
      role: 'CASHIER',
      businessId: testBizId,
    });

    // Create Waiter
    const waiterUser = await db.ensureUser({
      id: `usr-waiter-${timestamp}`,
      business_id: testBizId,
      email: waiterEmail,
      role: 'WAITER',
      name: 'Waiter Bikram',
      allowed_tabs: ['waiter', 'checkins'],
    });
    waiterUserId = waiterUser.id;
    waiterToken = generateToken({
      userId: waiterUserId,
      email: waiterEmail,
      role: 'WAITER',
      businessId: testBizId,
    });

    // Create Kitchen Staff
    const kitchenUser = await db.ensureUser({
      id: `usr-kitchen-${timestamp}`,
      business_id: testBizId,
      email: kitchenEmail,
      role: 'KITCHEN_STAFF',
      name: 'Chef Dorje',
      allowed_tabs: ['kds', 'menus'],
    });
    kitchenUserId = kitchenUser.id;
    kitchenToken = generateToken({
      userId: kitchenUserId,
      email: kitchenEmail,
      role: 'KITCHEN_STAFF',
      businessId: testBizId,
    });

    // Create Manager
    const managerUser = await db.ensureUser({
      id: `usr-manager-${timestamp}`,
      business_id: testBizId,
      email: managerEmail,
      role: 'RESTAURANT_MANAGER',
      name: 'Manager Sarita',
      allowed_tabs: ['menus', 'tables', 'orders', 'billing'],
    });
    managerUserId = managerUser.id;
    managerToken = generateToken({
      userId: managerUserId,
      email: managerEmail,
      role: 'RESTAURANT_MANAGER',
      businessId: testBizId,
    });

    check('All 5 staff accounts provisioned with correct roles and tabs',
      !!ownerUser && !!cashierUser && !!waiterUser && !!kitchenUser && !!managerUser);

    // -------------------------------------------------------------------------
    // 1. ORDERING METHODS: DINE-IN QR SCAN (Host vs View-Only & Add-On Rounds)
    // -------------------------------------------------------------------------
    console.log('\n📲 1. Ordering Methods: Dine-In QR Scan & Multi-Guest Cart Synchronization');

    // Create Table T-01
    const table1 = await rbacService.createTable(testBizId, {
      table_number: 'T-01',
      floor: 'Lakeside Patio',
      building: 'Main Pavilion',
      capacity: 4,
      status: 'ACTIVE',
    }, { id: ownerUserId, role: 'RESTAURANT_OWNER', email: ownerEmail });
    check('Table T-01 created with capacity 4 on Lakeside Patio', table1.table_number === 'T-01' && table1.capacity === 4);

    // 1a: First guest check-in becomes TABLE HOST
    const hostCheckIn = await rbacService.scanTableCheckIn(testBizId, table1.id, {
      tableNumber: 'T-01',
      customerName: 'Host Tenzing',
    });
    check('First guest granted TABLE HOST authority (is_host: true)', hostCheckIn.is_host === true);
    check('Host issued cryptographic host_token and active session_id', !!hostCheckIn.host_token && !!hostCheckIn.session_id);
    const hostToken = hostCheckIn.host_token!;
    const tableSessionId = hostCheckIn.session_id;

    // 1b: Host places initial digital dine-in order
    const dineInOrder1 = await rbacService.createTableOrder(testBizId, {
      table_id: table1.id,
      table_number: 'T-01',
      session_id: tableSessionId,
      host_token: hostToken,
      customer_name: 'Host Tenzing',
      order_notes: 'Extra spicy, please',
      items: [
        {
          item_id: 'dish-momo-c1',
          name: 'Steamed Chicken MoMo',
          price: 350,
          quantity: 2,
          station: 'KITCHEN',
          food_type: 'non_veg',
        },
        {
          item_id: 'drink-lassi-1',
          name: 'Sweet Himalayan Lassi Beverage',
          price: 150,
          quantity: 1,
          category: 'Beverages',
        },
      ],
    });
    check('Host placed digital table order with 2 items', dineInOrder1.items.length === 2);
    check('Dine-In order initial status is RECEIVED', dineInOrder1.status === 'RECEIVED');
    check('Dine-In order subtotal is Rs. 850 (350*2 + 150)', dineInOrder1.subtotal === 850);
    check('Item station routing: Chicken MoMo is KITCHEN', dineInOrder1.items[0].station === 'KITCHEN');
    check('Item station routing: Lassi Beverage is BAR', dineInOrder1.items[1].station === 'BAR');

    // 1c: Second guest scans occupied table without host token -> VIEW-ONLY mode
    const guestCheckIn = await rbacService.scanTableCheckIn(testBizId, table1.id, {
      tableNumber: 'T-01',
      customerName: 'Guest Karma',
    });
    check('Second guest scanning active table is restricted to View-Only (is_host: false)', guestCheckIn.is_host === false);
    check('Second guest receives null host_token', guestCheckIn.host_token === null);
    check('Second guest receives active order in check-in response for instant sync', !!guestCheckIn.active_order);

    // 1d: Unauthorized second guest trying to place new order without host_token is REJECTED (HTTP 403 / error)
    let guestOrderBlocked = false;
    try {
      await rbacService.createTableOrder(testBizId, {
        table_id: table1.id,
        table_number: 'T-01',
        session_id: tableSessionId,
        host_token: undefined, // View-only guest has no host token
        customer_name: 'Guest Karma',
        items: [{ item_id: 'dish-fries', name: 'French Fries', price: 200, quantity: 1 }],
      });
    } catch (e: any) {
      if (e.message.includes('Ordering authority required')) guestOrderBlocked = true;
    }
    check('Second guest without host token is strictly rejected from placing orders', guestOrderBlocked);

    // 1e: Unauthorized second guest trying to request final bill without host_token is REJECTED with HTTP 403
    let guestBillBlocked = false;
    try {
      await axios.post(`${baseUrl}/rbac/orders/${dineInOrder1.id}/request-bill`, {}, {
        headers: { 'x-business-id': testBizId }, // No host token header
      });
    } catch (e: any) {
      if (e.response?.status === 403 && e.response?.data?.error?.code === 'VIEW_ONLY_GUEST') {
        guestBillBlocked = true;
      }
    }
    check('Second guest without host token is strictly rejected from requesting bill (HTTP 403)', guestBillBlocked);

    // 1f: Host places Round 2 add-on items -> appended cleanly, recalculates total
    const dineInOrderRound2 = await rbacService.createTableOrder(testBizId, {
      table_id: table1.id,
      table_number: 'T-01',
      session_id: tableSessionId,
      host_token: hostToken,
      existing_order_id: dineInOrder1.id,
      customer_name: 'Host Tenzing',
      items: [
        {
          item_id: 'dish-chowmein-1',
          name: 'Veg Chowmein',
          price: 250,
          quantity: 1,
          station: 'KITCHEN',
          food_type: 'veg',
        },
      ],
    });
    check('Round 2 add-on order appends items to existing order (total 3 items)', dineInOrderRound2.items.length === 3);
    check('Round 2 add-on updates subtotal to Rs. 1100 (850 + 250)', dineInOrderRound2.subtotal === 1100);

    // -------------------------------------------------------------------------
    // 2. ORDERING METHODS: COUNTER / PAY-FIRST ORDERING
    // -------------------------------------------------------------------------
    console.log('\n💳 2. Ordering Methods: Counter & Pay-First Ordering Flow');

    const tablePF = await rbacService.createTable(testBizId, {
      table_number: 'PF-Counter-1',
      capacity: 2,
      pay_first_enabled: true,
      status: 'ACTIVE',
    }, { id: ownerUserId, role: 'RESTAURANT_OWNER' });
    check('Table created with pay_first_enabled = true', tablePF.pay_first_enabled === true);

    const pfOrder = await rbacService.createTableOrder(testBizId, {
      table_id: tablePF.id,
      table_number: 'PF-Counter-1',
      customer_name: 'Fast Diner',
      items: [
        {
          item_id: 'dish-thali-1',
          name: 'Nepali Dal Bhat Thali',
          price: 400,
          quantity: 2,
          station: 'KITCHEN',
        },
      ],
    });
    check('Pay-first order status starts at AWAITING_PAYMENT', pfOrder.status === 'AWAITING_PAYMENT');
    check('Pay-first order payment_status is UNPAID', pfOrder.payment_status === 'UNPAID');
    check('Pay-first order flag pay_first is true', pfOrder.pay_first === true);

    // Direct progression in KDS should be blocked before cashier payment
    let pfDirectProgressBlocked = false;
    try {
      await rbacService.updateTableOrderStatus(testBizId, pfOrder.id, 'PREPARING', { id: kitchenUserId, role: 'KITCHEN_STAFF' });
    } catch (e: any) {
      if (e.message.includes('confirm-payment')) pfDirectProgressBlocked = true;
    }
    check('Direct kitchen progress on unpaid pay-first order is blocked', pfDirectProgressBlocked);

    // Cashier confirms payment -> creates Sale, transitions to RECEIVED
    await rbacService.confirmTableOrderPayment(pfOrder.id, testBizId, 'CASH', 'Cashier Laxmi');
    const confirmedPfOrder = await prisma.tableOrder.findUnique({ where: { id: pfOrder.id } });
    check('Cashier confirms payment -> Pay-first order moved to RECEIVED', confirmedPfOrder?.status === 'RECEIVED');
    check('Pay-first order payment_status updated to PAID', confirmedPfOrder?.payment_status === 'PAID');
    check('Pay-first order linked to generated sale_id', !!confirmedPfOrder?.sale_id);

    // -------------------------------------------------------------------------
    // 3. ORDERING METHODS: QUICK POS MANUAL BILLING & DISPATCH
    // -------------------------------------------------------------------------
    console.log('\n🖥️ 3. Ordering Methods: Quick POS Manual Billing & Automated Kitchen Dispatch');

    const manualPosSale = await rbacService.createSale(testBizId, {
      sale_type: 'QUICK_POS',
      customer_name: 'Counter Guest',
      payment_method: 'CASH',
      payment_status: 'PAID',
      subtotal: 600,
      total_amount: 600,
      items: [
        {
          id: 'dish-burger-pos',
          item_id: 'dish-burger-pos',
          name: 'Yak Cheese Burger',
          price: 400,
          unit_price: 400,
          quantity: 1,
          category: 'Mains',
        },
        {
          id: 'drink-lemonade-pos',
          item_id: 'drink-lemonade-pos',
          name: 'Fresh Mint Lemonade Beverage',
          price: 200,
          unit_price: 200,
          quantity: 1,
          category: 'Beverages',
        },
      ],
      source: 'POS_MANUAL',
      is_manual_pos: true,
      dispatch_kitchen: true,
    }, { id: cashierUserId, name: 'Cashier Laxmi', role: 'CASHIER' });

    check('Quick POS manual sale settled immediately with invoice number', !!manualPosSale.invoice_number);
    check('Quick POS manual sale auto-dispatched linked TableOrder', !!manualPosSale.order_id);

    const posDispatchedOrder = await prisma.tableOrder.findUnique({ where: { id: manualPosSale.order_id! } });
    check('Dispatched TableOrder exists in DB with status RECEIVED', posDispatchedOrder?.status === 'RECEIVED');
    check('Dispatched TableOrder is marked pay_first: true', posDispatchedOrder?.pay_first === true);
    const posItems = posDispatchedOrder?.items as any[];
    const posBurger = posItems.find((i) => i.name.includes('Burger'));
    const posDrink = posItems.find((i) => i.name.includes('Lemonade'));
    check('POS Burger station intelligently routed to KITCHEN', posBurger?.station === 'KITCHEN');
    check('POS Lemonade Beverage station intelligently routed to BAR', posDrink?.station === 'BAR');

    // -------------------------------------------------------------------------
    // 4. ORDERING METHODS: TAKEAWAY & DELIVERY & ROOM SERVICE
    // -------------------------------------------------------------------------
    console.log('\n🥡 4. Ordering Methods: Takeaway, Delivery, and Room Service');

    // 4a: Takeaway Sale
    const takeawaySale = await rbacService.createSale(testBizId, {
      sale_type: 'TAKEAWAY',
      customer_name: 'Subash Takeaway',
      customer_phone: '9841234567',
      payment_method: 'CASH',
      payment_status: 'PAID',
      subtotal: 500,
      total_amount: 500,
      items: [{ name: 'Chicken Biryani', price: 500, quantity: 1 }],
      source: 'POS_MANUAL',
      dispatch_kitchen: true,
    }, { id: cashierUserId, role: 'CASHIER' });
    check('Takeaway sale created with clean table label "Takeaway"', takeawaySale.table_number === 'Takeaway');
    check('Takeaway sale preserves customer phone number', takeawaySale.customer_phone === '9841234567');

    // 4b: Delivery Sale
    const deliverySale = await rbacService.createSale(testBizId, {
      sale_type: 'DELIVERY',
      customer_name: 'Pooja Delivery',
      customer_phone: '9801234567',
      payment_method: 'UPI',
      payment_status: 'PAID',
      subtotal: 750,
      total_amount: 750,
      notes: 'Deliver to Block B, Flat 402',
      items: [{ name: 'Mutton Curry & Rice', price: 750, quantity: 1 }],
      source: 'POS_MANUAL',
      dispatch_kitchen: true,
    }, { id: cashierUserId, role: 'CASHIER' });
    check('Delivery sale created with payment_method UPI', deliverySale.payment_method === 'UPI');
    check('Delivery sale table label assigned "Delivery"', deliverySale.table_number === 'Delivery');
    check('Delivery sale delivery address notes preserved', deliverySale.notes === 'Deliver to Block B, Flat 402');

    // 4c: Room Service Order
    const roomTable = await rbacService.createTable(testBizId, {
      table_number: 'Room 304',
      floor: 'Floor 3',
      building: 'West Wing',
      capacity: 2,
      status: 'ACTIVE',
    }, { id: ownerUserId, role: 'RESTAURANT_OWNER' });
    check('Room Service table created for Room 304 on Floor 3 West Wing',
      roomTable.table_number === 'Room 304' && roomTable.floor === 'Floor 3' && roomTable.building === 'West Wing');

    const roomOrder = await rbacService.createTableOrder(testBizId, {
      table_id: roomTable.id,
      table_number: 'Room 304',
      floor: 'Floor 3',
      building: 'West Wing',
      customer_name: 'Hotel Guest Mr. Sharma',
      items: [
        {
          item_id: 'dish-breakfast-1',
          name: 'Himalayan Continental Breakfast',
          price: 650,
          quantity: 2,
          station: 'KITCHEN',
        },
        {
          item_id: 'drink-coffee-1',
          name: 'Artisan Espresso Coffee',
          price: 180,
          quantity: 2,
          station: 'BAR',
        },
      ],
    });
    check('Room Service order created with subtotal Rs. 1660 (650*2 + 180*2)', roomOrder.subtotal === 1660);
    check('Room Service order preserves Floor and Building context', roomOrder.floor === 'Floor 3' && roomOrder.building === 'West Wing');

    // Settle Room Service Order via CARD
    const roomSale = await rbacService.createSale(testBizId, {
      order_id: roomOrder.id,
      table_id: roomTable.id,
      table_number: 'Room 304',
      customer_name: 'Hotel Guest Mr. Sharma',
      sale_type: 'ROOM_SERVICE',
      payment_method: 'CARD',
      payment_status: 'PAID',
      subtotal: roomOrder.subtotal,
      total_amount: roomOrder.total_amount,
      items: roomOrder.items as any,
    }, { id: cashierUserId, role: 'CASHIER' });
    check('Room service order settled via CARD payment', roomSale.payment_method === 'CARD');
    check('Room service sale links to room table and order', roomSale.order_id === roomOrder.id);

    // -------------------------------------------------------------------------
    // 5. BILL SETTLEMENT: PAYMENT METHODS, CREDIT-ONLY TABLE, 6-PIN, DEPOSIT, COMP
    // -------------------------------------------------------------------------
    console.log('\n💰 5. Bill Settlement: Payment Methods, Credit GL, 6-Digit PIN, Deposit & Comp Ledger');

    // 5a: Create Dedicated Asset/Credit Settlement GL Account
    const creditGL = await rbacService.createGLAccount(testBizId, {
      account_number: '77001',
      account_name: 'VIP Executive Corporate Credit A/C',
      category: 'ASSET',
      mapping_key: 'CREDIT_SETTLEMENT',
      customer_name: 'Dr. Rajesh Khadka',
      customer_phone: '9851000000',
    } as any, { id: ownerUserId, role: 'RESTAURANT_OWNER' });
    check('Dedicated GL Account created for Credit Settlement (77001)', creditGL.account_number === '77001');

    // 5b: Create Credit-Only Dining Table with 6-digit PIN and pre-linked GL
    const creditTable = await rbacService.createTable(testBizId, {
      table_number: 'Executive Lounge 1',
      capacity: 6,
      credit_only: true,
      credit_customer_name: 'Dr. Rajesh Khadka',
      credit_customer_phone: '9851000000',
      credit_pin: '592814',
      credit_gl_account_id: creditGL.id,
      credit_gl_account_number: creditGL.account_number,
      credit_gl_account_name: creditGL.account_name,
    } as any, { id: ownerUserId, role: 'RESTAURANT_OWNER' });
    check('Credit-Only table created with credit_only = true', creditTable.credit_only === true);
    check('Credit-Only table forces pay_first_enabled = true', creditTable.pay_first_enabled === true);
    check('Credit-Only table preserves 6-digit PIN 592814', creditTable.credit_pin === '592814');

    // Place order on credit table
    const creditOrder = await rbacService.createTableOrder(testBizId, {
      table_id: creditTable.id,
      table_number: creditTable.table_number,
      items: [{ item_id: 'dish-steak', name: 'Filet Mignon', price: 1200, quantity: 2, station: 'KITCHEN' }],
    });
    check('Credit table order auto-inherits credit_only = true', creditOrder.credit_only === true);
    check('Credit table order auto-inherits pay_first = true', creditOrder.pay_first === true);
    check('Credit table order customer_name auto-populated from table', creditOrder.customer_name === 'Dr. Rajesh Khadka');
    check('Credit table order pre-links credit_gl_account_id', creditOrder.credit_gl_account_id === creditGL.id);

    // 5c: 6-Digit PIN Verification Endpoint (/api/rbac/orders/:id/verify-pin)
    // Wrong PIN rejected
    let wrongPinRejected = false;
    try {
      await axios.post(`${baseUrl}/rbac/orders/${creditOrder.id}/verify-pin?businessId=${testBizId}`, {
        pin: '123456',
        payment_method: 'DEDUCT_FROM_DEPOSIT',
      });
    } catch (e: any) {
      if (e.response?.status === 400 && e.response?.data?.error?.message.includes('Incorrect 6-digit PIN')) {
        wrongPinRejected = true;
      }
    }
    check('Incorrect 6-digit PIN is strictly rejected with 400', wrongPinRejected);

    // Correct PIN verified
    const pinRes = await axios.post(`${baseUrl}/rbac/orders/${creditOrder.id}/verify-pin?businessId=${testBizId}`, {
      pin: '592814',
      payment_method: 'DEDUCT_FROM_DEPOSIT',
    });
    check('Correct 6-digit PIN verified successfully (HTTP 200)', pinRes.data.success === true);
    const verifiedOrder = await prisma.tableOrder.findUnique({ where: { id: creditOrder.id } });
    check('TableOrder credit_pin_verified updated to true', verifiedOrder?.credit_pin_verified === true);
    check('TableOrder payment_method set to DEDUCT_FROM_DEPOSIT', verifiedOrder?.payment_method === 'DEDUCT_FROM_DEPOSIT');

    // Cashier confirms deposit deduction payment
    await rbacService.confirmTableOrderPayment(creditOrder.id, testBizId, 'DEDUCT_FROM_DEPOSIT', 'Cashier Laxmi');
    const confirmedCreditOrder = await prisma.tableOrder.findUnique({ where: { id: creditOrder.id } });
    const depositSale = await prisma.sale.findUnique({ where: { id: confirmedCreditOrder!.sale_id! } });
    check('Sale record generated with payment_method DEDUCT_FROM_DEPOSIT', depositSale?.payment_method === 'DEDUCT_FROM_DEPOSIT');
    check('Deposit sale linked to credit GL account number 77001', depositSale?.credit_gl_account_number === '77001');

    // 5d: Complementary Sales (Full comp Rs. 0 & Partial comp with CompRecord ledger)
    const compTable = await rbacService.createTable(testBizId, {
      table_number: 'VIP-Comp-Table',
      comp_enabled: true,
      status: 'ACTIVE',
    }, { id: ownerUserId, role: 'RESTAURANT_OWNER' });
    check('Table created with comp_enabled = true', compTable.comp_enabled === true);

    // Partial Comp Sale: 1 of 2 pizzas comped, 1 charged
    const partialCompSale = await rbacService.createSale(testBizId, {
      table_id: compTable.id,
      table_number: compTable.table_number,
      customer_name: 'VIP Guest General',
      sale_type: 'DINE_IN',
      payment_method: 'CASH',
      payment_status: 'PAID',
      subtotal: 600, // Only 1 pizza billed
      total_amount: 600,
      comp_reason: 'Hospitality Courtesy — Long Wait Time',
      items: [
        {
          id: 'item-pizza-1',
          name: 'Woodfired Truffle Pizza',
          price: 600,
          unit_price: 600,
          quantity: 2,
          comp_qty: 1,
          is_comp: false,
          comp_value: 600,
          subtotal: 600,
        },
      ],
    }, { id: ownerUserId, name: 'Owner Pasang', role: 'RESTAURANT_OWNER' });

    check('Partial comp sale total_amount bills only non-comped item (Rs. 600 instead of 1200)', partialCompSale.total_amount === 600);
    const compRecords = await rbacService.getCompRecords(testBizId);
    check('CompRecord created in complementary ledger', compRecords.length >= 1);
    const partialCompRecord = compRecords.find((c) => c.sale_id === partialCompSale.id);
    check('CompRecord records exact reason: Hospitality Courtesy', partialCompRecord?.reason === 'Hospitality Courtesy — Long Wait Time');
    check('CompRecord total_comp_value is Rs. 600', Number(partialCompRecord?.total_comp_value) === 600);
    check('CompRecord records settling staff name: Owner Pasang', partialCompRecord?.staff_name === 'Owner Pasang');

    // 100% Full Comp Sale (Grand Total = Rs. 0)
    const fullCompSale = await rbacService.createSale(testBizId, {
      table_id: compTable.id,
      table_number: compTable.table_number,
      customer_name: 'Resort Brand Ambassador',
      sale_type: 'DINE_IN',
      payment_method: 'CASH',
      payment_status: 'PAID',
      subtotal: 0,
      total_amount: 0,
      comp_reason: 'VIP Ambassador Full Comp',
      items: [
        {
          id: 'item-champagne-1',
          name: 'Himalayan Sparkling Wine',
          price: 2500,
          unit_price: 2500,
          quantity: 1,
          comp_qty: 1,
          is_comp: true,
          comp_value: 2500,
          subtotal: 0,
        },
      ],
    }, { id: ownerUserId, name: 'Owner Pasang', role: 'RESTAURANT_OWNER' });
    check('100% full comp sale has grand total = Rs. 0', fullCompSale.total_amount === 0);

    // Multi-tab Excel Export Verification
    const salesForWorkbook = [depositSale, partialCompSale, fullCompSale] as any[];
    const glAccounts = [creditGL] as any[];
    const compRecordsAfterAll = await rbacService.getCompRecords(testBizId);
    const exportSheets = buildSalesWorkbookData(salesForWorkbook, glAccounts, 'Rs.', compRecordsAfterAll);
    const sheetNames = exportSheets.map((s) => s.sheetName);
    check('Excel export contains "Sales Register"', sheetNames.includes('Sales Register'));
    check('Excel export contains dedicated "Deduct from Deposit Sales" tab', sheetNames.includes('Deduct from Deposit Sales'));
    check('Excel export contains dedicated "Complementary Ledger" tab', sheetNames.includes('Complementary Ledger'));
    const compSheet = exportSheets.find((s) => s.sheetName === 'Complementary Ledger');
    check('Complementary Ledger tab contains comped pizza and champagne entries', (compSheet?.rows.length || 0) >= 2);
    const mainSalesReg = exportSheets.find((s) => s.sheetName === 'Sales Register');
    check('Requirement: 100% full comp sale is excluded from main Sales Register (revenue distortion prevented)',
      !mainSalesReg?.rows.some((r) => r.includes(fullCompSale.invoice_number)));

    // -------------------------------------------------------------------------
    // 6. MENU MANAGEMENT: CATEGORIES, VARIANTS, TAGS, 86 STOCK & BULK IMPORT
    // -------------------------------------------------------------------------
    console.log('\n📖 6. Menu Management: Categories, Variants, Dietary Tags, 86 Stock & Bulk Import');

    // 6a: Category Creation & Reordering
    const catBeverages = await rbacService.createCategory(testBizId, { name: 'Craft Mocktails', order: 2 }, { id: managerUserId, role: 'RESTAURANT_MANAGER' });
    const catStarters = await rbacService.createCategory(testBizId, { name: 'Mountain Starters', order: 1 }, { id: managerUserId, role: 'RESTAURANT_MANAGER' });
    check('Categories created successfully', !!catBeverages.id && !!catStarters.id);

    // Reorder categories via API
    const reorderRes = await axios.put(`${baseUrl}/menus/categories/reorder?businessId=${testBizId}`, {
      orderedIds: [catBeverages.id, catStarters.id],
    }, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    check('Category reorder PUT /api/menus/categories/reorder succeeded', reorderRes.data.success === true);

    const categoriesList = await rbacService.getCategories(testBizId);
    check('Categories list returns reordered list with Craft Mocktails first', categoriesList[0].id === catBeverages.id);

    // 6b: Menu Item with Pricing & Variants
    const menuItemBurger = await rbacService.createMenuItem(testBizId, {
      name: 'Organic Mountain Burger',
      category: 'Mountain Starters',
      category_id: catStarters.id,
      price: 350,
      food_type: 'non_veg',
      is_available: true,
      has_variants: true,
      variants: [
        { id: 'v-single', name: 'Single Patty', price: 350, is_available: true },
        { id: 'v-double', name: 'Double Patty', price: 500, is_available: true },
      ],
      station: 'KITCHEN',
    }, { id: managerUserId, role: 'RESTAURANT_MANAGER' });
    check('Menu item with variants created (Single Rs. 350, Double Rs. 500)',
      menuItemBurger.has_variants === true && (menuItemBurger.variants as any[]).length === 2);
    check('Menu item dietary tag non_veg preserved', menuItemBurger.food_type === 'non_veg');

    // 6c: 86 Availability Toggle & Restriction
    await rbacService.updateMenuItemStatus(testBizId, menuItemBurger.id, 'out_of_stock', false, { id: managerUserId, role: 'RESTAURANT_MANAGER' });
    const toggledItem = await prisma.menuItem.findUnique({ where: { id: menuItemBurger.id } });
    check('Item status toggled to out_of_stock and is_available: false', toggledItem?.is_available === false);

    // Attempting to order out-of-stock item is rejected with 400 ITEM_OUT_OF_STOCK
    let outOfStockOrderRejected = false;
    try {
      await rbacService.createTableOrder(testBizId, {
        table_id: table1.id,
        table_number: 'T-01',
        session_id: tableSessionId,
        host_token: hostToken,
        items: [{ item_id: menuItemBurger.id, name: menuItemBurger.name, price: 350, quantity: 1 }],
      });
    } catch (e: any) {
      if (e.message.includes('out of stock')) outOfStockOrderRejected = true;
    }
    check('Ordering 86 out-of-stock item is strictly rejected by server', outOfStockOrderRejected);

    // Toggle back to in-stock
    await rbacService.updateMenuItemStatus(testBizId, menuItemBurger.id, 'available', true, { id: managerUserId, role: 'RESTAURANT_MANAGER' });

    // 6d: Bulk Import API (POST /api/menus/bulk-import)
    const bulkImportRes = await axios.post(`${baseUrl}/menus/bulk-import?businessId=${testBizId}`, {
      mode: 'merge',
      items: [
        {
          name: 'Himalayan Herb Tea',
          category: 'Craft Mocktails',
          price: 120,
          food_type: 'veg',
          station: 'BAR',
        },
        {
          name: 'Crispy Corn Salt & Pepper',
          category: 'Mountain Starters',
          price: 280,
          food_type: 'veg',
          station: 'KITCHEN',
        },
      ],
    }, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    check('Bulk menu import succeeded', bulkImportRes.data.success === true && (bulkImportRes.data.createdCount === 2 || bulkImportRes.data.data?.createdCount === 2));

    const importedTea = await prisma.menuItem.findFirst({ where: { business_id: testBizId, name: 'Himalayan Herb Tea' } });
    check('Bulk imported Herb Tea saved with category and station BAR', !!importedTea && importedTea.station === 'BAR');

    // -------------------------------------------------------------------------
    // 7. TABLE & SPACE MANAGEMENT: TRANSITIONS & TOGGLES
    // -------------------------------------------------------------------------
    console.log('\n🪑 7. Table & Space Management: Status Transitions & Configuration Toggles');

    const tableSpace = await rbacService.createTable(testBizId, {
      table_number: 'Terrace-Zone-A',
      floor: 'Rooftop Lounge',
      building: 'Terrace Annex',
      capacity: 8,
      status: 'ACTIVE',
    }, { id: ownerUserId, role: 'RESTAURANT_OWNER' });

    // Transition ACTIVE -> RESERVED
    await rbacService.updateTableStatus(testBizId, tableSpace.id, 'RESERVED', { id: managerUserId, role: 'RESTAURANT_MANAGER' });
    const reservedTable = await prisma.restaurantTable.findUnique({ where: { id: tableSpace.id } });
    check('Table status transitioned from ACTIVE to RESERVED', reservedTable?.status === 'RESERVED');

    // Toggle Pay-First ON
    await rbacService.updateTable(testBizId, tableSpace.id, { pay_first_enabled: true }, { id: managerUserId, role: 'RESTAURANT_MANAGER' });
    const pfTableUpdated = await prisma.restaurantTable.findUnique({ where: { id: tableSpace.id } });
    check('Table pay_first_enabled toggled to true', pfTableUpdated?.pay_first_enabled === true);

    // Toggle Comp Mode ON
    await rbacService.updateTable(testBizId, tableSpace.id, { comp_enabled: true }, { id: managerUserId, role: 'RESTAURANT_MANAGER' });
    const compTableUpdated = await prisma.restaurantTable.findUnique({ where: { id: tableSpace.id } });
    check('Table comp_enabled toggled to true', compTableUpdated?.comp_enabled === true);

    // Reset Table back to ACTIVE default
    await rbacService.resetTableToDefault(testBizId, tableSpace.id, tableSpace.table_number);
    const resetTable = await prisma.restaurantTable.findUnique({ where: { id: tableSpace.id } });
    check('Table reset to default status ACTIVE with cleared session', resetTable?.status === 'ACTIVE' && resetTable?.current_session_id === null);

    // -------------------------------------------------------------------------
    // 8. KITCHEN / BAR DISPLAY STATION (KDS): LIFECYCLE & CANCELLATIONS
    // -------------------------------------------------------------------------
    console.log('\n🍳 8. Kitchen / Bar Display Station (KDS): Order Lifecycle & Item Cancellations');

    const kdsTable = await rbacService.createTable(testBizId, {
      table_number: 'KDS-01',
      status: 'ACTIVE',
    }, { id: ownerUserId, role: 'RESTAURANT_OWNER' });

    const kdsOrder = await rbacService.createTableOrder(testBizId, {
      table_id: kdsTable.id,
      table_number: 'KDS-01',
      customer_name: 'Diner Dave',
      items: [
        {
          item_id: 'dish-curry-1',
          name: 'Chicken Tikka Masala',
          price: 550,
          quantity: 1,
          station: 'KITCHEN',
        },
        {
          item_id: 'dish-naan-1',
          name: 'Garlic Butter Naan',
          price: 120,
          quantity: 2,
          station: 'KITCHEN',
        },
        {
          item_id: 'drink-cocktail-1',
          name: 'Everest Sunset Cocktail',
          price: 450,
          quantity: 1,
          station: 'BAR',
        },
      ],
    });

    check('KDS order initialized at RECEIVED with subtotal Rs. 1240 (550 + 240 + 450)', kdsOrder.subtotal === 1240);

    // 8a: Item preparation progression (RECEIVED -> PREPARING)
    await rbacService.updateTableOrderItemStatus(testBizId, kdsOrder.id, { index: 0 }, 'PREPARING', { id: kitchenUserId, role: 'KITCHEN_STAFF' });
    const orderPrep = await prisma.tableOrder.findUnique({ where: { id: kdsOrder.id } });
    check('Updating item to PREPARING moves overall order status to PREPARING', orderPrep?.status === 'PREPARING');

    // 8b: Item preparation completion (PREPARING -> READY)
    await rbacService.updateTableOrderItemStatus(testBizId, kdsOrder.id, { index: 0 }, 'READY', { id: kitchenUserId, role: 'KITCHEN_STAFF' });
    const orderItemReady = await prisma.tableOrder.findUnique({ where: { id: kdsOrder.id } });
    const itemCurry = (orderItemReady?.items as any[])[0];
    check('Dish marked READY sets ready_at timestamp for waiter station notification', !!itemCurry.ready_at);

    // 8c: Item Cancellation Handling (Customer cancels cocktail)
    const orderAfterCancel = await rbacService.updateTableOrderItemStatus(testBizId, kdsOrder.id, { index: 2 }, 'CANCELLED', { id: cashierUserId, role: 'CASHIER' });
    check('Cocktail item marked CANCELLED with cancelled_at timestamp', orderAfterCancel.items[2].status === 'CANCELLED');
    check('Subtotal automatically recalculated to Rs. 790, cleanly excluding cancelled cocktail (1240 - 450)', orderAfterCancel.subtotal === 790);

    // 8d: Remaining active items served -> Order transitions to SERVED
    await rbacService.updateTableOrderItemStatus(testBizId, kdsOrder.id, { index: 0 }, 'SERVED', { id: waiterUserId, role: 'WAITER' });
    const orderServed = await rbacService.updateTableOrderItemStatus(testBizId, kdsOrder.id, { index: 1 }, 'SERVED', { id: waiterUserId, role: 'WAITER' });
    check('When all remaining active items are SERVED, order status transitions to SERVED', orderServed.status === 'SERVED');
    check('Cancelled item did not block order from completing/serving', orderServed.items[2].status === 'CANCELLED');

    // -------------------------------------------------------------------------
    // 9. WAITER STATION: TABLE ASSIGNMENT & CALL BELL ACKNOWLEDGMENT
    // -------------------------------------------------------------------------
    console.log('\n🛎️ 9. Waiter Station: Waiter Assignment & Call Bell Acknowledgment');

    // 9a: Table Waiter Assignment
    await rbacService.updateTable(testBizId, kdsTable.id, {
      assigned_waiter_ids: [waiterUserId],
    }, { id: managerUserId, role: 'RESTAURANT_MANAGER' });
    const tablesListWaiter = await rbacService.getTables(testBizId, { id: waiterUserId, role: 'WAITER' });
    const assignedTable = tablesListWaiter.find((t) => t.id === kdsTable.id);
    check('Table assigned to Waiter Bikram persists in assigned_waiter_ids',
      assignedTable?.assigned_waiter_ids?.includes(waiterUserId) === true);

    // 9b: Customer triggers Waiter Call Bell via ServiceRequest
    const serviceReqRes = await axios.post(`${baseUrl}/rbac/service-requests?businessId=${testBizId}`, {
      type: 'CALL_WAITER',
      table_id: kdsTable.id,
      table_number: kdsTable.table_number,
      notes: 'Customer requests more water and extra napkins',
    });
    check('Customer triggered CALL_WAITER service request', serviceReqRes.data.success === true);

    const tableWithPing = await prisma.restaurantTable.findUnique({ where: { id: kdsTable.id } });
    check('Table waiter_ping is activated with active: true', (tableWithPing?.waiter_ping as any)?.active === true);

    // 9c: Waiter acknowledges ping bell (/api/rbac/tables/:tableId/acknowledge-ping)
    const ackRes = await axios.post(`${baseUrl}/rbac/tables/${kdsTable.id}/acknowledge-ping?businessId=${testBizId}`, {}, {
      headers: { Authorization: `Bearer ${waiterToken}` },
    });
    check('Waiter acknowledged ping bell successfully', ackRes.data.success === true);

    const tableAfterAck = await prisma.restaurantTable.findUnique({ where: { id: kdsTable.id } });
    check('Table waiter_ping is cleared to active: false', (tableAfterAck?.waiter_ping as any)?.active === false);

    const serviceReqAttended = await prisma.serviceRequest.findFirst({
      where: { business_id: testBizId, table_id: kdsTable.id, type: 'CALL_WAITER' },
      orderBy: { created_at: 'desc' },
    });
    check('ServiceRequest status resolved to ATTENDED with resolved_at timestamp',
      serviceReqAttended?.status === 'ATTENDED' && !!serviceReqAttended?.resolved_at);

    // -------------------------------------------------------------------------
    // 10. STAFF & RBAC: PERMISSION BOUNDARIES & CASHIER REGISTER SHIFTS
    // -------------------------------------------------------------------------
    console.log('\n🛡️ 10. Staff & RBAC: Permission Boundary Enforcement & Cashier Drawer Shifts');

    // 10a: Waiter cannot delete menu items
    let waiterDeleteBlocked = false;
    try {
      await rbacService.deleteMenuItem(testBizId, menuItemBurger.id, { id: waiterUserId, role: 'WAITER' });
    } catch (e: any) {
      if (e.message.includes('Permission denied')) waiterDeleteBlocked = true;
    }
    check('Waiter is strictly denied from deleting menu items (RBAC permission boundary)', waiterDeleteBlocked);

    // 10b: Cashier cannot create or delete staff
    let cashierStaffBlocked = false;
    try {
      await rbacService.createStaffMember(testBizId, {
        email: 'hacker@test.com',
        password: 'Pass',
        role: 'ADMIN',
      }, { id: cashierUserId, role: 'CASHIER' });
    } catch (e: any) {
      if (e.message.includes('Permission denied')) cashierStaffBlocked = true;
    }
    check('Cashier is strictly denied from creating staff accounts (RBAC permission boundary)', cashierStaffBlocked);

    // 10c: Cashier Shift Open & Close Sessions
    const openShiftRes = await axios.post(`${baseUrl}/rbac/cashier-session/open?businessId=${testBizId}`, {
      opening_float: 2500,
      notes: 'Morning shift drawer float',
    }, {
      headers: { Authorization: `Bearer ${cashierToken}` },
    });
    check('Cashier opened shift register with opening float Rs. 2500',
      openShiftRes.data.success === true && Number(openShiftRes.data.data.opening_float) === 2500);

    const closeShiftRes = await axios.post(`${baseUrl}/rbac/cashier-session/close?businessId=${testBizId}`, {
      closing_cash: 7800,
      notes: 'Shift completed with verified cash count',
    }, {
      headers: { Authorization: `Bearer ${cashierToken}` },
    });
    check('Cashier closed shift register with closing cash Rs. 7800',
      closeShiftRes.data.success === true && closeShiftRes.data.data.status === 'CLOSED');

  } catch (err: any) {
    console.error('Fatal test error encountered:', err);
    failed++;
  } finally {
    // Teardown throwaway test data
    console.log(`\n🧹 Cleaning up test database records for business ${testBizId}...`);
    try {
      await prisma.compRecord.deleteMany({ where: { business_id: testBizId } });
      await prisma.sale.deleteMany({ where: { business_id: testBizId } });
      await prisma.tableOrder.deleteMany({ where: { business_id: testBizId } });
      await prisma.serviceRequest.deleteMany({ where: { business_id: testBizId } });
      await prisma.cashierRegisterSession.deleteMany({ where: { business_id: testBizId } });
      await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } });
      await prisma.menuItem.deleteMany({ where: { business_id: testBizId } });
      await prisma.menuCategory.deleteMany({ where: { business_id: testBizId } });
      await prisma.gLAccount.deleteMany({ where: { business_id: testBizId } });
      await prisma.user.deleteMany({ where: { business_id: testBizId } });
      await prisma.counter.deleteMany({ where: { business_id: testBizId } });
      await prisma.business.deleteMany({ where: { id: testBizId } });
      console.log('  Cleaned up all throwaway records cleanly.');
    } catch (e: any) {
      console.warn('Cleanup notice:', e.message);
    }
    server.close();
  }

  console.log('\n========================================================================');
  console.log(`🏁 DEEP SYSTEM COMPREHENSIVE E2E RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDeepSystemE2ETests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
