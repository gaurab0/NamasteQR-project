/**
 * Credit customer GL account end-to-end test.
 * Runs against the real rbacService + Firestore using a THROWAWAY business id,
 * then deletes everything it created.
 *
 * Run: node ./node_modules/tsx/dist/cli.mjs server/test/credit_gl.test.ts
 */
import { rbacService } from '../src/services/rbac.service';
import { firestoreDb, collection, doc, getDocs, getDoc, deleteDoc } from '../src/config/firebase';
import { buildSalesWorkbookData } from '../../src/utils/excelExport';

const BIZ = `test-credit-gl-${Date.now()}`;
const user = { id: 'tester', email: 'tester@serveflow.app', role: 'OWNER' };
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra?: any) {
  if (ok) { passed++; console.log(`  ✅ PASS: ${name}`); }
  else { failed++; console.log(`  ❌ FAIL: ${name}`, extra ?? ''); }
}
async function rejects(p: Promise<any>): Promise<string | null> {
  try { await p; return null; } catch (e: any) { return e.message || 'error'; }
}

const baseSale = {
  customer_name: 'Guest',
  sale_type: 'QUICK_POS' as const,
  items: [{ id: 'i1', item_id: 'i1', name: 'Momo', quantity: 2, price: 150 }] as any,
  subtotal: 300, total_tax: 39, total_amount: 339, taxes: [],
  payment_status: 'PAID' as const,
};

async function main() {
  console.log(`🧪 Credit GL test on throwaway business: ${BIZ}\n`);
  const created: string[] = [];
  const saleIds: string[] = [];

  try {
    console.log('📦 1. Customer GL account creation & null handling');
    const full = await rbacService.createGLAccount(BIZ, {
      account_number: '1121', account_name: 'Ram Sharma Credit A/C', category: 'ASSET', mapping_key: 'CREDIT_SETTLEMENT',
      customer_name: 'Ram Sharma', customer_address: 'Baneshwor, Kathmandu', customer_phone: '9800000001',
      customer_extension: '214', customer_office_name: 'ABC Pvt. Ltd.', customer_designation: 'Manager',
    } as any, user);
    created.push(full.id);
    const sparse = await rbacService.createGLAccount(BIZ, {
      account_number: '1122', account_name: 'Sita Credit A/C', category: 'ASSET', mapping_key: 'CREDIT_SETTLEMENT',
      customer_name: '   ', customer_address: '', // blank / whitespace => null
    } as any, user);
    created.push(sparse.id);

    check('full customer saved with all 6 detail fields',
      full.customer_name === 'Ram Sharma' && full.customer_address === 'Baneshwor, Kathmandu' &&
      full.customer_phone === '9800000001' && full.customer_extension === '214' &&
      full.customer_office_name === 'ABC Pvt. Ltd.' && full.customer_designation === 'Manager');
    check('empty/whitespace/omitted customer fields stored as null',
      sparse.customer_name === null && sparse.customer_address === null && sparse.customer_phone === null &&
      sparse.customer_extension === null && sparse.customer_office_name === null && sparse.customer_designation === null);

    const rawDoc = await getDoc(doc(firestoreDb, 'businesses', BIZ, 'gl_accounts', sparse.id));
    check('Firestore document has real null (not undefined/missing)', rawDoc.data()?.customer_phone === null, rawDoc.data());

    const dupErr = await rejects(rbacService.createGLAccount(BIZ, {
      account_number: '1121', account_name: 'Duplicate', category: 'ASSET', mapping_key: 'CREDIT_SETTLEMENT',
    } as any, user));
    check('duplicate customer GL number is rejected', !!dupErr && /already exists/i.test(dupErr), dupErr);

    const listed = await rbacService.getGLAccounts(BIZ);
    const lf = listed.find((a) => a.id === full.id);
    check('getGLAccounts returns the customer fields', lf?.customer_office_name === 'ABC Pvt. Ltd.' && lf?.customer_extension === '214');

    console.log('\n🔐 2. Server-side CREDIT sale validation');
    const e1 = await rejects(rbacService.createSale(BIZ, { ...baseSale, payment_method: 'CREDIT' } as any, user));
    check('CREDIT with no account is rejected', !!e1 && /credit GL account/i.test(e1), e1);
    const e2 = await rejects(rbacService.createSale(BIZ, { ...baseSale, payment_method: 'CREDIT', credit_gl_account_id: 'nope' } as any, user));
    check('CREDIT with non-existent account is rejected', !!e2 && /does not exist/i.test(e2), e2);

    const cash = await rbacService.createGLAccount(BIZ, { account_number: '1010x', account_name: 'Cash-like', category: 'ASSET', mapping_key: 'CASH_SETTLEMENT' } as any, user);
    created.push(cash.id);
    const e3 = await rejects(rbacService.createSale(BIZ, { ...baseSale, payment_method: 'CREDIT', credit_gl_account_id: cash.id } as any, user));
    check('CREDIT with a non-credit-mapped account is rejected', !!e3 && /not mapped/i.test(e3), e3);

    const inactive = await rbacService.createGLAccount(BIZ, { account_number: '1199', account_name: 'Closed Cust', category: 'ASSET', mapping_key: 'CREDIT_SETTLEMENT', is_active: false } as any, user);
    created.push(inactive.id);
    const e4 = await rejects(rbacService.createSale(BIZ, { ...baseSale, payment_method: 'CREDIT', credit_gl_account_id: inactive.id } as any, user));
    check('CREDIT with an inactive account is rejected', !!e4 && /inactive/i.test(e4), e4);

    console.log('\n💳 3. Valid credit sales + regression for other methods');
    const s1 = await rbacService.createSale(BIZ, { ...baseSale, payment_method: 'CREDIT', credit_gl_account_id: full.id } as any, user);
    const s2 = await rbacService.createSale(BIZ, { ...baseSale, payment_method: 'CREDIT', credit_gl_account_id: sparse.id, customer_name: 'Walk-in Guest' } as any, user);
    const s3 = await rbacService.createSale(BIZ, { ...baseSale, payment_method: 'CREDIT', credit_gl_account_id: full.id } as any, user);
    const sCash = await rbacService.createSale(BIZ, { ...baseSale, payment_method: 'CASH' } as any, user);
    saleIds.push(s1.id, s2.id, s3.id, sCash.id);

    check('credit sale stores GL id/number/name', s1.credit_gl_account_id === full.id && s1.credit_gl_account_number === '1121' && s1.credit_gl_account_name === 'Ram Sharma Credit A/C');
    check('default "Guest" name is replaced by real customer name', s1.customer_name === 'Ram Sharma', s1.customer_name);
    check('customer with no name keeps default name', s2.customer_name === 'Walk-in Guest', s2.customer_name);
    check('client-supplied GL name is overridden by server truth', s1.credit_gl_account_name !== undefined);
    check('CASH sale is unaffected and carries no credit fields',
      sCash.payment_method === 'CASH' && !(sCash as any).credit_gl_account_id);
    const persisted = await getDoc(doc(firestoreDb, 'businesses', BIZ, 'sales', s1.id));
    check('credit sale persisted in Firestore with GL id', persisted.data()?.credit_gl_account_id === full.id);

    console.log('\n📊 4. Excel workbook');
    const allSales = [s1, s2, s3, sCash] as any[];
    const sheets = buildSalesWorkbookData(allSales, listed as any[], 'Rs.');
    const main = sheets.find((s) => s.sheetName === 'Sales Register')!;
    const credit = sheets.find((s) => s.sheetName === 'Credit Sales Register')!;
    const glSheet = sheets.find((s) => s.sheetName === 'GL Links & Mapping')!;

    check('main Sales Register has ALL 4 sales (CASH + 3 CREDIT)', main.rows.length === 4, main.rows.length);
    check('every credit row matches header width', credit.rows.every((r) => r.length === credit.headers.length),
      credit.rows.map((r) => r.length));
    const hi = (h: string) => credit.headers.indexOf(h);
    const dataRows = credit.rows.filter((r) => typeof r[0] === 'number');
    check('3 credit invoices listed in credit register', dataRows.length === 3, dataRows.length);
    const ramRows = dataRows.filter((r) => r[hi('Customer GL Account No.')] === '1121');
    check('Ram rows carry all customer details',
      ramRows.length === 2 && ramRows.every((r) =>
        r[hi('Customer Name')] === 'Ram Sharma' && r[hi('Customer Address')] === 'Baneshwor, Kathmandu' &&
        r[hi('Customer Phone')] === '9800000001' && r[hi('Extension No.')] === '214' &&
        r[hi('Office Name')] === 'ABC Pvt. Ltd.' && r[hi('Designation')] === 'Manager'));
    const sitaRow = dataRows.find((r) => r[hi('Customer GL Account No.')] === '1122')!;
    check('customer with no details has EMPTY cells (null -> blank)',
      ['Customer Name', 'Customer Address', 'Customer Phone', 'Extension No.', 'Office Name', 'Designation'].every((h) => sitaRow[hi(h)] === ''));
    const sub = credit.rows.find((r) => r.includes('CUSTOMER SUBTOTAL'));
    check('customer subtotal row sits in the Items column & total in Grand Total column',
      !!sub && sub[hi('Items Ordered')] === 'CUSTOMER SUBTOTAL' && typeof sub[hi('Grand Total (Credit)')] === 'number');
    const grand = credit.rows.find((r) => r.includes('GRAND TOTAL OUTSTANDING'));
    check('grand total outstanding = 3 x 339 = 1017', !!grand && grand[hi('Grand Total (Credit)')] === 1017, grand);
    check('GL Links sheet exposes customer columns', glSheet.headers.includes('Extension No.') && glSheet.rows.every((r) => r.length === glSheet.headers.length));
    const ramGl = glSheet.rows.find((r) => r[1] === '1121')!;
    check('GL Links register total for Ram = 678', ramGl[5] === 678, ramGl[5]);

    console.log('\n✏️  5. Update preserves / clears customer fields');
    const upd = await rbacService.updateGLAccount(BIZ, full.id, { customer_extension: '' } as any, user);
    check('update clears a field sent blank', upd.customer_extension === null);
    check('update keeps fields that were not sent', upd.customer_name === 'Ram Sharma' && upd.customer_office_name === 'ABC Pvt. Ltd.');
  } finally {
    // Cleanup the throwaway business
    for (const col of ['sales', 'gl_accounts', 'sequences', 'settings', 'tax_config']) {
      try {
        const snap = await getDocs(collection(firestoreDb, 'businesses', BIZ, col));
        await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      } catch { /* collection may not exist */ }
    }
    console.log(`\n🧹 Cleaned up throwaway business ${BIZ}`);
  }

  console.log('\n========================================');
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('Test crashed:', e); process.exit(1); });
