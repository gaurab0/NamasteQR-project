import { describe, it } from 'node:test';

function simulateCompQtyInput(
  raw: string,
  currentCompQty: any,
  itemQuantity: any
): { comp_qty: any; is_comp: boolean; comp_value: number; subtotal: number; total_price: number } {
  const price = 250;
  const qty = Math.max(1, Number(itemQuantity) || 1);

  if (raw === '') {
    const compQty = 0;
    const billedQty = qty;
    return {
      comp_qty: '',
      is_comp: false,
      comp_value: 0,
      subtotal: billedQty * price,
      total_price: billedQty * price,
    };
  }

  let clean = raw;
  const prevVal = Number(currentCompQty) || 0;
  // When previous value was 0, typing any digit (either before or after the 0) cleanly replaces the 0
  if (prevVal === 0 && raw.length === 2) {
    if (raw.endsWith('0')) {
      clean = raw[0];
    } else if (raw.startsWith('0')) {
      clean = raw.slice(1);
    }
  }
  // Strip any remaining leading zeros before digits (e.g. '001' -> '1')
  clean = clean.replace(/^0+(?=\d)/, '');
  const val = parseInt(clean, 10);
  const maxQty = Number(itemQuantity) || 1;
  const finalCompQty = isNaN(val) ? 0 : Math.min(Math.max(0, val), maxQty);
  const billedQty = Math.max(0, qty - finalCompQty);

  return {
    comp_qty: finalCompQty,
    is_comp: finalCompQty >= qty,
    comp_value: finalCompQty * price,
    subtotal: billedQty * price,
    total_price: billedQty * price,
  };
}

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string, details?: any) {
  if (cond) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`, details ?? '');
    failed++;
  }
}

console.log('🧪 Starting Comp Qty Input and Stepper Unit Tests...\n');

// 1. User types digit after default 0 (cursor at end)
console.log('1. User types digit after default 0 (raw "01")');
const res1 = simulateCompQtyInput('01', 0, 5);
assert(res1.comp_qty === 1, 'Default 0 disappears when typing 1 after 0, comp_qty is 1');
assert(res1.subtotal === 4 * 250, 'Subtotal correctly billed for remaining 4 items');
assert(res1.comp_value === 1 * 250, 'Comp value is 1 * 250 = 250');

// 2. User types digit before default 0 (cursor at beginning: raw "10" from prev 0)
console.log('\n2. User types digit before default 0 (raw "10" from prev 0)');
const res2 = simulateCompQtyInput('10', 0, 5);
assert(res2.comp_qty === 1, 'Default 0 disappears when typing 1 before 0 (raw "10" with prev 0 -> comp_qty 1)');

// 3. User types 0 while at default 0 (raw "00")
console.log('\n3. User types 0 while at default 0 (raw "00")');
const res3 = simulateCompQtyInput('00', 0, 5);
assert(res3.comp_qty === 0, 'Typing 0 keeps comp_qty at 0');

// 4. User types multi-digit when previous value > 0 (e.g. typing 0 after 1 -> "10")
console.log('\n4. User types 0 after 1 when quantity is 10 (raw "10" from prev 1)');
const res4 = simulateCompQtyInput('10', 1, 10);
assert(res4.comp_qty === 10, 'Typing 0 after 1 preserves "10" when previous was 1');

// 5. User selects all and types 3
console.log('\n5. User selects all and types 3');
const res5 = simulateCompQtyInput('3', 0, 5);
assert(res5.comp_qty === 3, 'Selected all replacement yields comp_qty = 3');

// 6. User clears input with Backspace (raw "")
console.log('\n6. User clears input with Backspace (raw "")');
const res6 = simulateCompQtyInput('', 3, 5);
assert(res6.comp_qty === '', 'Input can be cleared during typing without prematurely snapping to 0');
assert(res6.subtotal === 5 * 250, 'While empty, subtotal treats comp_qty as 0');

// 7. Clamping: comp_qty cannot exceed item quantity
console.log('\n7. Clamping: comp_qty cannot exceed item quantity');
const res7 = simulateCompQtyInput('99', 0, 3);
assert(res7.comp_qty === 3, 'Typing 99 with quantity 3 clamps comp_qty to 3');
assert(res7.is_comp === true, '100% comped item sets is_comp = true');
assert(res7.subtotal === 0, '100% comped item subtotal is 0');
assert(res7.comp_value === 3 * 250, 'Comp value equals total price (750)');

// 8. Negative input or invalid input
console.log('\n8. Negative input or invalid string');
const res8 = simulateCompQtyInput('-1', 0, 5);
assert(res8.comp_qty === 0, 'Negative input clamped to 0');

console.log(`\n========================================`);
console.log(`🏁 Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
