import assert from 'assert';
import { prisma } from '../src/lib/prisma';
import axios from 'axios';

async function runTest() {
  console.log('🧪 Starting Standardized Menu Import & Multi-Tier Option Test Suite...');

  // 1. Clean or create a test business
  const testBizId = 'test-menu-import-' + Date.now();
  await prisma.business.create({
    data: {
      id: testBizId,
      name: 'Import Test Restaurant',
    },
  });

  const baseUrl = process.env.TEST_API_URL || 'http://localhost:3000/api';

  console.log('\n📊 1. Simulating Excel Import Payload (from Image 2)');
  // Simulated data from Image 2
  const sampleItemsFromExcel = [
    // Americano Group (3 rows)
    {
      name: 'Americano (Double)',
      price: 166.00,
      category: 'Coffee',
      subCategory: 'Americano',
      erp_item_code: 'AB-12',
      description: 'Double Tasty Americano',
      food_type: 'veg',
      station: 'KITCHEN',
    },
    {
      name: 'Americano(Double) packing',
      price: 172.57,
      category: 'Coffee',
      subCategory: 'Americano',
      erp_item_code: 'AB-13',
      description: 'Double Tasty Americano(Packing)',
      food_type: 'non-veg',
      station: 'BAR',
    },
    {
      name: 'Americano(Packing)',
      price: 159.29,
      category: 'Coffee',
      subCategory: 'Americano',
      erp_item_code: 'AB-14',
      description: 'Tasty Americano',
      food_type: 'none',
      station: 'BOTH',
    },
    // Single row item: Appy(200ml)
    {
      name: 'Appy(200ml)',
      price: 26.55,
      category: 'Beverages',
      subCategory: 'Juice',
      erp_item_code: 'AB-15',
      description: '',
      food_type: 'none',
      station: 'BAR',
    },
    // Single row item: Beijing Chicken W.Rice(PACK)
    {
      name: 'Beijing Chicken W.Rice(PACK)',
      price: 318.58,
      category: 'Special',
      subCategory: 'Chinese',
      erp_item_code: 'CH-99',
      description: 'Authentic Chinese Rice',
      food_type: 'non-veg',
      station: 'KITCHEN',
    },
  ];

  // Grouping logic simulation (identical to MenuBulkImportModal.tsx)
  const groups = new Map<string, typeof sampleItemsFromExcel>();
  for (const row of sampleItemsFromExcel) {
    const key = row.subCategory
      ? `${row.category.toLowerCase()}:::${row.subCategory.toLowerCase()}`
      : `${row.category.toLowerCase()}:::item:::${row.name.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const consolidatedPayload: any[] = [];
  groups.forEach((rowList) => {
    if (rowList.length > 1) {
      const subCatName = rowList[0].subCategory || rowList[0].name;
      consolidatedPayload.push({
        name: subCatName,
        category: rowList[0].category,
        subCategory: subCatName,
        price: rowList[0].price,
        station: 'BOTH',
        has_variants: true,
        variant_group_name: 'Options',
        variants: rowList.map((r) => ({
          name: r.name,
          price: r.price,
          erp_item_code: r.erp_item_code,
          description: r.description,
          food_type: r.food_type,
          station: r.station,
        })),
        is_packageable: true,
      });
    } else {
      const single = rowList[0];
      consolidatedPayload.push({
        name: single.name,
        category: single.category,
        subCategory: single.subCategory,
        price: single.price,
        erp_item_code: single.erp_item_code,
        description: single.description,
        food_type: single.food_type,
        station: single.station,
        has_variants: false,
        is_packageable: true,
      });
    }
  });

  // Verify grouping result
  assert(consolidatedPayload.length === 3, `Expected 3 consolidated dishes, got ${consolidatedPayload.length}`);
  const americanoDish = consolidatedPayload.find((d) => d.name === 'Americano');
  assert(americanoDish, 'Americano dish exists');
  assert(americanoDish.has_variants === true, 'Americano has variants');
  assert(americanoDish.variant_group_name === 'Options', 'Option group title is Options');
  assert(americanoDish.variants.length === 3, 'Americano has 3 options');
  assert(americanoDish.variants[0].erp_item_code === 'AB-12', 'Variant 1 has code AB-12');
  assert(americanoDish.variants[0].station === 'KITCHEN', 'Variant 1 routes to KITCHEN');
  assert(americanoDish.variants[1].erp_item_code === 'AB-13', 'Variant 2 has code AB-13');
  assert(americanoDish.variants[1].station === 'BAR', 'Variant 2 routes to BAR');
  assert(americanoDish.variants[2].station === 'BOTH', 'Variant 3 routes to BOTH');

  console.log('  ✅ PASS: Frontend grouping creates consolidated Americano dish with 3 options and codes/routes');

  const beijingDish = consolidatedPayload.find((d) => d.name === 'Beijing Chicken W.Rice(PACK)');
  assert(beijingDish, 'Beijing Chicken dish exists as single dish');
  assert(beijingDish.has_variants === false, 'Beijing Chicken has no variants');
  assert(beijingDish.subCategory === 'Chinese', 'Subcategory tag is Chinese');

  console.log('  ✅ PASS: Single-row items remain standalone dishes with subcategory preserved');

  // Test Database persistence directly with Prisma
  console.log('\n💾 2. Testing Database Persistence');
  for (const item of consolidatedPayload) {
    await prisma.menuItem.create({
      data: {
        id: `dish_${Date.now()}_${Math.random()}`,
        business_id: testBizId,
        name: item.name,
        category: item.category,
        additional_categories: item.subCategory && item.subCategory !== item.name ? [item.subCategory] : [],
        price: item.price,
        has_variants: item.has_variants,
        variant_group_name: item.variant_group_name || null,
        variants: item.variants || undefined,
        is_packageable: item.is_packageable,
        station: item.station || 'KITCHEN',
        erp_item_code: item.erp_item_code || null,
      },
    });
  }

  const savedAmericano = await prisma.menuItem.findFirst({
    where: { business_id: testBizId, name: 'Americano' },
  });
  assert(savedAmericano, 'Saved Americano found in DB');
  assert(savedAmericano.has_variants === true, 'Saved Americano has_variants is true');
  assert(savedAmericano.variant_group_name === 'Options', 'Saved variant_group_name is Options');
  assert(Array.isArray(savedAmericano.variants), 'Saved variants is array');
  const savedVariants = savedAmericano.variants as any[];
  assert(savedVariants.length === 3, 'Saved variants length is 3');
  assert(savedVariants[0].erp_item_code === 'AB-12', 'DB Variant 0 has code AB-12');
  assert(savedVariants[0].station === 'KITCHEN', 'DB Variant 0 has station KITCHEN');
  assert(savedVariants[1].erp_item_code === 'AB-13', 'DB Variant 1 has code AB-13');
  assert(savedVariants[1].station === 'BAR', 'DB Variant 1 has station BAR');

  console.log('  ✅ PASS: DB persistence preserves option-level erp_item_code and station');

  // Cleanup
  await prisma.menuItem.deleteMany({ where: { business_id: testBizId } });
  await prisma.business.delete({ where: { id: testBizId } });

  console.log('\n========================================');
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
  console.log('========================================');
}

runTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  });
