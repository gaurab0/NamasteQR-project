/**
 * Test Suite: Billing POS Menu Autocomplete & Quantity Stepper Logic
 * Tests candidate generation, case-insensitive search, multi-token matching,
 * variant extraction, quantity stepper bounds, and line item calculations.
 */

interface MenuItemVariant {
  id: string;
  name: string;
  price: number;
  is_available?: boolean;
  food_type?: 'veg' | 'non-veg' | 'egg' | 'vegan' | 'none';
}

interface MenuItem {
  id: string;
  business_id: string;
  name: string;
  category: string;
  price: number;
  food_type?: 'veg' | 'non-veg' | 'egg' | 'vegan' | 'none';
  status?: string;
  is_available: boolean;
  has_variants?: boolean;
  variants?: MenuItemVariant[];
}

interface MenuCandidate {
  id: string;
  menu_item_id: string;
  name: string;
  variant_id?: string;
  variant_name?: string;
  price: number;
  category?: string;
  food_type?: string;
  is_available?: boolean;
}

function generateMenuCandidates(availableMenuItems: MenuItem[]): MenuCandidate[] {
  const list: MenuCandidate[] = [];
  (availableMenuItems || []).forEach((item) => {
    if (item.has_variants && Array.isArray(item.variants) && item.variants.length > 0) {
      item.variants.forEach((v) => {
        list.push({
          id: `${item.id}_${v.id}`,
          menu_item_id: item.id,
          name: `${item.name} (${v.name})`,
          variant_id: v.id,
          variant_name: v.name,
          price: Number(v.price) || Number(item.price) || 0,
          category: item.category,
          food_type: v.food_type || item.food_type || 'none',
          is_available: v.is_available !== false && item.is_available !== false && item.status !== 'out_of_stock' && item.status !== 'unavailable',
        });
      });
    } else {
      list.push({
        id: item.id,
        menu_item_id: item.id,
        name: item.name,
        price: Number(item.price) || 0,
        category: item.category,
        food_type: item.food_type || 'none',
        is_available: item.is_available !== false && item.status !== 'out_of_stock' && item.status !== 'unavailable',
      });
    }
  });
  return list;
}

function filterMenuCandidates(candidates: MenuCandidate[], rawQuery: string): MenuCandidate[] {
  const query = (rawQuery || '').trim().toLowerCase();
  if (!query) return [];

  const tokens = query.split(/\s+/).filter(Boolean);
  const matches = candidates.filter((c) => {
    const cName = c.name.toLowerCase();
    const cCat = (c.category || '').toLowerCase();
    return tokens.every((token) => cName.includes(token) || cCat.includes(token));
  });

  matches.sort((a, b) => {
    const aLower = a.name.toLowerCase();
    const bLower = b.name.toLowerCase();
    if (aLower === query && bLower !== query) return -1;
    if (bLower === query && aLower !== query) return 1;
    const aStarts = aLower.startsWith(query);
    const bStarts = bLower.startsWith(query);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    if (a.is_available && !b.is_available) return -1;
    if (!a.is_available && b.is_available) return 1;
    return aLower.localeCompare(bLower);
  });

  return matches.slice(0, 15);
}

// Stepper operations
function stepQuantity(currentQty: number | string, step: 'inc' | 'dec'): number {
  const base = Math.max(1, Number(currentQty) || 1);
  if (step === 'inc') return base + 1;
  return Math.max(1, base - 1);
}

function normalizeQuantity(val: any): number {
  const parsed = parseInt(String(val), 10);
  return isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

function calculateItemLine(unitPrice: number, qty: number) {
  const q = Math.max(1, qty);
  const p = Number(unitPrice) || 0;
  return {
    unit_price: p,
    price: p,
    quantity: q,
    subtotal: q * p,
    total_price: q * p,
  };
}

async function runTests() {
  console.log('🧪 Starting Billing POS Autocomplete & Stepper Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(title: string, condition: boolean, extra?: any) {
    if (condition) {
      console.log(`  ✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${title}`, extra || '');
      failed++;
    }
  }

  const sampleMenu: MenuItem[] = [
    {
      id: 'dish-1',
      business_id: 'biz-1',
      name: 'Chicken Tikka',
      category: 'Starters',
      price: 320,
      food_type: 'non-veg',
      is_available: true,
      has_variants: false,
    },
    {
      id: 'dish-2',
      business_id: 'biz-1',
      name: 'Chicken Momo',
      category: 'Momo & Dumplings',
      price: 180,
      food_type: 'non-veg',
      is_available: true,
      has_variants: true,
      variants: [
        { id: 'v1', name: 'Half (5 pcs)', price: 120, food_type: 'non-veg', is_available: true },
        { id: 'v2', name: 'Full (10 pcs)', price: 200, food_type: 'non-veg', is_available: true },
        { id: 'v3', name: 'Steam Jhol Special', price: 240, food_type: 'non-veg', is_available: false },
      ],
    },
    {
      id: 'dish-3',
      business_id: 'biz-1',
      name: 'Paneer Butter Masala',
      category: 'Main Course',
      price: 280,
      food_type: 'veg',
      is_available: true,
      has_variants: false,
    },
    {
      id: 'dish-4',
      business_id: 'biz-1',
      name: 'Butter Chicken Special',
      category: 'Main Course',
      price: 450,
      food_type: 'non-veg',
      is_available: true,
      has_variants: false,
    },
    {
      id: 'dish-5',
      business_id: 'biz-1',
      name: 'Egg Fried Rice',
      category: 'Rice & Noodles',
      price: 220,
      food_type: 'egg',
      is_available: true,
      has_variants: false,
    },
    {
      id: 'dish-6',
      business_id: 'biz-1',
      name: 'Cold Drink Can (Coca-Cola)',
      category: 'Beverages',
      price: 80,
      is_available: false,
      status: 'out_of_stock',
      has_variants: false,
    },
  ];

  console.log('📦 Testing 1: Menu Candidate Resolution');
  const candidates = generateMenuCandidates(sampleMenu);
  assert('Flattens standard and multi-variant menu items into candidates', candidates.length === 8);
  const momoHalf = candidates.find((c) => c.id === 'dish-2_v1');
  assert('Variant candidate includes parent dish name and variant label', momoHalf?.name === 'Chicken Momo (Half (5 pcs))');
  assert('Variant candidate resolves specific variant price', momoHalf?.price === 120);
  assert('Variant candidate sets variant_id and menu_item_id', momoHalf?.variant_id === 'v1' && momoHalf?.menu_item_id === 'dish-2');
  const outOfStockMomo = candidates.find((c) => c.id === 'dish-2_v3');
  assert('Detects unavailable variant as not available', outOfStockMomo?.is_available === false);
  const outOfStockCoke = candidates.find((c) => c.id === 'dish-6');
  assert('Detects out_of_stock status as not available', outOfStockCoke?.is_available === false);

  console.log('\n🔍 Testing 2: Autocomplete Dropdown Search & Relevance');
  const emptyResults = filterMenuCandidates(candidates, '');
  assert('Empty query returns empty array (popup stays closed)', emptyResults.length === 0);

  const chickenMatches = filterMenuCandidates(candidates, 'chicken');
  assert('Typing "chicken" returns all 5 dishes/variants containing chicken', chickenMatches.length === 5);
  assert('All returned dishes contain "chicken" in name or category', chickenMatches.every((c) => c.name.toLowerCase().includes('chicken') || c.category?.toLowerCase().includes('chicken')));

  const uppercaseMatches = filterMenuCandidates(candidates, 'CHICKEN');
  assert('Case-insensitive search produces identical result count for uppercase query', uppercaseMatches.length === 5);

  const tokenMatches = filterMenuCandidates(candidates, 'momo chick');
  assert('Multi-word out-of-order query "momo chick" matches Chicken Momo variants', tokenMatches.length === 3);

  const starterCatMatches = filterMenuCandidates(candidates, 'starters');
  assert('Category query matches items belonging to category', starterCatMatches.length === 1 && starterCatMatches[0].name === 'Chicken Tikka');

  const noMatches = filterMenuCandidates(candidates, 'nonexistent dish xyz');
  assert('Non-matching query returns empty array', noMatches.length === 0);

  console.log('\n🔢 Testing 3: Quantity Stepper & Bounds Enforcement');
  assert('Default initial quantity is 1', stepQuantity(1, 'dec') === 1);
  assert('Decrementing at 1 does not drop below 1 (disabled lower bound)', stepQuantity(1, 'dec') === 1);
  assert('Incrementing at 1 increases to 2', stepQuantity(1, 'inc') === 2);
  assert('Incrementing at 2 increases to 3', stepQuantity(2, 'inc') === 3);
  assert('Decrementing at 3 decreases to 2', stepQuantity(3, 'dec') === 2);
  assert('Normalizing invalid string "abc" defaults to 1', normalizeQuantity('abc') === 1);
  assert('Normalizing negative number "-5" clamps to 1', normalizeQuantity(-5) === 1);
  assert('Normalizing zero "0" clamps to 1', normalizeQuantity(0) === 1);
  assert('Normalizing valid input "12" parses to 12', normalizeQuantity('12') === 12);

  console.log('\n💰 Testing 4: Line Item Autofill & Calculations');
  const selectedDish = chickenMatches[0];
  const lineItem = calculateItemLine(selectedDish.price, 2);
  assert('Unit price is correctly set from menu item', lineItem.unit_price === selectedDish.price);
  assert('Subtotal is calculated as qty * unit_price', lineItem.subtotal === selectedDish.price * 2);
  assert('Total price equals subtotal', lineItem.total_price === lineItem.subtotal);

  console.log('\n========================================');
  console.log(`🏁 Autocomplete Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
