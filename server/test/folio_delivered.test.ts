import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';

async function testFolioDeliveredWorkflow() {
  console.log('🧪 Testing Folio Delivered & POS Settlement Flow...');

  const testBizId = 'test-biz-' + Date.now();
  const testOrderId = 'order-folio-' + Date.now();
  const testReqId = 'req-folio-' + Date.now();

  try {
    // 1. Setup Business & Table in PostgreSQL
    await db.ensureBusiness(testBizId, 'Folio Test Restaurant');
    await prisma.restaurantTable.upsert({
      where: { id: 'table-test-1' },
      update: {},
      create: {
        id: 'table-test-1',
        business_id: testBizId,
        table_number: '12',
        capacity: 4,
        status: 'AVAILABLE',
      },
    });

    // 2. Create Table Order with bill_requested: true
    await prisma.tableOrder.create({
      data: {
        id: testOrderId,
        business_id: testBizId,
        table_id: 'table-test-1',
        table_number: '12',
        order_number: 'ORD-TEST-101',
        status: 'READY',
        bill_requested: true,
        bill_requested_at: new Date(),
        subtotal: 100,
        tax_amount: 13,
        total_amount: 113,
        items: JSON.stringify([{ name: 'Momo', price: 100, quantity: 1 }]),
      },
    });

    // 3. Create Service Request for Bill Folio
    await prisma.serviceRequest.create({
      data: {
        id: testReqId,
        business_id: testBizId,
        table_id: 'table-test-1',
        table_number: '12',
        order_id: testOrderId,
        type: 'BILL_REQUEST',
        status: 'PENDING',
        total_amount: 113,
      },
    });

    console.log('1. Created active order with bill_requested: true and pending service request.');

    // 4. Invoke acknowledgeOrderBillFolio
    const result = await rbacService.acknowledgeOrderBillFolio(testBizId, testOrderId, testReqId);
    console.log('2. acknowledgeOrderBillFolio result:', result);

    if (!result.success) {
      throw new Error(`acknowledgeOrderBillFolio failed: ${result.error}`);
    }

    // 5. Verify PostgreSQL TableOrder has folio_delivered and bill_acknowledged
    const updatedOrder = await prisma.tableOrder.findUnique({
      where: { id: testOrderId },
    });

    if (!updatedOrder) throw new Error('Order not found in database');
    if (!updatedOrder.bill_acknowledged) throw new Error('Order bill_acknowledged was not set to true');
    if (!updatedOrder.folio_delivered) throw new Error('Order folio_delivered was not set to true');
    if (!updatedOrder.folio_delivered_at) throw new Error('Order folio_delivered_at was not recorded');

    console.log('  ✅ PASS: PostgreSQL TableOrder has folio_delivered: true and bill_acknowledged: true');

    // 6. Verify ServiceRequest is ATTENDED
    const updatedReq = await prisma.serviceRequest.findUnique({
      where: { id: testReqId },
    });

    if (!updatedReq) throw new Error('ServiceRequest not found in database');
    if (updatedReq.status !== 'ATTENDED') throw new Error(`ServiceRequest status is ${updatedReq.status}, expected ATTENDED`);
    if (!updatedReq.resolved_at) throw new Error('ServiceRequest resolved_at was not recorded');

    console.log('  ✅ PASS: PostgreSQL ServiceRequest marked as ATTENDED with resolved_at timestamp');

    console.log('\n========================================');
    console.log('🏁 Folio Delivered Test: ALL PASSED');
    console.log('========================================');
  } catch (err: any) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    // Cleanup test records
    try {
      await prisma.serviceRequest.deleteMany({ where: { business_id: testBizId } });
      await prisma.tableOrder.deleteMany({ where: { business_id: testBizId } });
      await prisma.restaurantTable.deleteMany({ where: { business_id: testBizId } });
      await prisma.business.deleteMany({ where: { id: testBizId } });
    } catch {}
  }
}

testFolioDeliveredWorkflow();
