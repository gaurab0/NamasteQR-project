import { firestoreDb as adminDb, collection, doc, getDoc, getDocs, deleteDoc, setDoc } from '../src/config/firebase';
import { rbacService } from '../src/services/rbac.service';
import { randomBytes } from 'crypto';

const testBusinessId = `test-payfirst-${Date.now()}`;
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS: ${message}`);
    passed++;
  } else {
    console.error(`FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log(`Starting Pay First Tests in business: ${testBusinessId}`);

  try {
    // Setup Business
    await setDoc(doc(adminDb, 'businesses', testBusinessId), {
      name: 'Test Pay First Business',
      plan: 'PREMIUM',
    });

    // 1. Create table with pay_first_enabled=true, and one with it off
    const tablePayFirst = await rbacService.createTable(testBusinessId, { table_number: '1', capacity: 4, status: 'ACTIVE', pay_first_enabled: true }, { id: 'test', role: 'OWNER' });
    
    const tableNormal = await rbacService.createTable(testBusinessId, { table_number: '2', capacity: 4, status: 'ACTIVE' }, { id: 'test', role: 'OWNER' });
    
    assert(tablePayFirst.pay_first_enabled === true, 'Table 1 created with pay_first_enabled = true');
    assert(tableNormal.pay_first_enabled === false, 'Table 2 created with pay_first_enabled = false (legacy/default)');

    // 2. Toggle the flag via update
    await rbacService.updateTable(testBusinessId, tableNormal.id, { pay_first_enabled: true }, { id: 'test', role: 'OWNER' });
    const updatedNormal = await getDoc(doc(adminDb, 'businesses', testBusinessId, 'tables', tableNormal.id));
    assert(updatedNormal.data()?.pay_first_enabled === true, 'Table 2 updated to pay_first_enabled = true');
    await rbacService.updateTable(testBusinessId, tableNormal.id, { pay_first_enabled: false }, { id: 'test', role: 'OWNER' });

    // 3. Create an order on the pay-first table -> status is AWAITING_PAYMENT
    const order1 = await rbacService.createTableOrder(testBusinessId, {
      table_id: tablePayFirst.id,
      table_number: '1',
      items: [{ currency: 'Rs.',
        item_id: 'i1',
        name: 'Burger',
        price: 100,
        quantity: 2,
        station: 'KITCHEN'
      }]
    });
    
    assert(order1.status === 'AWAITING_PAYMENT', 'Order 1 on Pay First table is AWAITING_PAYMENT');
    assert(order1.payment_status === 'UNPAID', 'Order 1 payment_status is UNPAID');
    assert(order1.pay_first === true, 'Order 1 pay_first flag is true');

    // 4. Create an order on the normal table -> status RECEIVED
    const order2 = await rbacService.createTableOrder(testBusinessId, {
      table_id: tableNormal.id,
      table_number: '2',
      items: [{ currency: 'Rs.',
        item_id: 'i2',
        name: 'Pizza',
        price: 200,
        quantity: 1,
        station: 'KITCHEN'
      }]
    });
    
    assert(order2.status === 'RECEIVED', 'Order 2 on Normal table is RECEIVED');
    
    // 5. Try to push pay-first order to PREPARING -> rejected
    let rejectionWorks = false;
    try {
      await rbacService.updateTableOrderStatus(testBusinessId, order1.id, 'PREPARING', { id: 'test', role: 'OWNER' });
    } catch (err: any) {
      if (err.message.includes('Use the confirm-payment endpoint')) {
        rejectionWorks = true;
      }
    }
    assert(rejectionWorks, 'Direct status update of unpaid pay-first order is rejected');

    // 6. Confirm payment with CASH -> a Sale is created, order becomes RECEIVED + PAID
    await rbacService.confirmTableOrderPayment(order1.id, testBusinessId, 'CASH', 'Test Cashier');
    const confirmedOrder1 = (await getDoc(doc(adminDb, 'businesses', testBusinessId, 'table_orders', order1.id))).data();
    
    assert(confirmedOrder1?.status === 'RECEIVED', 'Order 1 status is now RECEIVED');
    assert(confirmedOrder1?.payment_status === 'PAID', 'Order 1 payment_status is PAID');
    assert(!!confirmedOrder1?.sale_id, 'Order 1 has a sale_id linked');
    
    const sale1 = (await getDoc(doc(adminDb, 'businesses', testBusinessId, 'sales', confirmedOrder1!.sale_id))).data();
    assert(sale1?.payment_method === 'CASH', 'Sale 1 was created with method CASH');
    assert(sale1?.total_amount >= 200, 'Sale 1 total amount is correct');

    // 7. Confirm payment again -> no second sale, idempotent or error
    let doubleConfirmFailed = false;
    try {
      await rbacService.confirmTableOrderPayment(order1.id, testBusinessId, 'CASH', 'Test Cashier');
    } catch (err: any) {
      doubleConfirmFailed = true; // Expected to throw 'already paid'
    }
    assert(doubleConfirmFailed, 'Double confirm throws already paid error');

    // 8. Reject/cancel an AWAITING_PAYMENT order
    const order3 = await rbacService.createTableOrder(testBusinessId, {
      table_id: tablePayFirst.id,
      table_number: '1',
      items: [{ currency: 'Rs.', item_id: 'i3', name: 'Coke', price: 50, quantity: 1, station: 'BAR' }]
    });
    
    await rbacService.rejectTableOrderPayment(order3.id, testBusinessId, 'Customer left', 'Test Cashier');
    const cancelledOrder3 = (await getDoc(doc(adminDb, 'businesses', testBusinessId, 'table_orders', order3.id))).data();
    
    assert(cancelledOrder3?.status === 'CANCELLED', 'Order 3 status is CANCELLED');
    assert(cancelledOrder3?.payment_rejected_reason === 'Customer left', 'Order 3 has correct rejection reason');

    // 9. Second order in same session on pay-first table -> goes through AWAITING_PAYMENT again
    const order4 = await rbacService.createTableOrder(testBusinessId, {
      table_id: tablePayFirst.id,
      table_number: '1',
      items: [{ currency: 'Rs.', item_id: 'i4', name: 'Fries', price: 100, quantity: 1, station: 'KITCHEN' }]
    });
    assert(order4.status === 'AWAITING_PAYMENT', 'Order 4 (second order) is AWAITING_PAYMENT');
    assert(order4.id !== order1.id, 'Order 4 did not merge into Order 1 because pay-first forces new order');

  } catch (err) {
    console.error('Test execution failed:', err);
    failed++;
  } finally {
    // Cleanup
    console.log(`Cleaning up test business ${testBusinessId}...`);
    try {
       const collections = ['tables', 'table_orders', 'sales'];
       for (const col of collections) {
         const snaps = await getDocs(collection(adminDb, 'businesses', testBusinessId, col));
         for (const doc of snaps.docs) {
           await deleteDoc(doc.ref);
         }
       }
       await deleteDoc(doc(adminDb, 'businesses', testBusinessId));
    } catch(e) {}
    
    console.log(`\nResults: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
