import assert from 'assert';
import { amountToWords, resolveCurrencyConfig } from '../../src/utils/numberToWords';
import { printService } from '../../src/services/print.service';
import { EscPosEncoder } from '../../src/utils/escpos';

async function testNumberToWords() {
  console.log('🧪 Starting Number-to-Words Currency Engine Test Suite...\n');
  let passed = 0;

  // Test 1: Basic Rupees with Paisa (User's exact example 683.66)
  console.log('📦 Test 1: 683.66 in Rupees...');
  const res1 = amountToWords(683.66, 'Rs.');
  assert.strictEqual(
    res1,
    'Six Hundred Eighty-Three Rupees and Sixty-Six Paisa Only'
  );
  console.log(`  ✅ PASS: 683.66 => "${res1}"`);
  passed++;

  // Test 2: Whole Rupees amount
  console.log('📦 Test 2: 500 in Rupees...');
  const res2 = amountToWords(500, 'NPR');
  assert.strictEqual(res2, 'Five Hundred Rupees Only');
  console.log(`  ✅ PASS: 500 => "${res2}"`);
  passed++;

  // Test 3: South Asian scale - Lakhs & Crores
  console.log('📦 Test 3: 1,50,250.50 in NPR...');
  const res3 = amountToWords(150250.50, 'Rs');
  assert.strictEqual(
    res3,
    'One Lakh Fifty Thousand Two Hundred Fifty Rupees and Fifty Paisa Only'
  );
  console.log(`  ✅ PASS: 150250.50 => "${res3}"`);
  passed++;

  // Test 4: USA Dollar Currency ($)
  console.log('📦 Test 4: 683.66 in USD / $...');
  const res4 = amountToWords(683.66, '$');
  assert.strictEqual(
    res4,
    'Six Hundred Eighty-Three Dollars and Sixty-Six Cents Only'
  );
  console.log(`  ✅ PASS: 683.66 USD => "${res4}"`);
  passed++;

  // Test 5: Western scale - Millions
  console.log('📦 Test 5: 1,500,000 in USD...');
  const res5 = amountToWords(1500000, 'USD');
  assert.strictEqual(
    res5,
    'One Million Five Hundred Thousand Dollars Only'
  );
  console.log(`  ✅ PASS: 1.5M USD => "${res5}"`);
  passed++;

  // Test 6: British Pound (£)
  console.log('📦 Test 6: 12.50 in GBP / £...');
  const res6 = amountToWords(12.50, '£');
  assert.strictEqual(
    res6,
    'Twelve Pounds and Fifty Pence Only'
  );
  console.log(`  ✅ PASS: 12.50 GBP => "${res6}"`);
  passed++;

  // Test 7: Euro (€)
  console.log('📦 Test 7: 99.99 in EUR / €...');
  const res7 = amountToWords(99.99, '€');
  assert.strictEqual(
    res7,
    'Ninety-Nine Euros and Ninety-Nine Cents Only'
  );
  console.log(`  ✅ PASS: 99.99 EUR => "${res7}"`);
  passed++;

  // Test 8: Zero Amount
  console.log('📦 Test 8: 0 in Rupees & USD...');
  assert.strictEqual(amountToWords(0, 'Rs.'), 'Zero Rupees Only');
  assert.strictEqual(amountToWords(0, '$'), 'Zero Dollars Only');
  console.log('  ✅ PASS: Zero correctly handled');
  passed++;

  // Test 9: Single unit (1 Dollar, 1 Rupee)
  console.log('📦 Test 9: 1.01 in USD...');
  assert.strictEqual(amountToWords(1.01, 'USD'), 'One Dollar and One Cent Only');
  console.log('  ✅ PASS: Singular unit names correctly applied');
  passed++;

  // Test 10: HTML Print Spooler Integration
  console.log('📦 Test 10: HTML Print Spooler Final Bill includes "In words"...');
  const sampleBill = {
    id: 'sale-999',
    order_number: 'ORD-02',
    invoice_number: 'INV-100',
    table_number: 'Table 9',
    currency: 'Rs.',
    items: [
      { name: 'American Breakfast', quantity: 1, price: 495 },
      { name: 'Aalu Jeera', quantity: 1, price: 110.01 },
    ],
    subtotal: 605.01,
    total_tax: 78.65,
    total_amount: 683.66,
  };
  const htmlBill = printService.generateHtml('BILL', sampleBill);
  assert(htmlBill.includes('In words: Six Hundred Eighty-Three Rupees and Sixty-Six Paisa Only'), 'HTML must include In words for 683.66');
  console.log('  ✅ PASS: HTML Bill includes "In words: Six Hundred Eighty-Three Rupees and Sixty-Six Paisa Only"');
  passed++;

  // Test 11: ESC/POS Thermal Buffer Integration
  console.log('📦 Test 11: ESC/POS Thermal Buffer includes "In words"...');
  const escposReceipt = EscPosEncoder.buildReceipt(sampleBill, { role: 'BILL', paperWidth: '80mm' });
  const escposStr = new TextDecoder().decode(escposReceipt);
  assert(escposStr.includes('In words: Six Hundred Eighty-Three Rupees and Sixty-Six Paisa Only'), 'ESC/POS must include In words for 683.66');
  console.log('  ✅ PASS: ESC/POS receipt includes "In words: Six Hundred Eighty-Three Rupees and Sixty-Six Paisa Only"');
  passed++;

  console.log(`\n========================================`);
  console.log(`🏁 All ${passed} Number-to-Words Tests Passed!`);
  console.log(`========================================\n`);
}

testNumberToWords().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
