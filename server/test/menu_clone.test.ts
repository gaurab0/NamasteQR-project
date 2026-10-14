import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runMenuCloneTest() {
  console.log('🧪 Starting Franchise Menu Catalog Cloning Test Suite...');

  const sourceBizId = `test-clone-src-${Date.now()}`;
  const targetBizId = `test-clone-tgt-${Date.now()}`;

  try {
    await db.ensureBusiness(sourceBizId, 'Source Flagship Diner');
    await db.ensureBusiness(targetBizId, 'Target Franchise Branch');

    const testUser = { id: 'test-admin', role: 'OWNER', email: 'owner@test.com' };

    // 1. Create categories in source business
    const cat1 = await rbacService.createCategory(sourceBizId, { name: 'Burgers & Wraps', order: 0 }, testUser);
    const cat2 = await rbacService.createCategory(sourceBizId, { name: 'Beverages & Mocktails', order: 1 }, testUser);

    assert(Boolean(cat1.id && cat2.id), 'Source categories created');

    // 2. Create rich menu items in source business (including variants and descriptions)
    const item1 = await rbacService.createMenuItem(sourceBizId, {
      name: 'Deluxe Bacon Burger',
      category: 'Burgers & Wraps',
      category_id: cat1.id,
      price: 450,
      currency: 'Rs.',
      description: 'Double beef patty with smoked bacon and melted cheddar',
      food_type: 'non-veg',
      has_variants: true,
      variants: [
        { id: 'v1', name: 'Single Patty', price: 400, is_available: true },
        { id: 'v2', name: 'Double Patty', price: 450, is_available: true },
      ],
      display_style: 'hero',
      show_image: true,
      promo_badge: "Chef's Special",
      order_index: 0,
      preparation_time_mins: 20,
    }, testUser);

    const item2 = await rbacService.createMenuItem(sourceBizId, {
      name: 'Virgin Mojito',
      category: 'Beverages & Mocktails',
      category_id: cat2.id,
      price: 220,
      currency: 'Rs.',
      description: 'Fresh mint, lime juice, and sparkling soda',
      food_type: 'veg',
      has_variants: false,
      display_style: 'auto',
      show_image: true,
      order_index: 1,
      preparation_time_mins: 5,
    }, testUser);

    assert(Boolean(item1.id && item2.id), 'Source menu items created with variants');

    // 3. Clone catalog to target branch
    const cloneStats = await rbacService.cloneMenuCatalog(sourceBizId, targetBizId, testUser);

    assert(cloneStats.categoriesCloned === 2, `Categories cloned count is 2 (actual: ${cloneStats.categoriesCloned})`);
    assert(cloneStats.itemsCloned === 2, `Items cloned count is 2 (actual: ${cloneStats.itemsCloned})`);

    // 4. Verify target categories in database
    const targetCats = await prisma.menuCategory.findMany({ where: { business_id: targetBizId } });
    assert(targetCats.length === 2, 'Target branch has 2 distinct categories');
    assert(targetCats.some(c => c.name === 'Burgers & Wraps'), 'Target has "Burgers & Wraps"');
    assert(targetCats.some(c => c.name === 'Beverages & Mocktails'), 'Target has "Beverages & Mocktails"');

    // Verify IDs are unique and scoped to target business
    assert(targetCats.every(c => c.id !== cat1.id && c.id !== cat2.id), 'Target category IDs are unique and do not overwrite source IDs');

    // 5. Verify target items in database
    const targetItems = await prisma.menuItem.findMany({ where: { business_id: targetBizId } });
    assert(targetItems.length === 2, 'Target branch has 2 distinct menu items');

    const targetBurger = targetItems.find(i => i.name === 'Deluxe Bacon Burger');
    assert(Boolean(targetBurger), 'Target branch has "Deluxe Bacon Burger"');
    assert(targetBurger?.price.toNumber() === 450, 'Burger price is preserved (450)');
    assert(targetBurger?.has_variants === true, 'Burger has_variants is preserved as true');
    assert(Array.isArray(targetBurger?.variants) && (targetBurger.variants as any[]).length === 2, 'Burger variants (2 options) are preserved');

    const targetMojito = targetItems.find(i => i.name === 'Virgin Mojito');
    assert(Boolean(targetMojito), 'Target branch has "Virgin Mojito"');
    assert(targetMojito?.price.toNumber() === 220, 'Mojito price is preserved (220)');

    // Verify item IDs do not conflict with source item IDs
    assert(targetBurger?.id !== item1.id, 'Target item ID is distinct from source item ID');
    assert(targetMojito?.id !== item2.id, 'Target item ID is distinct from source item ID');

    // 6. Test Idempotency (re-running clone does not duplicate items)
    const secondClone = await rbacService.cloneMenuCatalog(sourceBizId, targetBizId, testUser);
    assert(secondClone.itemsCloned === 0, 'Re-cloning ignores existing items without creating duplicates');
    const finalItemsCount = await prisma.menuItem.count({ where: { business_id: targetBizId } });
    assert(finalItemsCount === 2, 'Total items count remains 2 after re-cloning');

    // Cleanup test data
    await prisma.menuItem.deleteMany({ where: { business_id: { in: [sourceBizId, targetBizId] } } });
    await prisma.menuCategory.deleteMany({ where: { business_id: { in: [sourceBizId, targetBizId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [sourceBizId, targetBizId] } } });

    console.log(`\n========================================`);
    console.log(`🏁 Menu Clone Test Results: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================`);
  } catch (err: any) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

runMenuCloneTest().then(() => {
  process.exit(failed > 0 ? 1 : 0);
});
