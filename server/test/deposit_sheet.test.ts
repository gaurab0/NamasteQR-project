import assert from 'assert';
import { buildSalesWorkbookData } from '../../src/utils/excelExport';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name}`, extra !== undefined ? extra : '');
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 DEDUCT FROM DEPOSIT SHEET GROUPING TEST');
  console.log('====================================================\n');

  try {
    const glAccounts: any[] = [
      {
        id: 'gl-2130',
        account_number: '2130',
        account_name: 'Customer Advance & Deposit Clearing',
        mapping_key: 'DEPOSIT_CLEARING',
        category: 'LIABILITY',
        is_active: true,
      },
      {
        id: 'gl-52397',
        account_number: '52397',
        account_name: 'Credit Settlement - Table cabin-801 (Sunil)',
        mapping_key: 'DEPOSIT_CLEARING',
        category: 'LIABILITY',
        customer_name: 'Sunil',
        customer_phone: '9876543210',
        customer_address: 'Pokhara, Lakeside',
        customer_office_name: 'Sunil Hospitality',
        customer_designation: 'Director',
        is_active: true,
      },
      {
        id: 'gl-40554',
        account_number: '40554',
        account_name: 'Credit Settlement - Table Cabin 901-Floor 9 (Yadab)',
        mapping_key: 'DEPOSIT_CLEARING',
        category: 'LIABILITY',
        customer_name: 'Yadab',
        customer_phone: '9851072344',
        is_active: true,
      },
    ];

    const sales: any[] = [
      // Account 52397 Sunil: 2 sales (500 + 700 = 1200)
      {
        id: 'sale-dep-1',
        invoice_number: 'INV-101',
        order_number: 'ORD-101',
        payment_method: 'DEDUCT_FROM_DEPOSIT',
        credit_gl_account_id: 'gl-52397',
        credit_gl_account_number: '52397',
        credit_gl_account_name: 'Credit Settlement - Table cabin-801 (Sunil)',
        customer_name: 'Sunil',
        customer_phone: '9876543210',
        subtotal: 500,
        total_tax: 0,
        service_charge: 0,
        discount_amount: 0,
        total_amount: 500,
        items: [{ name: 'Momo', quantity: 2, price: 250 }],
        created_at: new Date('2026-11-05T08:00:00Z'),
      },
      {
        id: 'sale-dep-2',
        invoice_number: 'INV-102',
        order_number: 'ORD-102',
        payment_method: 'DEDUCT_FROM_DEPOSIT',
        credit_gl_account_id: 'gl-52397',
        credit_gl_account_number: '52397',
        credit_gl_account_name: 'Credit Settlement - Table cabin-801 (Sunil)',
        customer_name: 'Sunil',
        customer_phone: '9876543210',
        subtotal: 700,
        total_tax: 0,
        service_charge: 0,
        discount_amount: 0,
        total_amount: 700,
        items: [{ name: 'Pizza', quantity: 1, price: 700 }],
        created_at: new Date('2026-11-05T09:00:00Z'),
      },
      // Account 40554 Yadab: 1 sale (1500)
      {
        id: 'sale-dep-3',
        invoice_number: 'INV-103',
        order_number: 'ORD-103',
        payment_method: 'DEDUCT_FROM_DEPOSIT',
        credit_gl_account_id: 'gl-40554',
        credit_gl_account_number: '40554',
        credit_gl_account_name: 'Credit Settlement - Table Cabin 901-Floor 9 (Yadab)',
        customer_name: 'Yadab',
        customer_phone: '9851072344',
        subtotal: 1500,
        total_tax: 0,
        service_charge: 0,
        discount_amount: 0,
        total_amount: 1500,
        items: [{ name: 'Buff Sizzler', quantity: 3, price: 500 }],
        created_at: new Date('2026-11-06T10:00:00Z'),
      },
      // Unassigned Deposit sale: 1 sale (300) -> should group under 2130
      {
        id: 'sale-dep-4',
        invoice_number: 'INV-104',
        order_number: 'ORD-104',
        payment_method: 'DEDUCT_FROM_DEPOSIT',
        customer_name: 'Guest Advance',
        subtotal: 300,
        total_tax: 0,
        service_charge: 0,
        discount_amount: 0,
        total_amount: 300,
        items: [{ name: 'Coffee', quantity: 2, price: 150 }],
        created_at: new Date('2026-11-07T11:00:00Z'),
      },
    ];

    const sheets = buildSalesWorkbookData(sales, glAccounts, 'Rs.');
    const depositSheet = sheets.find((s) => s.sheetName === 'Deduct from Deposit Sales');
    check('Deduct from Deposit Sales sheet exists', !!depositSheet);
    if (!depositSheet) return;

    check('Every deposit row matches header length (22 cols)',
      depositSheet.rows.every((r) => r.length === depositSheet.headers.length),
      depositSheet.rows.map((r) => r.length)
    );

    const hi = (h: string) => depositSheet.headers.indexOf(h);
    check('Contains Customer GL Account No. header', hi('Customer GL Account No.') !== -1);
    check('Contains Grand Total (Deducted) header', hi('Grand Total (Deducted)') !== -1);
    check('Contains Extension No. and Office Name headers', hi('Extension No.') !== -1 && hi('Office Name') !== -1);

    // Check banner headers for each account
    const bannerSunil = depositSheet.rows.find((r) => r[0] === 'Customer GL Account: 52397 - Credit Settlement - Table cabin-801 (Sunil)');
    check('Sunil banner header is present', !!bannerSunil);

    const totalSunil = depositSheet.rows.find((r) => String(r[0]).includes('Total Deducted: Rs. 1200.00 (2 Deductions)'));
    check('Sunil total deducted banner shows Rs. 1200.00 (2 Deductions)', !!totalSunil);

    const bannerYadab = depositSheet.rows.find((r) => r[0] === 'Customer GL Account: 40554 - Credit Settlement - Table Cabin 901-Floor 9 (Yadab)');
    check('Yadab banner header is present', !!bannerYadab);

    const banner2130 = depositSheet.rows.find((r) => r[0] === 'Customer GL Account: 2130 - Customer Advance & Deposit Clearing');
    check('Unassigned deposit falls back to GL 2130 group', !!banner2130);

    // Check data rows
    const dataRows = depositSheet.rows.filter((r) => typeof r[0] === 'number');
    check('Total 4 deposit transaction rows rendered across accounts', dataRows.length === 4, dataRows.length);

    // Check Sunil metadata carried over
    const sunilRows = dataRows.filter((r) => r[hi('Customer GL Account No.')] === '52397');
    check('Sunil rows carry address and office name',
      sunilRows.length === 2 && sunilRows.every((r) => r[hi('Customer Address')] === 'Pokhara, Lakeside' && r[hi('Office Name')] === 'Sunil Hospitality'));

    // Check ACCOUNT SUBTOTAL rows
    const subtotalRows = depositSheet.rows.filter((r) => r.includes('ACCOUNT SUBTOTAL'));
    check('3 ACCOUNT SUBTOTAL rows present (one per active group)', subtotalRows.length === 3);
    const sunilSubtotal = subtotalRows.find((r) => r[hi('Grand Total (Deducted)')] === 1200);
    check('Sunil ACCOUNT SUBTOTAL equals 1200', !!sunilSubtotal);

    // Check GRAND TOTAL DEDUCTED row
    const grandRow = depositSheet.rows.find((r) => r.includes('GRAND TOTAL DEDUCTED'));
    check('GRAND TOTAL DEDUCTED row present', !!grandRow);
    check('Grand total equals 1200 + 1500 + 300 = 3000', !!grandRow && grandRow[hi('Grand Total (Deducted)')] === 3000);

  } catch (err) {
    console.error('Unexpected error in test:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests();
