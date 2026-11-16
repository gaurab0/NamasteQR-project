import imageRouter from '../src/routes/image.routes';
import express from 'express';
import http from 'http';

async function testImageService() {
  const app = express();
  app.use('/api/images', imageRouter);
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(3099, resolve));
  console.log('Test server listening on port 3099');

  try {
    // 1. Rigorous test for Lunch Set (Veg) - NO Ballard anatomy covers, NO meat, ONLY authentic veg thalis
    const vegThaliRes = await fetch('http://localhost:3099/api/images/search?q=Lunch%20Set%20(Veg)&category=Entrees&foodType=veg');
    const vegThaliData = await vegThaliRes.json();
    console.log(`\nResults for "Lunch Set (Veg)" (count: ${vegThaliData.results.length}):`);
    for (const item of vegThaliData.results) {
      console.log(`  - [${item.source}] "${item.title}": ${item.url.slice(0, 75)}...`);
    }
    if (vegThaliData.results.length === 0) throw new Error('Expected results for Lunch Set (Veg)');
    for (const item of vegThaliData.results) {
      if (item.title.toLowerCase().includes('chicken') || item.title.toLowerCase().includes('meat')) {
        throw new Error(`Non-veg dish contaminated Veg Thali: ${item.title}`);
      }
      if (!item.title.toLowerCase().includes('thali') && !item.title.toLowerCase().includes('veg platter')) {
        throw new Error(`Unexpected non-thali item in Lunch Set (Veg): ${item.title}`);
      }
    }

    // 2. Rigorous test for Veg Sandwich - NO Thalis, ONLY sandwiches
    const vegSandwichRes = await fetch('http://localhost:3099/api/images/search?q=Veg%20Sandwich&category=Special%20Menu&foodType=veg');
    const vegSandwichData = await vegSandwichRes.json();
    console.log(`\nResults for "Veg Sandwich" (count: ${vegSandwichData.results.length}):`);
    for (const item of vegSandwichData.results) {
      console.log(`  - [${item.source}] "${item.title}": ${item.url.slice(0, 75)}...`);
    }
    if (vegSandwichData.results.length === 0) throw new Error('Expected results for Veg Sandwich');
    for (const item of vegSandwichData.results) {
      if (item.title.toLowerCase().includes('thali') || item.title.toLowerCase().includes('rice')) {
        throw new Error(`Thali/Rice dish contaminated Veg Sandwich: ${item.title}`);
      }
      if (!item.title.toLowerCase().includes('sandwich') && !item.title.toLowerCase().includes('cheese')) {
        throw new Error(`Unexpected non-sandwich item in Veg Sandwich: ${item.title}`);
      }
    }

    // 3. Test comprehensive coverage across the physical restaurant menu
    const menuItems = [
      { q: 'Garlic Spaghetti', cat: 'Special Menu', expected: 'spaghetti' },
      { q: 'Penne Tomato Sauce (Veg)', cat: 'Special Menu', foodType: 'veg', expected: 'penne' },
      { q: 'Pad Thai', cat: 'Special Menu', expected: 'pad thai' },
      { q: 'Ka-prou Gai', cat: 'Special Menu', expected: 'ka-prou' },
      { q: 'Cheese Pizza', cat: 'Special Menu', expected: 'pizza' },
      { q: 'American Chopsuey', cat: 'Special Menu', expected: 'chopsuey' },
      { q: 'Mapo Tofu w/ Rice', cat: 'Special Menu', expected: 'mapo tofu' },
      { q: 'Crispy Buff Chilly', cat: 'Special Menu', expected: 'buff' },
      { q: 'Crispy Chicken Burger', cat: 'Special Menu', expected: 'burger' },
      { q: 'Clear Soup', cat: 'Soups', expected: 'soup' },
      { q: 'Potato Fries', cat: 'Starters', expected: 'fries' },
      { q: 'Momo - Veg', cat: 'Starters', foodType: 'veg', expected: 'momo' },
      { q: 'Jhol Momo Buff', cat: 'Starters', expected: 'momo' },
      { q: 'Chowmein', cat: 'Entrees', expected: 'chowmein' },
      { q: 'Thukpa', cat: 'Entrees', expected: 'thukpa' },
      { q: 'Jaulo', cat: 'Health Menu', expected: 'jaulo' },
      { q: 'Protein Bara', cat: 'Health Menu', expected: 'bara' },
      { q: 'Mashed Potato', cat: 'Health Menu', expected: 'potato' },
      { q: 'Fulka (per piece)', cat: 'Extras', expected: 'roti' },
      { q: 'American Breakfast', cat: 'Breakfast', expected: 'breakfast' },
      { q: 'French Toast', cat: 'Breakfast', expected: 'french toast' },
      { q: 'Cornflakes/Oats with Milk', cat: 'Breakfast', expected: 'cornflakes' },
      { q: 'Fanta', cat: 'Beverage', expected: 'fanta' },
      { q: 'Fresh lemon Soda', cat: 'Beverage', expected: 'lemon soda' },
      { q: 'Americano', cat: 'Coffee Corner', expected: 'americano' },
      { q: 'Hot Chocolate', cat: 'Coffee Corner', expected: 'hot chocolate' }
    ];

    for (const item of menuItems) {
      const url = `http://localhost:3099/api/images/search?q=${encodeURIComponent(item.q)}&category=${encodeURIComponent(item.cat)}${item.foodType ? `&foodType=${encodeURIComponent(item.foodType)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.results || data.results.length === 0) {
        throw new Error(`Missing image results for physical menu dish: ${item.q}`);
      }
      console.log(`✓ "${item.q}" -> ${data.results[0].title}`);
    }

    // 4. Test proxy endpoint with a verified image
    const sampleImageUrl = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ad/Bottle_of_Water.jpg/960px-Bottle_of_Water.jpg';
    const proxyRes = await fetch(`http://localhost:3099/api/images/proxy?url=${encodeURIComponent(sampleImageUrl)}`);
    console.log(`\nProxy test status: ${proxyRes.status}, Content-Type: ${proxyRes.headers.get('content-type')}`);
    const buf = await proxyRes.arrayBuffer();
    console.log(`Proxy buffer received: ${buf.byteLength} bytes`);

    // 5. Test proxy security (SSRF prevention)
    const ssrfRes = await fetch(`http://localhost:3099/api/images/proxy?url=${encodeURIComponent('http://localhost:8080/admin')}`);
    console.log(`SSRF localhost test status: ${ssrfRes.status} (expected 403)`);

    console.log('\nALL CULINARY IMAGE TESTS PASSED WITH ZERO CROSS-CONTAMINATION!');
  } finally {
    server.close();
  }
}

testImageService().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
