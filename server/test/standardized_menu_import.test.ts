import assert from 'assert';
import http from 'http';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { db } from '../src/services/db.service';
import { generateToken } from '../src/middleware/auth.middleware';
import {
  extractAndValidateMenuMatrix,
  validateDbMergeConflicts,
  STANDARD_MENU_TEMPLATE_ROWS,
} from '../../src/utils/menuImportValidator';

const STD_HEADERS = [
  'Item Name',
  'Sales Price without vat price',
  'Category',
  'SubCategory',
  'Item Code',
  'Descriptioin',
  'Veg/Non-Veg',
  'Order Route',
];

async function runTest() {
  console.log('🧪 Starting Standardized Menu Import & Irregularity Validation Test Suite...');

  // ---------------------------------------------------------------------------
  // PART 1: Pure Validator & Parser Unit Tests
  // ---------------------------------------------------------------------------
  console.log('\n📋 1. Testing Clean 8-Column Template & Multi-Tier Grouping (0 Errors, 0 Warnings)');
  const cleanSheet: any[][] = [
    STD_HEADERS,
    ['Americano (Double)', 166.0, 'Coffee', 'Americano', 'AB-12', 'Double Tasty Americano', 'Veg', 'Kitchen'],
    ['Americano(Double) packing', 172.57, 'Coffee', 'Americano', 'AB-13', 'Double Tasty Americano(Packing)', 'Non-veg', 'Bar'],
    ['Americano(Packing)', 159.29, 'Coffee', 'Americano', 'AB-14', 'Tasty Americano', 'None', 'Both'],
    ['Appy(200ml)', 26.55, 'Beverages', 'Juice', 'AB-15', 'Chilled apple juice', 'Veg', 'Bar'],
    ['Beijing Chicken W.Rice(PACK)', 318.58, 'Special', 'Chinese', 'CH-99', 'Authentic Chinese Rice', 'Non-Veg', 'Kitchen'],
  ];

  const cleanRes = extractAndValidateMenuMatrix(cleanSheet);
  assert.strictEqual(cleanRes.errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(cleanRes.errors)}`);
  assert.strictEqual(cleanRes.warnings.length, 0, `Expected 0 warnings, got: ${JSON.stringify(cleanRes.warnings)}`);
  assert.strictEqual(cleanRes.items.length, 3, `Expected 3 consolidated dishes, got ${cleanRes.items.length}`);

  const americanoDish = cleanRes.items.find((d) => d.name === 'Americano');
  assert(americanoDish, 'Americano dish exists');
  assert.strictEqual(americanoDish.has_variants, true);
  assert.strictEqual(americanoDish.variant_group_name, 'Options');
  assert.strictEqual(americanoDish.variants?.length, 3);
  assert.strictEqual(americanoDish.variants?.[0].erp_item_code, 'AB-12');
  assert.strictEqual(americanoDish.variants?.[0].station, 'KITCHEN');
  assert.strictEqual(americanoDish.variants?.[1].erp_item_code, 'AB-13');
  assert.strictEqual(americanoDish.variants?.[1].station, 'BAR');
  assert.strictEqual(americanoDish.variants?.[2].station, 'BOTH');

  const beijingDish = cleanRes.items.find((d) => d.name === 'Beijing Chicken W.Rice(PACK)');
  assert(beijingDish, 'Beijing Chicken dish exists as single dish');
  assert.strictEqual(beijingDish.has_variants, false);
  assert.strictEqual(beijingDish.subCategory, 'Chinese');

  const templateRes = extractAndValidateMenuMatrix(STANDARD_MENU_TEMPLATE_ROWS);
  assert.strictEqual(templateRes.errors.length, 0, `Template expected 0 errors, got: ${JSON.stringify(templateRes.errors)}`);
  assert.strictEqual(templateRes.warnings.length, 0, `Template expected 0 warnings, got: ${JSON.stringify(templateRes.warnings)}`);
  assert.strictEqual(templateRes.summary.totalDataRows, 16, 'Template has 16 data rows');
  console.log('  ✅ PASS: Clean 8-column sheet & Sample Template yield 0 Errors, 0 Warnings, and accurate multi-tier grouping');

  console.log('\n📋 2. Testing Empty Sheet, Missing Headers, and Duplicate Headers');
  const emptyRes = extractAndValidateMenuMatrix([]);
  assert(emptyRes.errors.some((e) => e.code === 'EMPTY_SHEET'), 'Empty matrix triggers EMPTY_SHEET');

  const headersOnlyRes = extractAndValidateMenuMatrix([STD_HEADERS, ['', '', '', '']]);
  assert(headersOnlyRes.errors.some((e) => e.code === 'EMPTY_SHEET'), 'Headers with 0 data rows triggers EMPTY_SHEET');

  const missingHeaderRes = extractAndValidateMenuMatrix([
    ['Item Name', 'Sales Price without vat price', 'Category', 'SubCategory', 'Item Code', 'Description'],
    ['Tea', 50, 'Hot Drinks', 'Tea', 'T-1', 'Hot tea'],
  ]);
  const missingCols = missingHeaderRes.errors.filter((e) => e.code === 'MISSING_HEADER').map((e) => e.column);
  assert(missingCols.includes('Veg/Non-Veg') && missingCols.includes('Order Route'), 'Missing Veg/Non-Veg and Order Route flagged');
  assert.strictEqual(missingHeaderRes.items.length, 0, 'Missing required header blocks dish grouping');

  const dupHeaderRes = extractAndValidateMenuMatrix([
    ['Item Name', 'Sales Price without vat price', 'Category', 'Category', 'SubCategory', 'Item Code', 'Description', 'Veg/Non-Veg', 'Order Route'],
    ['Tea', 50, 'Hot Drinks', 'Beverages', 'Tea', 'T-1', 'Hot tea', 'Veg', 'Bar'],
  ]);
  assert(dupHeaderRes.errors.some((e) => e.code === 'DUPLICATE_HEADER' && e.column === 'Category'), 'Duplicate Category header flagged');
  console.log('  ✅ PASS: Sheet/header irregularities caught accurately');

  console.log('\n📋 3. Testing Empty Mandatory Cells, Blank Trailing Rows & Summary Noise Rows');
  const blanksMatrix: any[][] = [
    STD_HEADERS,
    ['', 100, 'Coffee', 'Espresso', 'E-1', 'Strong coffee', 'Veg', 'Bar'], // Row 2: empty Item Name -> ERROR
    ['Coke', 60, 'Beverages', '', 'C-1', 'Cold drink', '', ''], // Row 3: blank SubCategory, Veg/Non-Veg, Order Route -> 3 ERRORS
    ['Sprite', 60, 'Beverages', 'Soft Drinks', '', '', 'None', 'Bar'], // Row 4: blank Item Code & Description -> 2 WARNINGS only
    ['Subtotal', 220, '', '', '', '', '', ''], // Row 5: summary noise row -> SUMMARY_ROW ERROR
    ['', '', '', '', '', '', '', ''], // Row 6: 100% blank trailing row -> IGNORED
    [], // Row 7: empty array -> IGNORED
  ];
  const blanksRes = extractAndValidateMenuMatrix(blanksMatrix);
  assert(blanksRes.errors.some((e) => e.rowNumber === 2 && e.column === 'Item Name' && e.code === 'EMPTY_CELL'), 'Row 2 empty Item Name flagged with exact rowNumber 2');
  assert(blanksRes.errors.some((e) => e.rowNumber === 3 && e.column === 'SubCategory' && e.code === 'EMPTY_CELL'), 'Row 3 empty SubCategory flagged');
  assert(blanksRes.errors.some((e) => e.rowNumber === 3 && e.column === 'Veg/Non-Veg' && e.code === 'EMPTY_CELL'), 'Row 3 empty Veg/Non-Veg flagged');
  assert(blanksRes.errors.some((e) => e.rowNumber === 3 && e.column === 'Order Route' && e.code === 'EMPTY_CELL'), 'Row 3 empty Order Route flagged');
  assert(blanksRes.errors.some((e) => e.rowNumber === 5 && e.code === 'SUMMARY_ROW'), 'Row 5 Subtotal flagged as SUMMARY_ROW');
  assert(!blanksRes.errors.some((e) => e.rowNumber === 4), 'Row 4 with blank Item Code & Description has 0 errors');
  assert(blanksRes.warnings.some((w) => w.rowNumber === 4 && w.column === 'Item Code' && w.code === 'EMPTY_CELL'), 'Row 4 blank Item Code is a warning');
  assert(blanksRes.warnings.some((w) => w.rowNumber === 4 && w.column === 'Description' && w.code === 'EMPTY_CELL'), 'Row 4 blank Description is a warning');
  assert(!blanksRes.errors.some((e) => e.rowNumber >= 6) && !blanksRes.warnings.some((w) => w.rowNumber >= 6), '100% blank trailing rows ignored');
  console.log('  ✅ PASS: Strict 6-error / 2-warning blank policy, summary row, and blank trailing row ignore verified');

  console.log('\n📋 4. Testing Case-Insensitive Duplicate Item Name & Duplicate Item Code');
  const dupMatrix: any[][] = [
    STD_HEADERS,
    ['Coke', 53.1, 'Beverages', 'Soft Drinks', 'AB-12', 'Chilled Coke', 'None', 'Bar'], // Row 2
    ['coke', 60.0, 'Beverages', 'Soft Drinks', 'AB-13', 'Lowercase coke duplicate', 'None', 'Bar'], // Row 3 -> dup name
    ['  COKE  ', 70.0, 'Beverages', 'Soft Drinks', 'ab-12', 'Uppercase padded coke + dup code', 'None', 'Bar'], // Row 4 -> dup name + dup code + whitespace
  ];
  const dupRes = extractAndValidateMenuMatrix(dupMatrix);
  const dupNameErrors = dupRes.errors.filter((e) => e.code === 'DUPLICATE_ITEM_NAME');
  assert.strictEqual(dupNameErrors.length, 2, `Expected 2 duplicate name errors, got ${dupNameErrors.length}`);
  assert(dupNameErrors.some((e) => e.rowNumber === 3 && e.message.includes('Row 2')), 'Row 3 "coke" conflicts with Row 2 "Coke"');
  assert(dupNameErrors.some((e) => e.rowNumber === 4 && e.message.includes('Row 2')), 'Row 4 "COKE" conflicts with Row 2 "Coke"');
  assert(dupRes.errors.some((e) => e.code === 'DUPLICATE_ITEM_CODE' && e.rowNumber === 4), 'Row 4 duplicate Item Code ab-12 flagged');
  assert(dupRes.warnings.some((w) => w.code === 'WHITESPACE_ISSUE' && w.rowNumber === 4), 'Row 4 leading/trailing spaces flagged as whitespace warning');
  console.log('  ✅ PASS: Case-insensitive duplicate Item Name & Item Code caught with exact row references');

  console.log('\n📋 5. Testing Prices, Enums, Formula Errors, Cross-Category SubCategory & Typo Hints');
  const dirtyMatrix: any[][] = [
    STD_HEADERS,
    ['Bad Price Text', '150abc', 'Food', 'Snacks', 'S-1', 'Desc', 'Veg', 'Kitchen'], // Row 2: INVALID_PRICE
    ['Zero Price', 0, 'Food', 'Snacks', 'S-2', 'Desc', 'Veg', 'Kitchen'], // Row 3: INVALID_PRICE
    ['Negative Price', -50, 'Food', 'Snacks', 'S-3', 'Desc', 'Veg', 'Kitchen'], // Row 4: INVALID_PRICE
    ['Valid Currency', 'Rs. 1,250.50', 'Food', 'Snacks', 'S-4', 'Desc', 'Vegetarian', 'KOT'], // Row 5: VALID!
    ['Precision Rounding', 166.667, 'Food', 'Snacks', 'S-5', 'Desc', 'Non Veg', 'BOT'], // Row 6: PRICE_PRECISION warning
    ['Formula Broken', '#N/A', 'Food', 'Snacks', 'S-6', 'Desc', 'Egg', 'Kichen'], // Row 7: FORMULA_ERROR + INVALID_FOOD_TYPE + INVALID_ORDER_ROUTE
    ['Lassi One', 120, 'Beverages', 'Lassi', 'L-1', 'Sweet lassi', 'Veg', 'Bar'], // Row 8
    ['Lassi Two', 130, 'Drinks', 'Lassi', 'L-2', 'Mango lassi', 'Veg', 'Bar'], // Row 9: SUBCATEGORY_CATEGORY_CONFLICT
    ['Cappuchino Cup', 180, 'Coffee', 'Cappuchino', 'C-1', 'Coffee', 'Veg', 'Bar'], // Row 10: typo SubCategory
    ['Cappuccino Cup', 190, 'Coffee', 'Cappuccino', 'C-2', 'Coffee', 'Veg', 'Bar'], // Row 11
    ['Cappuccino Large', 210, 'Coffee', 'Cappuccino', 'C-3', 'Coffee', 'Veg', 'Bar'], // Row 12
    ['Tea Regular', 40, 'Beverges', 'Tea', 'T-1', 'Hot tea', 'Veg', 'Bar'], // Row 13: typo Category (Beverges vs Beverages)
    ['Sea Buckthorn', 90, 'Beverages', 'Sea', 'SB-1', 'Juice', 'Veg', 'Bar'], // Row 14: short word "Tea" vs "Sea" must NOT false-alarm typo
    ['Subcent Float', 0.004, 'Food', 'Snacks', 'S-7', 'Desc', 'Veg', 'Kitchen'], // Row 15: rounds to 0.00 -> INVALID_PRICE
    ['Decimal Comma Typo', '12,50', 'Food', 'Snacks', 'S-8', 'Desc', 'Veg', 'Kitchen'], // Row 16: invalid comma grouping -> INVALID_PRICE
    ['Lakhs Currency', 'NPR 1,50,000.50', 'Food', 'Snacks', 'S-9', 'Desc', 'Veg', 'Kitchen'], // Row 17: valid South Asian lakhs grouping + outlier warning
  ];
  const dirtyRes = extractAndValidateMenuMatrix(dirtyMatrix);
  assert(dirtyRes.errors.some((e) => e.rowNumber === 2 && e.code === 'INVALID_PRICE'), 'Row 2 "150abc" rejected');
  assert(dirtyRes.errors.some((e) => e.rowNumber === 3 && e.code === 'INVALID_PRICE'), 'Row 3 0 price rejected');
  assert(dirtyRes.errors.some((e) => e.rowNumber === 4 && e.code === 'INVALID_PRICE'), 'Row 4 -50 price rejected');
  assert(!dirtyRes.errors.some((e) => e.rowNumber === 5), 'Row 5 "Rs. 1,250.50" + Vegetarian + KOT valid');
  assert(dirtyRes.warnings.some((w) => w.rowNumber === 6 && w.code === 'PRICE_PRECISION'), 'Row 6 166.667 emits PRICE_PRECISION warning');
  assert(dirtyRes.errors.some((e) => e.rowNumber === 7 && e.code === 'FORMULA_ERROR'), 'Row 7 #N/A emits FORMULA_ERROR');
  assert(dirtyRes.errors.some((e) => e.rowNumber === 7 && e.code === 'INVALID_FOOD_TYPE'), 'Row 7 "Egg" emits INVALID_FOOD_TYPE');
  assert(dirtyRes.errors.some((e) => e.rowNumber === 7 && e.code === 'INVALID_ORDER_ROUTE'), 'Row 7 "Kichen" emits INVALID_ORDER_ROUTE');
  assert(dirtyRes.errors.some((e) => e.rowNumber === 9 && e.code === 'SUBCATEGORY_CATEGORY_CONFLICT'), 'Row 9 Lassi under Drinks vs Beverages emits SUBCATEGORY_CATEGORY_CONFLICT');
  assert(dirtyRes.warnings.some((w) => w.rowNumber === 10 && w.code === 'TYPO_HINT'), 'Row 10 Cappuchino vs Cappuccino emits TYPO_HINT');
  assert(dirtyRes.warnings.some((w) => w.rowNumber === 13 && w.code === 'TYPO_HINT'), 'Row 13 Beverges vs Beverages emits TYPO_HINT');
  assert(!dirtyRes.warnings.some((w) => w.rowNumber === 14 && w.code === 'TYPO_HINT'), 'Short distinct SubCategory "Tea" vs "Sea" does not false-alarm');
  assert(dirtyRes.errors.some((e) => e.rowNumber === 15 && e.code === 'INVALID_PRICE'), 'Row 15 sub-cent 0.004 rounding to 0 rejected as INVALID_PRICE');
  assert(dirtyRes.errors.some((e) => e.rowNumber === 16 && e.code === 'INVALID_PRICE'), 'Row 16 "12,50" comma typo rejected as INVALID_PRICE');
  assert(!dirtyRes.errors.some((e) => e.rowNumber === 17), 'Row 17 "NPR 1,50,000.50" accepted');
  assert(dirtyRes.warnings.some((w) => w.rowNumber === 17 && w.code === 'PRICE_PRECISION'), 'Row 17 > 100k emits PRICE_PRECISION warning');
  console.log('  ✅ PASS: All price, enum, formula error, subcategory conflict, and typo hint rules verified');

  // Verify XLSX native error cell extraction ({ t: 'e' })
  const errWs = XLSX.utils.aoa_to_sheet([STD_HEADERS, ['Tea', 50, 'Beverages', 'Tea', 'T-1', 'Hot', 'Veg', 'Bar']]);
  errWs['B2'] = { t: 'e', v: 23, w: '#REF!' };
  const errWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(errWb, errWs, 'Sheet1');
  const parsedWb = XLSX.read(XLSX.write(errWb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  const cellVal = XLSX.utils.format_cell(parsedWb.Sheets['Sheet1']['B2']);
  assert.strictEqual(cellVal, '#REF!', 'SheetJS native error cell formats as #REF!');
  console.log('  ✅ PASS: Native XLSX error cell ({ t: "e" }) preservation verified');

  // ---------------------------------------------------------------------------
  // PART 2: Live Express Route + PostgreSQL DB Integration Tests
  // ---------------------------------------------------------------------------
  console.log('\n💾 6. Testing Express Validation/Import Routes & Database Integrity');
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api`;

  const testBizId = 'test-menu-import-' + Date.now();
  const ownerEmail = `owner_${Date.now()}@import.test`;

  try {
    await db.ensureBusiness(testBizId, 'Import Test Restaurant', 'RESTAURANT');
    const ownerUser = await db.ensureUser({
      id: `usr-import-${Date.now()}`,
      business_id: testBizId,
      email: ownerEmail,
      role: 'RESTAURANT_OWNER',
      name: 'Import Owner',
    });
    const token = generateToken({
      userId: ownerUser.id,
      email: ownerEmail,
      role: 'RESTAURANT_OWNER',
      businessId: testBizId,
    });
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 6a. Pre-flight /validate on clean sheet
    const valCleanRes = await axios.post(
      `${baseUrl}/menus/bulk-import/validate?businessId=${testBizId}`,
      { rawRows: cleanSheet, mode: 'merge', pricingMode: 'inclusive', taxRate: 13 },
      { headers: authHeaders }
    );
    assert.strictEqual(valCleanRes.data.valid, true, 'Validate returns valid: true for clean sheet');
    assert.strictEqual(valCleanRes.data.errors.length, 0);
    assert.strictEqual(valCleanRes.data.warnings.length, 0);
    console.log('  ✅ PASS: POST /api/menus/bulk-import/validate approves clean 8-column matrix');

    // 6b. Import clean sheet into DB
    const importRes = await axios.post(
      `${baseUrl}/menus/bulk-import?businessId=${testBizId}`,
      { rawRows: cleanSheet, items: cleanRes.items, mode: 'merge', pricingMode: 'inclusive', taxRate: 13 },
      { headers: authHeaders }
    );
    assert.strictEqual(importRes.data.success, true);
    assert.strictEqual(importRes.data.createdCount, 3);

    const savedAmericano = await prisma.menuItem.findFirst({
      where: { business_id: testBizId, name: 'Americano' },
    });
    assert(savedAmericano, 'Saved Americano found in DB');
    assert.strictEqual(savedAmericano.has_variants, true);
    assert.strictEqual(savedAmericano.variant_group_name, 'Options');
    const savedVariants = savedAmericano.variants as any[];
    assert.strictEqual(savedVariants.length, 3);
    assert.strictEqual(savedVariants[0].erp_item_code, 'AB-12');
    assert.strictEqual(savedVariants[0].station, 'KITCHEN');
    assert.strictEqual(savedVariants[1].erp_item_code, 'AB-13');
    assert.strictEqual(savedVariants[1].station, 'BAR');
    console.log('  ✅ PASS: DB persistence preserves option-level erp_item_code and station');

    // 6c. Blocking 422 in REPLACE mode must NOT delete existing DB records
    let replace422 = false;
    try {
      await axios.post(
        `${baseUrl}/menus/bulk-import?businessId=${testBizId}`,
        { rawRows: dupMatrix, mode: 'replace', pricingMode: 'inclusive', taxRate: 13 },
        { headers: authHeaders }
      );
    } catch (err: any) {
      if (err.response?.status === 422 && err.response?.data?.error?.code === 'IMPORT_VALIDATION_FAILED') {
        replace422 = true;
        assert(err.response.data.validation.errors.length >= 3, '422 payload returns structured validation errors');
      }
    }
    assert(replace422, 'Broken sheet in replace mode returns HTTP 422 IMPORT_VALIDATION_FAILED');
    const countAfterFailedReplace = await prisma.menuItem.count({ where: { business_id: testBizId } });
    assert.strictEqual(countAfterFailedReplace, 3, 'Existing 3 DB dishes preserved after 422 replace failure');
    console.log('  ✅ PASS: Replace mode returns 422 and preserves existing DB items when validation fails');

    // 6d. Merge mode DB cross-collision (SKU matches Americano AB-12 while Name matches Appy(200ml))
    const collisionSheet: any[][] = [
      STD_HEADERS,
      ['Appy(200ml)', 30, 'Beverages', 'Juice', 'AB-12', 'Apple juice conflict', 'Veg', 'Bar'],
    ];
    const valCollisionRes = await axios.post(
      `${baseUrl}/menus/bulk-import/validate?businessId=${testBizId}`,
      { rawRows: collisionSheet, mode: 'merge', pricingMode: 'inclusive', taxRate: 13 },
      { headers: authHeaders }
    );
    assert.strictEqual(valCollisionRes.data.valid, false);
    assert(
      valCollisionRes.data.errors.some((e: any) => e.code === 'DB_CROSS_COLLISION'),
      'DB cross-collision detected in merge mode'
    );

    let mergeCollision422 = false;
    try {
      await axios.post(
        `${baseUrl}/menus/bulk-import?businessId=${testBizId}`,
        { rawRows: collisionSheet, mode: 'merge', pricingMode: 'inclusive', taxRate: 13 },
        { headers: authHeaders }
      );
    } catch (err: any) {
      if (err.response?.status === 422) mergeCollision422 = true;
    }
    assert(mergeCollision422, 'DB cross-collision blocked with HTTP 422 on import');

    // 6e. Merge mode DB casing mismatch warning
    const casingSheet: any[][] = [
      STD_HEADERS,
      ['appy(200ml)', 30, 'Beverages', 'Juice', 'AB-15', 'Apple juice', 'Veg', 'Bar'],
    ];
    const valCasingRes = await axios.post(
      `${baseUrl}/menus/bulk-import/validate?businessId=${testBizId}`,
      { rawRows: casingSheet, mode: 'merge', pricingMode: 'inclusive', taxRate: 13 },
      { headers: authHeaders }
    );
    assert.strictEqual(valCasingRes.data.valid, true, 'DB casing mismatch is non-blocking warning');
    assert(
      valCasingRes.data.warnings.some((w: any) => w.code === 'DB_CASING_MISMATCH'),
      'DB casing mismatch warning emitted'
    );

    // 6f. Merge target collision + option-level SKU cross-collision unit & API checks
    const targetCollisionCheck = validateDbMergeConflicts(
      [
        { name: 'Appy(200ml)', category: 'Beverages', price: 26.55, calculatedPrice: 26.55, station: 'BAR', has_variants: false, sourceRowNumbers: [2] },
        { name: 'Appy Fresh', erp_item_code: 'AB-15', category: 'Beverages', price: 30, calculatedPrice: 30, station: 'BAR', has_variants: false, sourceRowNumbers: [3] },
      ],
      [],
      [{ id: 'd1', name: 'Appy(200ml)', erp_item_code: 'AB-15', category: 'Beverages' }],
      'merge'
    );
    assert(
      targetCollisionCheck.errors.some((e) => e.code === 'DB_MERGE_TARGET_COLLISION'),
      'Two sheet dishes converging onto one DB item emits DB_MERGE_TARGET_COLLISION'
    );

    const optionSkuCollisionSheet: any[][] = [
      STD_HEADERS,
      ['New Smoothie Regular', 150, 'Beverages', 'Smoothie', 'SM-1', 'Fruit smoothie', 'Veg', 'Bar'],
      ['New Smoothie Large', 200, 'Beverages', 'Smoothie', 'AB-13', 'Variant SKU collides with Americano option AB-13', 'Veg', 'Bar'],
    ];
    const valOptionCollisionRes = await axios.post(
      `${baseUrl}/menus/bulk-import/validate?businessId=${testBizId}`,
      { rawRows: optionSkuCollisionSheet, mode: 'merge', pricingMode: 'inclusive', taxRate: 13 },
      { headers: authHeaders }
    );
    assert.strictEqual(valOptionCollisionRes.data.valid, false, 'Option-level variant SKU collision blocked');
    assert(
      valOptionCollisionRes.data.errors.some((e: any) => e.code === 'DB_CROSS_COLLISION' && e.rowNumber === 3),
      'Variant SKU AB-13 cross-collision flagged on Row 3'
    );

    // 6g. Explicit Order Route = Kitchen on Beverages & Veg/Non-Veg = None on Veg Starters must NOT be overwritten
    const explicitRouteSheet: any[][] = [
      STD_HEADERS,
      ['Warm Milk', 90, 'Beverages', 'Milk', 'MK-1', 'Hot milk from kitchen', 'Veg', 'Kitchen'],
      ['Water Bottle', 40, 'Veg & Non-Veg Sides', 'Water', 'WB-1', 'Mineral water', 'None', 'Bar'],
    ];
    const explicitImportRes = await axios.post(
      `${baseUrl}/menus/bulk-import?businessId=${testBizId}`,
      { rawRows: explicitRouteSheet, mode: 'merge', pricingMode: 'inclusive', taxRate: 13 },
      { headers: authHeaders }
    );
    assert.strictEqual(explicitImportRes.data.success, true);
    assert(Array.isArray(explicitImportRes.data.validation?.warnings), '200 bulk-import returns validation.warnings');

    const getMenusRes = await axios.get(`${baseUrl}/menus?businessId=${testBizId}`, { headers: authHeaders });
    const milkMenu = getMenusRes.data.data.find((m: any) => m.name === 'Warm Milk');
    const waterMenu = getMenusRes.data.data.find((m: any) => m.name === 'Water Bottle');
    assert.strictEqual(milkMenu?.station, 'KITCHEN', 'Explicit Order Route Kitchen preserved for Beverages category');
    assert.strictEqual(milkMenu?.erp_item_code, 'MK-1', 'GET /api/menus returns erp_item_code');
    assert.strictEqual(waterMenu?.food_type, 'none', 'Explicit Veg/Non-Veg None preserved even if category includes Veg');
    console.log('  ✅ PASS: Merge DB cross-collision, option SKU collision, explicit route/food_type preservation, and GET /api/menus SKU verified');

    console.log('\n========================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
    console.log('========================================');
  } finally {
    await prisma.menuItem.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.menuCategory.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { business_id: testBizId } }).catch(() => {});
    await prisma.business.delete({ where: { id: testBizId } }).catch(() => {});
    server.close();
  }
}

runTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  });
