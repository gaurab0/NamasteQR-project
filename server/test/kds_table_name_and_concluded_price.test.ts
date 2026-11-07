import { formatKdsTableName } from '../../src/components/kds/KitchenDisplaySystem';

console.log('🧪 Starting KDS Table Name and Concluded Price Unit Tests...');

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

// 1. KDS Table Name Formatting
assert(formatKdsTableName('Table 6 (Patio)') === 'Table 6 (Patio)', 'Normal table with zone preserved');
assert(formatKdsTableName('Table #Table 6 (Patio)') === 'Table 6 (Patio)', 'Duplicate Table #Table stripped cleanly');
assert(formatKdsTableName('Complementary(Yadab)') === 'Table Complementary (Yadab)', 'Special non-numeric table formatted with clean spacing');
assert(formatKdsTableName('Table #Complementary(Yadab)') === 'Table Complementary (Yadab)', 'Duplicate Table # prefix with special table stripped and formatted');
assert(formatKdsTableName('#12') === 'Table 12', 'Leading hash stripped and formatted');
assert(formatKdsTableName('Table #12') === 'Table 12', 'Table hash stripped and normalized');
assert(formatKdsTableName('5') === 'Table 5', 'Plain number normalized to Table 5');
assert(formatKdsTableName('Takeaway') === 'Takeaway', 'Takeaway orders preserved without adding Table');
assert(formatKdsTableName('Room 204') === 'Room 204', 'Room orders preserved without adding Table');
assert(formatKdsTableName('Delivery') === 'Delivery', 'Delivery orders preserved without adding Table');
assert(formatKdsTableName('Counter') === 'Counter', 'Counter orders preserved without adding Table');
assert(formatKdsTableName('Bar 3') === 'Bar 3', 'Bar orders preserved without adding Table');
assert(formatKdsTableName('') === 'Counter / Takeaway', 'Empty table returns Counter / Takeaway');
assert(formatKdsTableName(null) === 'Counter / Takeaway', 'Null table returns Counter / Takeaway');
assert(formatKdsTableName('   ') === 'Counter / Takeaway', 'Whitespace table returns Counter / Takeaway');

// 2. Concluded Price Resolution Hierarchy Simulation
interface CandidateOrder {
  total_amount?: number;
  subtotal?: number;
  currency?: string;
  payment_method?: string;
  items?: Array<{ name: string; price: number; quantity: number; status?: string }>;
}

function resolveConcludedPayment(
  candidates: CandidateOrder[],
  settledPaymentInfo?: { amount?: number; currency?: string; mode?: string } | null,
  cachedStorage?: { amount?: number; currency?: string; mode?: string } | null
) {
  let resolvedAmount: number | undefined = undefined;
  let resolvedCurrency: string = 'Rs.';
  let resolvedMode: string = 'Cash';

  for (const cand of candidates) {
    if (cand.currency && cand.currency.trim()) resolvedCurrency = cand.currency.trim();
    if (cand.payment_method && cand.payment_method.trim()) resolvedMode = cand.payment_method.trim();

    const amt = Number(cand.total_amount ?? cand.subtotal);
    if (!isNaN(amt) && amt > 0) {
      resolvedAmount = amt;
      break;
    }

    if (Array.isArray(cand.items) && cand.items.length > 0) {
      const itemSum = cand.items.reduce((acc, item) => {
        if (item.status === 'CANCELLED') return acc;
        return acc + (Number(item.price || 0) * Number(item.quantity || 1));
      }, 0);
      if (itemSum > 0) {
        resolvedAmount = itemSum;
        break;
      }
    }
  }

  if ((!resolvedAmount || resolvedAmount <= 0) && settledPaymentInfo?.amount && Number(settledPaymentInfo.amount) > 0) {
    resolvedAmount = Number(settledPaymentInfo.amount);
    if (settledPaymentInfo.currency) resolvedCurrency = settledPaymentInfo.currency;
    if (settledPaymentInfo.mode) resolvedMode = settledPaymentInfo.mode;
  }

  if (!resolvedAmount || resolvedAmount <= 0 && cachedStorage?.amount && Number(cachedStorage.amount) > 0) {
    resolvedAmount = Number(cachedStorage.amount);
    if (cachedStorage.currency) resolvedCurrency = cachedStorage.currency;
    if (cachedStorage.mode) resolvedMode = cachedStorage.mode;
  }

  return { amount: resolvedAmount, currency: resolvedCurrency, mode: resolvedMode };
}

// Test case A: Direct total_amount on active order
const resA = resolveConcludedPayment([{ total_amount: 1450, currency: 'Rs.', payment_method: 'Card' }]);
assert(resA.amount === 1450 && resA.mode === 'Card', 'Resolves direct total_amount and Card payment method');

// Test case B: Total missing, calculated from items
const resB = resolveConcludedPayment([{
  items: [
    { name: 'Coffee', price: 150, quantity: 2 },
    { name: 'Croissant', price: 200, quantity: 1 },
    { name: 'Cancelled Dish', price: 500, quantity: 1, status: 'CANCELLED' },
  ],
  currency: 'Rs.',
  payment_method: 'Cash',
}]);
assert(resB.amount === 500, 'Calculates sum from uncancelled items (150*2 + 200 = 500)');

// Test case C: Reset table where activeOrder was null but cached storage had last payment
const resC = resolveConcludedPayment([], null, { amount: 890, currency: 'Rs.', mode: 'QR Code' });
assert(resC.amount === 890 && resC.mode === 'QR Code', 'Restores from cachedStorage when table is reset by staff');

console.log(`\n🏁 Results: ${passed} Passed, ${failed} Failed`);
if (failed > 0) process.exit(1);
