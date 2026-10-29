import http from 'node:http';
import net from 'node:net';
import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';
import { createApp } from '../src/app';

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

async function runOutOfStockTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 OUT OF STOCK & UNAVAILABLE RESTRICTION TEST SUITE');
  console.log('======================================================\n');

  const bizId = `test-oos-${Date.now()}`;
  const testUser = { id: 'test-admin', role: 'OWNER', email: 'owner@test.com' };

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as net.AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await db.ensureBusiness(bizId, 'Out of Stock Test Cafe');
        break;
      } catch (e: any) {
        if (attempt === 3) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Create a test table
    const table = await prisma.restaurantTable.create({
      data: {
        business_id: bizId,
        table_number: 'T-OOS-1',
        status: 'OCCUPIED',
      },
    });

    // 1. Create a category
    const cat = await rbacService.createCategory(bizId, { name: 'Beverages', order: 0 }, testUser);

    // 2. Create menu items:
    // (a) Regular available item
    const availableItem = await rbacService.createMenuItem(bizId, {
      name: 'Iced Americano',
      category: 'Beverages',
      category_id: cat.id,
      price: 150,
      status: 'available',
      is_available: true,
    }, testUser);

    // (b) Item marked out_of_stock
    const oosItem = await rbacService.createMenuItem(bizId, {
      name: 'Fresh Soda',
      category: 'Beverages',
      category_id: cat.id,
      price: 60,
      status: 'out_of_stock',
      is_available: false,
    }, testUser);

    // (c) Item marked unavailable
    const unavailItem = await rbacService.createMenuItem(bizId, {
      name: 'Seasonal Mango Smoothie',
      category: 'Beverages',
      category_id: cat.id,
      price: 220,
      status: 'unavailable',
      is_available: false,
    }, testUser);

    // (d) Item marked is_available = false (even if status is available)
    const disabledFlagItem = await rbacService.createMenuItem(bizId, {
      name: 'Special Green Tea',
      category: 'Beverages',
      category_id: cat.id,
      price: 100,
      status: 'available',
      is_available: false,
    }, testUser);

    // (e) Item with variants: One available, one out of stock
    const variantItem = await rbacService.createMenuItem(bizId, {
      name: 'Craft Soda',
      category: 'Beverages',
      category_id: cat.id,
      price: 80,
      status: 'available',
      is_available: true,
      has_variants: true,
      variants: [
        { id: 'var-plain', name: 'Plain Soda', price: 60, is_available: false, status: 'out_of_stock' },
        { id: 'var-lemon', name: 'Fresh Lemon Soda', price: 80, is_available: true, status: 'available' },
      ],
    }, testUser);

    // (f) Item where status is available, but ALL variants are out of stock
    const allVariantsOosItem = await rbacService.createMenuItem(bizId, {
      name: 'Zero Sugar Cola',
      category: 'Beverages',
      category_id: cat.id,
      price: 90,
      status: 'available',
      is_available: true,
      has_variants: true,
      variants: [
        { id: 'var-can', name: 'Can 330ml', price: 90, is_available: false, status: 'out_of_stock' },
        { id: 'var-btl', name: 'Bottle 500ml', price: 120, is_available: false, status: 'unavailable' },
      ],
    }, testUser);

    console.log('📦 Test 1: Service level - Available item ordering succeeds');
    const validOrder = await rbacService.createTableOrder(bizId, {
      table_id: table.id,
      table_number: table.table_number,
      items: [
        {
          item_id: availableItem.id,
          name: availableItem.name,
          price: 150,
          quantity: 1,
        } as any,
      ],
    });
    assert(Boolean(validOrder && validOrder.id), 'Successfully ordered available item');

    console.log('\n📦 Test 2: Service level - Rejects status === "out_of_stock"');
    let oosThrew = false;
    let oosError: any = null;
    try {
      await rbacService.createTableOrder(bizId, {
        table_id: table.id,
        table_number: table.table_number,
        items: [
          {
            item_id: oosItem.id,
            name: oosItem.name,
            price: 60,
            quantity: 1,
          } as any,
        ],
      });
    } catch (err: any) {
      oosThrew = true;
      oosError = err;
    }
    assert(oosThrew, 'createTableOrder threw error for out_of_stock item');
    assert(oosError?.statusCode === 400, 'Error status code is 400');
    assert(oosError?.message?.includes('out of stock'), `Error message mentions out of stock: "${oosError?.message}"`);

    console.log('\n📦 Test 3: Service level - Rejects status === "unavailable"');
    let unavailThrew = false;
    let unavailError: any = null;
    try {
      await rbacService.createTableOrder(bizId, {
        table_id: table.id,
        table_number: table.table_number,
        items: [
          {
            item_id: unavailItem.id,
            name: unavailItem.name,
            price: 220,
            quantity: 1,
          } as any,
        ],
      });
    } catch (err: any) {
      unavailThrew = true;
      unavailError = err;
    }
    assert(unavailThrew, 'createTableOrder threw error for unavailable item');
    assert(unavailError?.statusCode === 400, 'Error status code is 400');

    console.log('\n📦 Test 4: Service level - Rejects is_available === false');
    let flagThrew = false;
    let flagError: any = null;
    try {
      await rbacService.createTableOrder(bizId, {
        table_id: table.id,
        table_number: table.table_number,
        items: [
          {
            item_id: disabledFlagItem.id,
            name: disabledFlagItem.name,
            price: 100,
            quantity: 1,
          } as any,
        ],
      });
    } catch (err: any) {
      flagThrew = true;
      flagError = err;
    }
    assert(flagThrew, 'createTableOrder threw error for is_available === false item');
    assert(flagError?.statusCode === 400, 'Error status code is 400');

    console.log('\n📦 Test 5: Service level - Variants availability enforcement');
    // Try ordering the out-of-stock variant
    let varOosThrew = false;
    let varOosError: any = null;
    try {
      await rbacService.createTableOrder(bizId, {
        table_id: table.id,
        table_number: table.table_number,
        items: [
          {
            item_id: variantItem.id,
            name: variantItem.name,
            price: 60,
            quantity: 1,
            variant_id: 'var-plain',
          } as any,
        ],
      });
    } catch (err: any) {
      varOosThrew = true;
      varOosError = err;
    }
    assert(varOosThrew, 'createTableOrder threw error for out_of_stock variant');
    assert(varOosError?.statusCode === 400, 'Error status code is 400');
    assert(varOosError?.message?.includes('Plain Soda'), `Error message identifies out of stock variant: "${varOosError?.message}"`);

    // Try ordering the available variant of the same item
    const validVarOrder = await rbacService.createTableOrder(bizId, {
      table_id: table.id,
      table_number: table.table_number,
      items: [
        {
          item_id: variantItem.id,
          name: variantItem.name,
          price: 80,
          quantity: 1,
          variant_id: 'var-lemon',
        } as any,
      ],
    });
    assert(Boolean(validVarOrder && validVarOrder.id), 'Ordering the available variant of the same item succeeds');

    console.log('\n📦 Test 6: Service level - Rejects item where all variants are out of stock');
    let allVarOosThrew = false;
    let allVarOosError: any = null;
    try {
      await rbacService.createTableOrder(bizId, {
        table_id: table.id,
        table_number: table.table_number,
        items: [
          {
            item_id: allVariantsOosItem.id,
            name: allVariantsOosItem.name,
            price: 90,
            quantity: 1,
          } as any,
        ],
      });
    } catch (err: any) {
      allVarOosThrew = true;
      allVarOosError = err;
    }
    assert(allVarOosThrew, 'createTableOrder threw error when all variants of item are out of stock');
    assert(allVarOosError?.statusCode === 400, 'Error status code is 400');
    assert(allVarOosError?.code === 'ITEM_OUT_OF_STOCK', 'Error code is ITEM_OUT_OF_STOCK');

    console.log('\n📦 Test 7: Service level - Rejects out-of-stock variant specified as string name');
    let stringVarThrew = false;
    let stringVarError: any = null;
    try {
      await rbacService.createTableOrder(bizId, {
        table_id: table.id,
        table_number: table.table_number,
        items: [
          {
            item_id: variantItem.id,
            name: variantItem.name,
            price: 60,
            quantity: 1,
            variant: 'Plain Soda',
          } as any,
        ],
      });
    } catch (err: any) {
      stringVarThrew = true;
      stringVarError = err;
    }
    assert(stringVarThrew, 'createTableOrder threw error for string variant matching out-of-stock variant');
    assert(stringVarError?.statusCode === 400, 'Error status code is 400');

    console.log('\n📦 Test 8: Service level - Rejects out-of-stock variant object in client payload');
    let payloadVarThrew = false;
    let payloadVarError: any = null;
    try {
      await rbacService.createTableOrder(bizId, {
        table_id: table.id,
        table_number: table.table_number,
        items: [
          {
            name: 'Mystery Drink',
            price: 50,
            quantity: 1,
            selected_variant: {
              name: 'Large',
              is_available: false,
            },
          } as any,
        ],
      });
    } catch (err: any) {
      payloadVarThrew = true;
      payloadVarError = err;
    }
    assert(payloadVarThrew, 'createTableOrder threw error for client payload with unavailable variant');
    assert(payloadVarError?.statusCode === 400, 'Error status code is 400');

    console.log('\n📦 Test 9: API Route level - POST /api/rbac/table-orders returns HTTP 400');
    const apiRes = await fetch(`${baseUrl}/api/rbac/table-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: bizId,
        table_id: table.id,
        table_number: table.table_number,
        items: [
          {
            item_id: oosItem.id,
            name: oosItem.name,
            price: 60,
            quantity: 1,
          },
        ],
      }),
    });
    const apiBody = await apiRes.json();
    assert(apiRes.status === 400, `API route returned HTTP 400 (received ${apiRes.status})`);
    assert(apiBody.success === false, 'API response success is false');
    assert(apiBody.error?.code === 'ITEM_OUT_OF_STOCK', `API response error code is ITEM_OUT_OF_STOCK (received ${apiBody.error?.code})`);

  } finally {
    server.close();
    // Cleanup test data
    try {
      await prisma.tableOrder.deleteMany({ where: { business_id: bizId } });
      await prisma.restaurantTable.deleteMany({ where: { business_id: bizId } });
      await prisma.menuItem.deleteMany({ where: { business_id: bizId } });
      await prisma.category.deleteMany({ where: { business_id: bizId } });
      await prisma.business.deleteMany({ where: { id: bizId } });
    } catch {}
    try {
      await prisma.$disconnect();
    } catch {}
  }

  console.log('\n======================================================');
  console.log(`🏁 OUT OF STOCK TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runOutOfStockTestSuite().catch((err) => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
