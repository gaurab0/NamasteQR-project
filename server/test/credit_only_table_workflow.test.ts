import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';
import { buildSalesWorkbookData } from '../../src/utils/excelExport';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, extra?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`, extra ?? '');
    failed++;
  }
}

async function runCreditOnlyTableWorkflowTest() {
  console.log('🧪 Starting Credit-Only Table End-to-End Workflow Test Suite...\n');

  const testBizId = `test-credit-table-${Date.now()}`;
  const user = { id: 'test-admin', email: 'admin@test.com', role: 'OWNER' };

  try {
    await db.ensureBusiness(testBizId, 'Credit Only Lounge');

    // 1. Create a dedicated GL Account for this table (Category: ASSET, mapping_key: CREDIT_SETTLEMENT)
    console.log('📦 1. GL Account Creation for Credit Table');
    const glAccount = await rbacService.createGLAccount(testBizId, {
      account_number: '90909',
      account_name: 'VIP Suite 101 Credit A/C',
      category: 'ASSET',
      mapping_key: 'CREDIT_SETTLEMENT',
      customer_name: 'John Doe',
      customer_phone: '9841000000',
    } as any, user);

    assert(glAccount.account_number === '90909', 'GL Account created with 5-digit number 90909');
    assert(glAccount.category === 'ASSET', 'GL Account category is ASSET');
    assert(glAccount.mapping_key === 'CREDIT_SETTLEMENT', 'GL Account mapping key is CREDIT_SETTLEMENT');

    // 2. Create Table with credit-only attributes
    console.log('\n💳 2. Table Creation with Credit-Only Attributes & Pay-First Enforcement');
    const createdTable = await rbacService.createTable(testBizId, {
      table_number: 'Suite-101',
      capacity: 6,
      credit_only: true,
      pay_first_enabled: false, // Should be auto-forced to true because credit_only is true
      credit_customer_name: 'John Doe',
      credit_customer_phone: '9841000000',
      credit_pin: '849201',
      credit_gl_account_id: glAccount.id,
      credit_gl_account_number: glAccount.account_number,
      credit_gl_account_name: glAccount.account_name,
    } as any, user);

    assert(createdTable.credit_only === true, 'Table saved with credit_only = true');
    assert(createdTable.pay_first_enabled === true, 'Table pay_first_enabled automatically enforced to true');
    assert(createdTable.credit_customer_name === 'John Doe', 'Table customer name preserved');
    assert(createdTable.credit_customer_phone === '9841000000', 'Table customer phone preserved');
    assert(createdTable.credit_pin === '849201', 'Table 6-digit PIN preserved');
    assert(createdTable.credit_gl_account_number === '90909', 'Table GL account number linked');

    // Verify getTables returns credit fields
    const allTables = await rbacService.getTables(testBizId);
    const fetchedTable = allTables.find((t) => t.id === createdTable.id);
    assert(fetchedTable?.credit_only === true, 'getTables returns credit_only table');
    assert(fetchedTable?.credit_pin === '849201', 'getTables returns credit_pin');

    // 3. Customer QR scan / check-in
    console.log('\n📲 3. Customer QR Scan Check-In Session Mapping');
    const checkIn = await rbacService.scanTableCheckIn(testBizId, createdTable.id, {
      tableNumber: createdTable.table_number,
      customerName: 'John Doe',
    });
    assert(checkIn.table?.credit_only === true, 'Check-in table returns credit_only');
    assert(checkIn.table?.credit_customer_name === 'John Doe', 'Check-in table returns credit_customer_name');
    assert(checkIn.table?.credit_pin === '849201', 'Check-in table returns credit_pin');
    assert(checkIn.table?.credit_gl_account_number === '90909', 'Check-in table returns credit_gl_account_number');

    // 4. Place Table Order (Pay-First enforced, customer details locked)
    console.log('\n🛒 4. Credit-Only Order Placement');
    const order = await rbacService.createTableOrder(testBizId, {
      table_id: createdTable.id,
      table_number: createdTable.table_number,
      session_id: checkIn.session_id,
      host_token: checkIn.host_token || undefined,
      items: [
        {
          item_id: 'steak-1',
          name: 'Ribeye Steak',
          price: 1200,
          quantity: 2,
        },
      ],
      // Omit customer_name/phone to test auto-population from credit table
    });

    assert(order.credit_only === true, 'Order has credit_only = true');
    assert(order.pay_first === true, 'Order has pay_first = true');
    assert(order.status === 'AWAITING_PAYMENT', 'Order status initialized to AWAITING_PAYMENT');
    assert(order.customer_name === 'John Doe', 'Order customer_name auto-populated from credit table');
    assert(order.customer_phone === '9841000000', 'Order customer_phone auto-populated from credit table');
    assert(order.credit_gl_account_id === glAccount.id, 'Order has credit_gl_account_id pre-linked');

    // 4b. Test subsequent order placement on credit table inherits all credit attributes
    console.log('\n➕ 4b. Subsequent Order Placement on Credit Table Inherits Attributes');
    const secondOrder = await rbacService.createTableOrder(testBizId, {
      table_id: createdTable.id,
      table_number: createdTable.table_number,
      session_id: checkIn.session_id,
      host_token: checkIn.host_token || undefined,
      items: [
        {
          item_id: 'wine-1',
          name: 'Cabernet Sauvignon',
          price: 800,
          quantity: 1,
        },
      ],
    });

    assert(secondOrder.credit_only === true, 'Subsequent order inherits credit_only = true');
    assert(secondOrder.pay_first === true, 'Subsequent order inherits pay_first = true');
    assert(secondOrder.status === 'AWAITING_PAYMENT', 'Subsequent order status is AWAITING_PAYMENT');
    assert(secondOrder.customer_name === 'John Doe', 'Subsequent order auto-populates locked customer_name');
    assert(secondOrder.customer_phone === '9841000000', 'Subsequent order auto-populates locked customer_phone');
    assert(secondOrder.credit_gl_account_id === glAccount.id, 'Subsequent order inherits credit_gl_account_id');

    // 5. Customer Authorizes Payment with 6-digit PIN
    console.log('\n🔐 5. 6-Digit PIN Authorization Validation');
    // Test PIN matching against table credit_pin
    const targetTable = await prisma.restaurantTable.findUnique({ where: { id: order.table_id } });
    const expectedPin = targetTable?.credit_pin?.trim();

    const wrongPin = '000000';
    const wrongPinMatches = (wrongPin === expectedPin);
    assert(!wrongPinMatches, 'Incorrect PIN (000000) correctly rejected');

    const correctPin = '849201';
    const correctPinMatches = (correctPin === expectedPin);
    assert(correctPinMatches, 'Correct 6-digit PIN (849201) correctly verified against table');

    // Perform PIN authorization
    await prisma.tableOrder.updateMany({
      where: { id: order.id, business_id: testBizId },
      data: {
        payment_method: 'DEDUCT_FROM_DEPOSIT',
        credit_pin_verified: true,
      },
    });

    const updatedOrder = await prisma.tableOrder.findUnique({ where: { id: order.id } });
    assert(updatedOrder?.payment_method === 'DEDUCT_FROM_DEPOSIT', 'Order payment method set to DEDUCT_FROM_DEPOSIT');
    assert(updatedOrder?.credit_pin_verified === true, 'Order credit_pin_verified is true');

    // 6. Cashier Confirms Payment on Billing POS
    console.log('\n💵 6. Cashier Confirms Payment -> Generates Sale Record & Links GL');
    await rbacService.confirmTableOrderPayment(order.id, testBizId, 'DEDUCT_FROM_DEPOSIT', 'Cashier Alice');

    const confirmedOrder = await prisma.tableOrder.findUnique({ where: { id: order.id } });
    assert(confirmedOrder?.status === 'RECEIVED', 'Order status moved to RECEIVED (sent to kitchen)');
    assert(confirmedOrder?.payment_status === 'PAID', 'Order payment status is PAID');
    assert(confirmedOrder?.payment_method === 'DEDUCT_FROM_DEPOSIT', 'Order payment_method persisted in DB');
    assert(!!confirmedOrder?.sale_id, 'Sale record was generated for pay-first order');

    const sale = await prisma.sale.findUnique({ where: { id: confirmedOrder!.sale_id! } });
    assert(sale?.payment_method === 'DEDUCT_FROM_DEPOSIT', 'Sale payment_method is DEDUCT_FROM_DEPOSIT');
    assert(sale?.credit_gl_account_id === glAccount.id, 'Sale linked to table credit GL account ID');
    assert(sale?.credit_gl_account_number === '90909', 'Sale linked to table credit GL account number 90909');
    assert(sale?.credit_gl_account_name === 'VIP Suite 101 Credit A/C', 'Sale linked to table credit GL account name');

    // 7. Test Requirement 5: Non-Credit payment on Credit-Only Table
    console.log('\n💵 7. Requirement 5: Cash Payment on Credit Table Passes as Normal Order');
    // Reset previous order & start a new session for the table
    await rbacService.resetTableToDefault(testBizId, createdTable.id, createdTable.table_number);
    const checkIn2 = await rbacService.scanTableCheckIn(testBizId, createdTable.id, {
      tableNumber: createdTable.table_number,
      customerName: 'John Doe',
    });

    const cashOrder = await rbacService.createTableOrder(testBizId, {
      table_id: createdTable.id,
      table_number: createdTable.table_number,
      session_id: checkIn2.session_id,
      host_token: checkIn2.host_token || undefined,
      items: [
        {
          item_id: 'coffee-1',
          name: 'Espresso',
          price: 200,
          quantity: 1,
        },
      ],
    });

    assert(cashOrder.credit_only === true, 'Initial cashOrder has credit_only = true from table');
    // Customer selects Cash instead of Credit / Deduct Deposit
    await prisma.tableOrder.updateMany({
      where: { id: cashOrder.id, business_id: testBizId },
      data: {
        payment_method: 'CASH',
        credit_pin_verified: false,
      },
    });

    // Cashier confirms CASH payment
    await rbacService.confirmTableOrderPayment(cashOrder.id, testBizId, 'CASH', 'Cashier Bob');

    const confirmedCashOrder = await prisma.tableOrder.findUnique({ where: { id: cashOrder.id } });
    assert(confirmedCashOrder?.payment_method === 'CASH', 'Cash order payment_method is CASH');
    assert(confirmedCashOrder?.credit_only === false, 'Requirement 5: Confirmed CASH order passes like a normal order (credit_only = false)');
    assert(confirmedCashOrder?.credit_gl_account_id === null, 'Requirement 5: Cash order has credit_gl_account_id = null');

    const cashSale = await prisma.sale.findUnique({ where: { id: confirmedCashOrder!.sale_id! } });
    assert(cashSale?.payment_method === 'CASH', 'Cash sale payment_method is CASH');
    assert(cashSale?.credit_gl_account_id === null, 'Requirement 5: Cash sale has credit_gl_account_id = null');

    // 8. Verify Excel Export with Deduct from Deposit Tab & Segregation
    console.log('\n📊 8. Multi-Tab Excel Workbook Export Verification');
    const creditSale = await prisma.sale.create({
      data: {
        id: `sale-credit-${Date.now()}`,
        business_id: testBizId,
        invoice_number: 'INV-1002',
        sale_type: 'DINE_IN',
        customer_name: 'Jane Smith',
        customer_phone: '9841111111',
        payment_method: 'CREDIT',
        credit_gl_account_id: glAccount.id,
        credit_gl_account_number: '90909',
        credit_gl_account_name: 'VIP Suite 101 Credit A/C',
        subtotal: 1000,
        total_tax: 130,
        total_amount: 1130,
        payment_status: 'PAID',
        date_string: new Date().toISOString().split('T')[0],
        taxes: [],
        items: [{ id: 'item-2', name: 'Pasta', quantity: 1, price: 1000 }],
      },
    });

    const allSales = [sale!, cashSale!, creditSale] as any[];
    const sheets = buildSalesWorkbookData(allSales, [glAccount] as any[], 'Rs.');

    const sheetNames = sheets.map((s) => s.sheetName);
    assert(sheetNames.includes('Sales Register'), 'Sheet "Sales Register" exists');
    assert(sheetNames.includes('Credit Sales Register'), 'Sheet "Credit Sales Register" exists');
    assert(sheetNames.includes('Deduct from Deposit Sales'), 'Dedicated Sheet "Deduct from Deposit Sales" exists');
    assert(sheetNames.includes('GL Journal Summary'), 'Sheet "GL Journal Summary" exists');

    const depositSheet = sheets.find((s) => s.sheetName === 'Deduct from Deposit Sales')!;
    assert(depositSheet.rows.length >= 2, 'Deposit sheet contains transaction rows');
    const depositDataRow = depositSheet.rows.find((r) => r.includes(sale!.invoice_number || ''));
    assert(!!depositDataRow, 'Deposit sheet contains the DEDUCT_FROM_DEPOSIT invoice');
    assert(depositDataRow?.includes('90909'), 'Deposit sheet reflects table linked GL account 90909');
    assert(depositDataRow?.includes('VIP Suite 101 Credit A/C'), 'Deposit sheet reflects table linked GL account name');

    const creditSheet = sheets.find((s) => s.sheetName === 'Credit Sales Register')!;
    const creditDataRow = creditSheet.rows.find((r) => r.includes(creditSale.invoice_number));
    assert(!!creditDataRow, 'Credit Sales Register contains the CREDIT invoice');
    const depositInCreditSheet = creditSheet.rows.find((r) => r.includes(sale!.invoice_number || ''));
    assert(!depositInCreditSheet, 'Credit Sales Register does NOT contain the DEDUCT_FROM_DEPOSIT invoice');
    const cashInCreditSheet = creditSheet.rows.find((r) => r.includes(cashSale!.invoice_number || ''));
    assert(!cashInCreditSheet, 'Requirement 5: Cash sale does NOT go to Credit Sales Register');

    const glSummarySheet = sheets.find((s) => s.sheetName === 'GL Journal Summary')!;
    const depositGlEntry = glSummarySheet.rows.find((r) => r[0] === '2130' || r[1] === 'Customer Advance & Deposit Clearing');
    assert(!!depositGlEntry, 'GL Journal Summary debits Account 2130 (Customer Advance & Deposit Clearing)');

  } catch (err: any) {
    console.error('Test error:', err);
    failed++;
  } finally {
    // Cleanup
    try {
      await prisma.tableOrder.deleteMany({ where: { business_id: testBizId } });
      await prisma.sale.deleteMany({ where: { business_id: testBizId } });
      await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } });
      await prisma.gLAccount.deleteMany({ where: { business_id: testBizId } });
      await prisma.business.deleteMany({ where: { id: testBizId } });
      console.log(`\n🧹 Cleaned up throwaway business ${testBizId}`);
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
  }

  console.log('\n========================================');
  console.log(`🏁 Credit-Only Table Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runCreditOnlyTableWorkflowTest().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
