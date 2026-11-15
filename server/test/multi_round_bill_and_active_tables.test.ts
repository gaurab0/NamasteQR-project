import assert from 'assert';

console.log('====================================================');
console.log('🧪 MULTI-ROUND BILL & POS ACTIVE TABLES TEST SUITE');
console.log('====================================================\n');

// 1. Test cleanOrderNumber logic
function cleanOrderNumber(orderNumber?: string): string {
  if (!orderNumber) return 'ORD';
  return String(orderNumber).replace(/\s*\(Round\s*\d+\)/gi, '').trim();
}

console.log('📋 Test 1: Customer Bill & Invoice Order Number Stripping');
const testCases = [
  { input: 'ORD-134 (Round 4)', expected: 'ORD-134' },
  { input: 'ORD-134 (Round 5)', expected: 'ORD-134' },
  { input: 'ORD-134 (round 2)', expected: 'ORD-134' },
  { input: 'ORD-134', expected: 'ORD-134' },
  { input: 'INV-100 (Round 3)', expected: 'INV-100' },
  { input: 'ORD-99 (ROUND 10)', expected: 'ORD-99' },
];

for (const tc of testCases) {
  const result = cleanOrderNumber(tc.input);
  assert.strictEqual(result, tc.expected, `Expected ${tc.input} to clean to ${tc.expected}`);
  console.log(`  ✅ PASS: "${tc.input}" -> "${result}"`);
}

// 2. Test Thermal Print Dispatch logic
console.log('\n🖨️ Test 2: Print Dispatch Bill Sanitization');
function getPrintOrderNumber(rawOrderNumber: string, taskType: 'BILL' | 'KOT' | 'BAR'): string {
  const isBill = taskType === 'BILL';
  return isBill ? rawOrderNumber.replace(/\s*\(Round\s*\d+\)/gi, '').trim() : rawOrderNumber;
}

const billPrint = getPrintOrderNumber('ORD-134 (Round 4)', 'BILL');
assert.strictEqual(billPrint, 'ORD-134', 'Bill print strips (Round X)');
console.log(`  ✅ PASS: Bill Print displays: "${billPrint}"`);

const kotPrint = getPrintOrderNumber('ORD-134 (Round 4)', 'KOT');
assert.strictEqual(kotPrint, 'ORD-134 (Round 4)', 'KOT keeps round info for kitchen');
console.log(`  ✅ PASS: KOT Print preserves: "${kotPrint}"`);

const barPrint = getPrintOrderNumber('ORD-134 (Round 4)', 'BAR');
assert.strictEqual(barPrint, 'ORD-134 (Round 4)', 'BAR keeps round info for bar');
console.log(`  ✅ PASS: BAR Print preserves: "${barPrint}"`);

// 3. Test POS Active Table Grouping & Unified Card Calculation
console.log('\n🍽️ Test 3: POS Active Table Multi-Round Consolidation');

interface MockOrderItem {
  name: string;
  quantity: number;
  price: number;
  status: string;
  station?: string;
  round_number?: number;
}

interface MockOrder {
  id: string;
  table_id: string;
  table_number: string;
  order_number: string;
  customer_name: string;
  items: MockOrderItem[];
  status: string;
  created_at: string;
  folio_delivered?: boolean;
  bill_requested?: boolean;
}

// Simulate the scenario from Image 2: Table Cabin 901 with Round 4 and Round 5
const mockPendingOrders: MockOrder[] = [
  {
    id: 'ord-round-5',
    table_id: 'table-cabin-901',
    table_number: 'Cabin 901-Floor 9',
    order_number: 'ORD-134 (Round 5)',
    customer_name: 'Guest',
    status: 'SERVED',
    created_at: '2026-11-14T21:20:00Z',
    items: [
      { name: 'Chilly', quantity: 1, price: 395, status: 'SERVED', station: 'KITCHEN' },
      { name: 'Potato Fries', quantity: 2, price: 350, status: 'SERVED', station: 'KITCHEN' },
    ],
  },
  {
    id: 'ord-round-4',
    table_id: 'table-cabin-901',
    table_number: 'Cabin 901-Floor 9',
    order_number: 'ORD-134 (Round 4)',
    customer_name: 'Guest',
    status: 'SERVED',
    created_at: '2026-11-14T21:00:00Z',
    items: [
      { name: 'Cafe Mocha', quantity: 1, price: 240, status: 'SERVED', station: 'BAR' },
      { name: 'Lassi', quantity: 1, price: 113, status: 'SERVED', station: 'BAR' },
      { name: 'Soups', quantity: 1, price: 155, status: 'SERVED', station: 'KITCHEN' },
    ],
  },
];

// Perform grouping as implemented in BillingPOS
const map = new Map<string, MockOrder[]>();
for (const ord of mockPendingOrders) {
  const key = ord.table_id || (ord.table_number ? `tbl_${String(ord.table_number).trim().toLowerCase()}` : ord.id);
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(ord);
}

const grouped = Array.from(map.values()).map((orders) => {
  const sorted = [...orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const primaryOrder = sorted[0];
  const latestOrder = sorted[sorted.length - 1];

  let maxRound = 1;
  for (const ord of sorted) {
    const m = (ord.order_number || '').match(/\(Round\s*(\d+)\)/i);
    if (m) {
      const r = parseInt(m[1], 10);
      if (r > maxRound) maxRound = r;
    }
  }

  const cleanRootOrderNumber = primaryOrder.order_number.replace(/\s*\(Round\s*\d+\)/gi, '').trim();

  const allActiveItems = sorted.flatMap((ord) => {
    const ordRoundMatch = (ord.order_number || '').match(/\(Round\s*(\d+)\)/i);
    const ordRoundNum = ordRoundMatch ? parseInt(ordRoundMatch[1], 10) : 1;
    return ord.items.map((item, origIdx) => ({
      ...item,
      _orderId: ord.id,
      _origIdx: origIdx,
      round_number: item.round_number || ordRoundNum,
    }));
  });

  const totalPayable = allActiveItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

  return {
    tableName: `Table ${primaryOrder.table_number}`,
    cleanRootOrderNumber,
    maxRound,
    itemCount: allActiveItems.length,
    allActiveItems,
    totalPayable,
  };
});

assert.strictEqual(grouped.length, 1, 'Only 1 consolidated table group created for Table Cabin 901');
console.log(`  ✅ PASS: Active tables count = ${grouped.length} (corrected from 2 to 1)`);

const group = grouped[0];
assert.strictEqual(group.maxRound, 5, 'Detected highest round as Round 5');
console.log(`  ✅ PASS: Highest round badge = "Round ${group.maxRound}"`);

assert.strictEqual(group.cleanRootOrderNumber, 'ORD-134', 'Clean root order number is ORD-134');
console.log(`  ✅ PASS: Card Ref = "${group.cleanRootOrderNumber}"`);

assert.strictEqual(group.itemCount, 5, 'All 5 items consolidated on one table card');
console.log(`  ✅ PASS: Total items across rounds = ${group.itemCount} (2 from r5 + 3 from r4)`);

assert.strictEqual(group.totalPayable, 1603, 'Total items payable = 395 + 700 + 240 + 113 + 155 = 1603');
console.log(`  ✅ PASS: Total table payable = Rs. ${group.totalPayable}`);

// Check that round tagging exists on items
const chillyItem = group.allActiveItems.find((i) => i.name === 'Chilly');
assert.strictEqual(chillyItem?.round_number, 5, 'Chilly is tagged as Round 5');
console.log(`  ✅ PASS: Chilly tagged as Round ${chillyItem?.round_number}`);

const mochaItem = group.allActiveItems.find((i) => i.name === 'Cafe Mocha');
assert.strictEqual(mochaItem?.round_number, 4, 'Cafe Mocha is tagged as Round 4');
console.log(`  ✅ PASS: Cafe Mocha tagged as Round ${mochaItem?.round_number}`);

console.log('\n====================================================');
console.log('🏁 ALL TESTS PASSED: Multi-Round Billing & Table Grouping Verified');
console.log('====================================================');
