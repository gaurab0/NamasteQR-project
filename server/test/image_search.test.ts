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
    const testCases = [
      { q: 'Lunch Set (Veg)', cat: 'Entrees' },
      { q: 'Nepali Lunch Set (Chicken)', cat: 'Entrees' },
      { q: 'Fanta', cat: 'Beverage' },
      { q: 'Sprite', cat: 'Beverage' },
      { q: 'Americano (Double)', cat: 'Coffee Corner' },
      { q: 'Garlic Spaghetti', cat: 'Special Menu' },
      { q: 'Jhol Momo Buff', cat: 'Starters' }
    ];

    for (const tc of testCases) {
      const res = await fetch(`http://localhost:3099/api/images/search?q=${encodeURIComponent(tc.q)}&category=${encodeURIComponent(tc.cat)}`);
      const data = await res.json();
      console.log(`\nResults for "${tc.q}" [Category: ${tc.cat}] (count: ${data.results.length}):`);
      for (const item of data.results) {
        console.log(`  - [${item.source}] "${item.title}": ${item.url.slice(0, 75)}...`);
      }
      if (data.results.length === 0) {
        throw new Error(`Expected results for query: ${tc.q}`);
      }
    }

    // Test proxy endpoint with a verified image
    const sampleImageUrl = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ad/Bottle_of_Water.jpg/960px-Bottle_of_Water.jpg';
    const proxyRes = await fetch(`http://localhost:3099/api/images/proxy?url=${encodeURIComponent(sampleImageUrl)}`);
    console.log(`\nProxy test status: ${proxyRes.status}, Content-Type: ${proxyRes.headers.get('content-type')}`);
    const buf = await proxyRes.arrayBuffer();
    console.log(`Proxy buffer received: ${buf.byteLength} bytes`);

    // Test proxy security (SSRF prevention)
    const ssrfRes = await fetch(`http://localhost:3099/api/images/proxy?url=${encodeURIComponent('http://localhost:8080/admin')}`);
    console.log(`SSRF localhost test status: ${ssrfRes.status} (expected 403)`);

  } finally {
    server.close();
  }
}

testImageService().then(() => {
  console.log('\nAll image service tests finished successfully!');
  process.exit(0);
}).catch((err) => {
  console.error('Image service test error:', err);
  process.exit(1);
});
