import { rbacService } from '../src/services/rbac.service';
import { prisma } from '../src/lib/prisma';
import { db } from '../src/services/db.service';
import { buildSalesWorkbookData } from '../../src/utils/excelExport';

const BIZ = `test-tracking-${Date.now()}`;
const user = { id: 'tester', email: 'tester@namasteqr.com', role: 'OWNER' };

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra?: any) {
  if (ok) {
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${name}`, extra ?? '');
  }
}

async function rejects(p: Promise<any>): Promise<string | null> {
  try { await p; return null; } catch (e: any) { return e.message || 'error'; }
}

async function main() {
  console.log(`🧪 Tracking & Session test on throwaway business: ${BIZ}`);

  try {
    await db.ensureBusiness(BIZ, 'Tracking Diner');
    const t1 = await rbacService.createTable(BIZ, { table_number: '1', status: 'ACTIVE', pay_first_enabled: true } as any, user);
    const tNormal = await rbacService.createTable(BIZ, { table_number: 'N', status: 'ACTIVE' } as any, user);
    const tMultiple = await rbacService.createTable(BIZ, { table_number: 'M', status: 'ACTIVE', pay_first_enabled: true } as any, user);

    console.log('\n📱 1. Pay-First Basic Tracking Flow');
    await prisma.restaurantTable.update({ where: { id: t1.id }, data: { current_session_id: 's1' } });
    const o1 = await rbacService.createTableOrder(BIZ, { table_id: t1.id, table_number: '1', items: [{ name: 'Burger', quantity: 1, price: 500, station: 'KITCHEN' }], subtotal: 500, total_amount: 500 } as any);
    
    check('order is AWAITING_PAYMENT', o1.status === 'AWAITING_PAYMENT');
    check('table session is intact', (await prisma.restaurantTable.findUnique({ where: { id: t1.id } }))?.current_session_id != null);

    await rbacService.confirmTableOrderPayment(o1.id, BIZ, 'CASH', 'Tester');
    const o1_post_pay = await prisma.tableOrder.findUnique({ where: { id: o1.id } });
    
    check('order RECEIVED after pay', o1_post_pay?.status === 'RECEIVED');
    check('order NOT COMPLETED after pay', o1_post_pay?.status !== 'COMPLETED');
    const tblPostPay = await prisma.restaurantTable.findUnique({ where: { id: t1.id } });
    check('table session still intact after pay', tblPostPay?.current_session_id != null);

    // Mark SERVED (delivered)
    await rbacService.updateTableOrderStatus(BIZ, o1.id, 'SERVED', user);
    const o1_delivered = await prisma.tableOrder.findUnique({ where: { id: o1.id } });
    const tblDelivered = await prisma.restaurantTable.findUnique({ where: { id: t1.id } });
    
    check('order auto-COMPLETED when SERVED', o1_delivered?.status === 'COMPLETED');
    check('table session closed after delivery', tblDelivered?.current_session_id == null);

    console.log('\n🍟 2. Multiple Concurrent Pay-First Orders');
    await prisma.restaurantTable.update({ where: { id: tMultiple.id }, data: { current_session_id: 'sM' } });
    const oM1 = await rbacService.createTableOrder(BIZ, { table_id: tMultiple.id, table_number: 'M', items: [{ name: 'Fries', quantity: 1, price: 100 }], subtotal: 100, total_amount: 100 } as any);
    await rbacService.confirmTableOrderPayment(oM1.id, BIZ, 'CASH', 'Tester');
    
    const oM2 = await rbacService.createTableOrder(BIZ, { table_id: tMultiple.id, table_number: 'M', items: [{ name: 'Coke', quantity: 1, price: 50 }], subtotal: 50, total_amount: 50 } as any);
    await rbacService.confirmTableOrderPayment(oM2.id, BIZ, 'CASH', 'Tester');
    
    const tblMultipleActive = await prisma.restaurantTable.findUnique({ where: { id: tMultiple.id } });
    check('table M session intact while orders are open', tblMultipleActive?.current_session_id != null);

    await rbacService.updateTableOrderStatus(BIZ, oM1.id, 'SERVED', user);
    const oM1_del = await prisma.tableOrder.findUnique({ where: { id: oM1.id } });
    check('oM1 auto-COMPLETED', oM1_del?.status === 'COMPLETED');
    
    const tblMultipleAfter1 = await prisma.restaurantTable.findUnique({ where: { id: tMultiple.id } });
    check('table M session STILL INTACT (one order still active)', tblMultipleAfter1?.current_session_id == null); 

    console.log('\n❌ 3. Reject Payment');
    const oRej = await rbacService.createTableOrder(BIZ, { table_id: t1.id, table_number: '1', items: [{ name: 'Fries', price: 100 }] } as any);
    await rbacService.rejectTableOrderPayment(oRej.id, BIZ, 'Fake money', 'Tester');
    const oRejCheck = await prisma.tableOrder.findUnique({ where: { id: oRej.id } });
    check('order CANCELLED on rejection', oRejCheck?.status === 'CANCELLED');

    console.log('\n🏛️ 4. Normal Table Regression');
    await prisma.restaurantTable.update({ where: { id: tNormal.id }, data: { current_session_id: 'sN' } });
    const oN = await rbacService.createTableOrder(BIZ, { table_id: tNormal.id, table_number: 'N', items: [{ name: 'Normal food', price: 200 }] } as any);
    check('normal order goes to RECEIVED', oN.status === 'RECEIVED');
    const sN = await rbacService.createSale(BIZ, { order_id: oN.id, table_id: tNormal.id, total_amount: 200, items: [] }, user);
    const tblNormalPostSale = await prisma.restaurantTable.findUnique({ where: { id: tNormal.id } });
    check('normal sale completes order and resets table', tblNormalPostSale?.current_session_id == null);

    console.log('\n📊 5. Excel Export Totals Regression');
    const sales = await prisma.sale.findMany({ where: { business_id: BIZ } });
    const sheets = buildSalesWorkbookData(sales as any[], [], 'Rs.');
    const mainReg = sheets.find(s => s.sheetName === 'Sales Register');
    check('Sales Register includes all 4 sales (3 pay_first cash, 1 normal cash)', mainReg?.rows.length === 4);
    
  } finally {
    try {
      await prisma.sale.deleteMany({ where: { business_id: BIZ } });
      await prisma.tableOrder.deleteMany({ where: { business_id: BIZ } });
      await prisma.restaurantTable.deleteMany({ where: { business_id: BIZ } });
      await prisma.counter.deleteMany({ where: { business_id: BIZ } });
      await prisma.business.deleteMany({ where: { id: BIZ } });
    } catch {}
    console.log(`\n🧹 Cleaned up throwaway business ${BIZ}`);
  }

  console.log('\n========================================');
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================');
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
