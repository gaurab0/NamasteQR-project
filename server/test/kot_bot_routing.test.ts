import assert from 'assert';
import { EscPosEncoder } from '../../src/utils/escpos';
import { printService } from '../../src/services/print.service';

async function testKotBotRouting() {
  console.log('🧪 Starting KOT/BOT Print Routing Test Suite...\n');
  let passed = 0;

  const mixedOrder = {
    id: 'ORD-101',
    order_number: 'ORD-101',
    table_number: 'T-05',
    waiter_name: 'Suman',
    items: [
      { name: 'Veg Chowmein', quantity: 2, price: 150, station: 'KITCHEN' },
      { name: 'Chicken Momo', quantity: 1, price: 220, station: 'KITCHEN' },
      { name: 'Fresh Lime Soda', quantity: 2, price: 90, station: 'BAR' },
      { name: 'Mojito', quantity: 1, price: 320, station: 'BAR' },
    ],
  };

  const foodOnlyOrder = {
    id: 'ORD-102',
    order_number: 'ORD-102',
    table_number: 'T-02',
    waiter_name: 'Anita',
    items: [
      { name: 'Veg Burger', quantity: 1, price: 180, station: 'KITCHEN' },
      { name: 'French Fries', quantity: 1, price: 120, station: 'KITCHEN' },
    ],
  };

  const drinkOnlyOrder = {
    id: 'ORD-103',
    order_number: 'ORD-103',
    table_number: 'T-08',
    waiter_name: 'Bikash',
    items: [
      { name: 'Cold Beer', quantity: 2, price: 350, station: 'BAR' },
      { name: 'Iced Americano', quantity: 1, price: 180, station: 'BAR' },
    ],
  };

  // Test 1: ESC/POS Mixed Order on BOTH printer
  console.log('📦 Test 1: ESC/POS Mixed Order (Food + Drinks) on BOTH printer...');
  const bothReceipt = EscPosEncoder.buildReceipt(mixedOrder, { paperWidth: '80mm', role: 'BOTH' });
  const bothText = new TextDecoder().decode(bothReceipt);
  assert(bothText.includes('KOT / BOT') || bothText.includes('KITCHEN & BAR'), 'Must have combined header');
  assert(bothText.includes('[KITCHEN] Veg Chowmein'), 'Food item must be tagged [KITCHEN]');
  assert(bothText.includes('{2} [KITCHEN] Veg Chowmein'), 'Food item quantity must be enclosed in curly brackets {2}');
  assert(bothText.includes('[BAR] Fresh Lime Soda'), 'Drink item must be tagged [BAR]');
  assert(bothText.includes('{2} [BAR] Fresh Lime Soda'), 'Drink item quantity must be enclosed in curly brackets {2}');
  console.log('  ✅ PASS: Mixed order generated with combined title, curly bracket {qty}, and [KITCHEN]/[BAR] tags.');
  passed++;

  // Test 2: Dynamic title for Food-Only order on BOTH printer
  console.log('📦 Test 2: ESC/POS Food-Only Order on BOTH printer...');
  const foodBothReceipt = EscPosEncoder.buildReceipt(foodOnlyOrder, { paperWidth: '80mm', role: 'BOTH' });
  const foodBothText = new TextDecoder().decode(foodBothReceipt);
  assert(foodBothText.includes('KITCHEN ORDER TICKET (KOT)'), 'Must dynamically title as KOT when food-only');
  assert(!foodBothText.includes('BOT'), 'Must not mention BOT when no drinks present');
  console.log('  ✅ PASS: Food-only order dynamically titled as KOT.');
  passed++;

  // Test 3: Dynamic title for Drink-Only order on BOTH printer
  console.log('📦 Test 3: ESC/POS Drink-Only Order on BOTH printer...');
  const drinkBothReceipt = EscPosEncoder.buildReceipt(drinkOnlyOrder, { paperWidth: '80mm', role: 'BOTH' });
  const drinkBothText = new TextDecoder().decode(drinkBothReceipt);
  assert(drinkBothText.includes('BAR ORDER TICKET (BOT)'), 'Must dynamically title as BOT when drink-only');
  assert(!drinkBothText.includes('KOT'), 'Must not mention KOT when no food present');
  console.log('  ✅ PASS: Drink-only order dynamically titled as BOT.');
  passed++;

  // Test 4: Dedicated KOT printer item filtering
  console.log('📦 Test 4: Dedicated KOT Printer Item Filtering...');
  const dedicatedKotReceipt = EscPosEncoder.buildReceipt(mixedOrder, { paperWidth: '80mm', role: 'KOT' });
  const dedicatedKotText = new TextDecoder().decode(dedicatedKotReceipt);
  assert(dedicatedKotText.includes('Veg Chowmein'), 'KOT printer must include food');
  assert(!dedicatedKotText.includes('Fresh Lime Soda'), 'KOT printer must NOT include bar items');
  console.log('  ✅ PASS: Dedicated KOT printer strictly filtered to kitchen items.');
  passed++;

  // Test 5: Dedicated BAR printer item filtering
  console.log('📦 Test 5: Dedicated BAR Printer Item Filtering...');
  const dedicatedBarReceipt = EscPosEncoder.buildReceipt(mixedOrder, { paperWidth: '80mm', role: 'BAR' });
  const dedicatedBarText = new TextDecoder().decode(dedicatedBarReceipt);
  assert(!dedicatedBarText.includes('Veg Chowmein'), 'BAR printer must NOT include food items');
  assert(dedicatedBarText.includes('Fresh Lime Soda'), 'BAR printer must include bar items');
  console.log('  ✅ PASS: Dedicated BAR printer strictly filtered to bar items.');
  passed++;

  // Test 6: HTML Spooler output for BOTH role
  console.log('📦 Test 6: HTML Spooler Output for BOTH printer...');
  const htmlOutput = printService.generateHtml('BOTH', mixedOrder);
  assert(htmlOutput.includes('KOT / BOT') || htmlOutput.includes('KITCHEN &amp; BAR'), 'HTML must have combined header');
  assert(htmlOutput.includes('[KITCHEN]'), 'HTML must have [KITCHEN] badge');
  assert(htmlOutput.includes('[BAR]'), 'HTML must have [BAR] badge');
  assert(htmlOutput.includes('{2}</span>'), 'HTML KOT item quantity must be inside curly brackets {2}');
  assert(htmlOutput.includes('kot-item'), 'HTML KOT item must use .kot-item class for larger font');
  assert(htmlOutput.includes('kot-header-line'), 'HTML KOT header must use .kot-header-line to align title, order number, and table number');
  assert(!htmlOutput.includes('>2x</span>'), 'HTML KOT item must not use 2x format');
  console.log('  ✅ PASS: HTML spooler output formatted with badges, {qty} curly brackets, and unified kot-header-line sizes.');
  passed++;

  console.log(`\n========================================`);
  console.log(`🏁 All ${passed} KOT/BOT Routing Tests Passed!`);
  console.log(`========================================\n`);
}

testKotBotRouting().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
