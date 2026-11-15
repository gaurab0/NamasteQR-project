import { Router, Request, Response } from 'express';

const router = Router();

export interface ImageSearchResult {
  id: string;
  title: string;
  url: string;
  source: string;
}

// In-memory cache to avoid duplicate remote requests with maximum bounded capacity
const searchCache = new Map<string, { timestamp: number; results: ImageSearchResult[] }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const MAX_CACHE_ENTRIES = 500;

function setCachedResults(key: string, results: ImageSearchResult[]): void {
  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(key, { timestamp: Date.now(), results });
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Curated high-resolution CDN images for common commercial beverages and standard items
const CURATED_FOOD_IMAGES: Record<string, ImageSearchResult[]> = {
  fanta: [
    {
      id: 'curated-fanta-1',
      title: 'Fanta Orange Can',
      url: 'https://images.unsplash.com/photo-1624552184280-9e9631bbeee9?auto=format&fit=crop&w=600&q=80',
      source: 'Curated'
    },
    {
      id: 'curated-fanta-2',
      title: 'Fanta Chilled Orange',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Fanta_Strawberry_2022_Soda_Bottle_%28Dec_31._2022%29.jpg/960px-Fanta_Strawberry_2022_Soda_Bottle_%28Dec_31._2022%29.jpg',
      source: 'Curated'
    }
  ],
  sprite: [
    {
      id: 'curated-sprite-1',
      title: 'Sprite Chilled Bottle/Can',
      url: 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?auto=format&fit=crop&w=600&q=80',
      source: 'Curated'
    },
    {
      id: 'curated-sprite-2',
      title: 'Cup and Can of Sprite',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/A_cup_and_can_of_Sprite.jpg/960px-A_cup_and_can_of_Sprite.jpg',
      source: 'Curated'
    }
  ],
  coke: [
    {
      id: 'curated-coke-1',
      title: 'Coca-Cola Chilled Can',
      url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=600&q=80',
      source: 'Curated'
    },
    {
      id: 'curated-coke-2',
      title: 'Coca-Cola Glass with Ice',
      url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80',
      source: 'Curated'
    }
  ],
  water: [
    {
      id: 'curated-water-1',
      title: 'Chilled Bottle of Water',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ad/Bottle_of_Water.jpg/960px-Bottle_of_Water.jpg',
      source: 'Curated'
    },
    {
      id: 'curated-water-2',
      title: 'Mineral Water Bottle',
      url: 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=600&q=80',
      source: 'Curated'
    }
  ],
  americano: [
    {
      id: 'curated-americano-1',
      title: 'Caffè Americano',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/Espresso_Americano.jpeg/960px-Espresso_Americano.jpeg',
      source: 'Curated'
    },
    {
      id: 'curated-americano-2',
      title: 'Fresh Hot Americano',
      url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=80',
      source: 'Curated'
    }
  ],
  espresso: [
    {
      id: 'curated-espresso-1',
      title: 'Espresso Cup',
      url: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Espresso.jpg',
      source: 'Curated'
    }
  ],
  momo: [
    {
      id: 'curated-momo-1',
      title: 'Steamed Nepali Momos',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Momo_nepal.jpg/960px-Momo_nepal.jpg',
      source: 'Curated'
    }
  ],
  biryani: [
    {
      id: 'curated-biryani-1',
      title: 'Hyderabadi Dum Biryani',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5a/%22Hyderabadi_Dum_Biryani%22.jpg/960px-%22Hyderabadi_Dum_Biryani%22.jpg',
      source: 'Curated'
    }
  ]
};

const CURATED_ALIASES: Record<string, string> = {
  'coca-cola': 'coke',
  'coca cola': 'coke',
  'cocacola': 'coke',
  'mineral water': 'water',
  'bottled water': 'water',
  'drinking water': 'water',
  'biriyani': 'biryani',
  'momos': 'momo',
  'dumplings': 'momo',
  'steamed momo': 'momo',
  'cafe americano': 'americano',
  'coffee americano': 'americano',
};

const BEVERAGE_KEYWORDS = [
  'drink', 'beverage', 'soda', 'coke', 'coca-cola', 'coca cola', 'fanta', 'sprite',
  'pepsi', 'dew', 'mountain dew', 'water', 'mineral water', 'juice', 'shake',
  'smoothie', 'mojito', 'cocktail', 'mocktail', 'beer', 'wine', 'whiskey', 'whisky',
  'vodka', 'rum', 'gin', 'tequila', 'coffee', 'tea', 'espresso', 'cappuccino',
  'latte', 'americano', 'lemonade', 'hot lemon', 'iced tea', 'soft drink',
  'cold drinks', 'cold drink', 'milk'
];

function isBeverageItem(query: string, category?: string): boolean {
  const text = `${query} ${category || ''}`.toLowerCase();
  return BEVERAGE_KEYWORDS.some(kw => text.includes(kw));
}

const NON_FOOD_KEYWORDS = [
  'building', 'exterior', 'street', 'entrance', 'facade', 'storefront',
  'hospital', 'center', 'centre', 'mall', 'hotel', 'town', 'shop',
  'map', 'sign', 'board', 'interior', 'room', 'lobby', 'counter',
  'door', 'road', 'parking', 'car', 'vehicle', 'person', 'people', 'staff',
  'bear', 'zoo', 'animal', 'wildlife', 'dog', 'cat', 'pet', 'cub', 'mammal', 'bird',
  'portrait', 'selfie', 'man', 'woman', 'girl', 'boy', 'baby', 'actor', 'movie', 'film',
  'singer', 'band', 'musician', 'album', 'song', 'novel', 'author', 'politician', 'wrestler',
  'player', 'athlete', 'sports', 'baseball', 'football', 'cricket', 'championship',
  'chart', 'plot', 'graph', 'diagram', 'statistics', 'table', 'histogram',
  'vector', 'cartoon', 'drawing', 'clipart', 'sketch', 'icon', 'logo', 'symbol',
  'screenshot', 'wallpaper', 'textbook', 'journal', 'paper', 'slide', 'blood',
  'fuel', 'coal', 'chemical', 'mineral', 'lightning', 'meteorology', 'geography', 'city', 'hoax'
];

function isFoodCandidate(title: string, url: string): boolean {
  const text = `${title} ${url}`.toLowerCase();
  for (const bad of NON_FOOD_KEYWORDS) {
    if (text.includes(bad)) return false;
  }
  return true;
}

function cleanDishQuery(raw: string): string {
  const words = raw.trim().split(/\s+/);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const w of words) {
    const norm = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    const stem = norm.replace(/g+h?e+t+i?/g, 'spaghetti');
    if (!seen.has(stem) && norm.length > 1) {
      seen.add(stem);
      deduped.push(w);
    }
  }
  return deduped.join(' ');
}

function hasDuplicate(existing: ImageSearchResult[], item: ImageSearchResult): boolean {
  const normTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
  return existing.some(
    r => r.url === item.url || (normTitle.length > 3 && r.title.toLowerCase().replace(/[^a-z0-9]/g, '') === normTitle)
  );
}

/**
 * Queries Wikimedia Commons & Wikipedia for authentic culinary/beverage photos
 */
async function searchWikipediaImages(query: string, category?: string): Promise<ImageSearchResult[]> {
  const results: ImageSearchResult[] = [];
  try {
    const cleanQ = cleanDishQuery(query);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|description&piprop=thumbnail&pithumbsize=600&generator=search&gsrsearch=${encodeURIComponent(cleanQ)}&gsrlimit=5`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'ServeFlowRestaurantApp/1.0 (contact: support@serveflow.io)',
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages) as any[];
        for (const p of pages) {
          const thumb = p.thumbnail?.source;
          const title = (p.title || '').toLowerCase();
          const desc = (p.description || '').toLowerCase();

          if (!thumb || thumb.endsWith('.svg.png') || thumb.endsWith('.svg')) continue;
          if (!isFoodCandidate(p.title, thumb) || !isFoodCandidate(desc, '')) continue;

          // Article must have authentic culinary or beverage context in its title or summary
          const isFoodOrDrinkContext =
            /\b(dish|dishes|food|cuisine|recipe|meal|snack|drink|drinks|beverage|beverages|dumpling|dumplings|rice|noodle|noodles|soup|salad|bread|cake|coffee|tea|dessert|sandwich|patty|curry|sauce|soda|sodas|cola|colas|juice|juices|cocktail|cocktails|beer|beers|wine|liquor|bottle|bottles|can|cans|cappuccino|espresso|latte|momo|momos|biryani)\b/i.test(`${title} ${desc}`);

          if (!isFoodOrDrinkContext) continue;

          results.push({
            id: `wiki-${p.pageid}`,
            title: p.title,
            url: thumb,
            source: 'Wikipedia',
          });
          if (results.length >= 3) break;
        }
      }
    }
  } catch (err) {
    console.warn('Wikipedia image search error:', err);
  }
  return results;
}

/**
 * Direct Bing Image Search as secondary search engine, safely routed via image proxy
 */
async function searchBingImages(query: string, category?: string): Promise<ImageSearchResult[]> {
  const results: ImageSearchResult[] = [];
  try {
    const cleanQ = cleanDishQuery(query);
    const isDrink = isBeverageItem(query, category);

    let searchQuery = '';
    if (isDrink) {
      searchQuery = `${cleanQ} cold drink chilled beverage bottle can glass`;
    } else {
      const catContext = (category && !/general|special menu|none|all/i.test(category)) ? ` ${category}` : '';
      searchQuery = `${cleanQ}${catContext} delicious culinary dish food photography`;
    }

    const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(searchQuery)}&qft=+filterui:photo-photo&form=HDRSC2&first=1`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (res.ok) {
      const html = await res.text();
      // Match m="{&quot;murl&quot;:&quot;URL&quot;,...&quot;t&quot;:&quot;TITLE&quot;}"
      const regex = /m=["']\{.*?&quot;murl&quot;:&quot;(https?:&#x2F;&#x2F;[^&]+|https?:\/\/[^"&]+)&quot;.*?(&quot;t&quot;:&quot;([^&]+)&quot;)?/g;
      let m;
      while ((m = regex.exec(html)) !== null && results.length < 4) {
        let rawUrl = (m[1] || '').replace(/&#x2F;/g, '/').replace(/&amp;/g, '&');
        let title = (m[3] || `${query} photo`).replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
        
        if (
          rawUrl.startsWith('http') &&
          !rawUrl.endsWith('.svg') &&
          !rawUrl.includes('logo') &&
          !rawUrl.includes('icon') &&
          isFoodCandidate(title, rawUrl)
        ) {
          // Wrap third-party URLs through our proxy endpoint to prevent 403 hotlink blocks
          const proxiedUrl = `/api/images/proxy?url=${encodeURIComponent(rawUrl)}`;
          results.push({
            id: `bing-${results.length + 1}`,
            title: title.length > 50 ? title.slice(0, 48) + '...' : title,
            url: proxiedUrl,
            source: 'Web Search',
          });
        }
      }
    }
  } catch (err) {
    console.warn('Bing image search error:', err);
  }
  return results;
}

/**
 * GET /api/images/proxy?url=<encoded_url>
 * Proxies remote third-party images safely to eliminate HTTP 403 hotlink protection and CORS errors.
 */
router.get('/proxy', async (req: Request, res: Response) => {
  try {
    const rawUrl = req.query.url as string;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).send('Missing url parameter');
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawUrl);
    } catch {
      return res.status(400).send('Invalid url parameter');
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return res.status(400).send('Invalid protocol');
    }

    // SSRF protection: reject private/internal IP ranges
    const hostname = targetUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return res.status(403).send('Forbidden target host');
    }

    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      return res.status(response.status).send('Upstream image fetch failed');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(415).send('Upstream response is not an image');
    }

    const arrayBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
      return res.status(504).send('Upstream image request timed out');
    }
    return res.status(500).send('Error proxying image');
  }
});

/**
 * GET /api/images/search?q=juice
 * Returns top 3-4 authentic food/drink photo suggestions.
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const rawQuery = (req.query.q as string || '').trim();
    if (!rawQuery || rawQuery.length < 2) {
      return res.json({ results: [] });
    }

    const rawCategory = (req.query.category as string || '').trim();
    const queryKey = `${rawQuery.toLowerCase()}__${rawCategory.toLowerCase()}`;
    const cached = searchCache.get(queryKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json({ results: cached.results });
    }

    let results: ImageSearchResult[] = [];

    // 1. Check curated catalog for standard beverages & dishes
    const normalizedKey = rawQuery.toLowerCase();
    const lookupKey = CURATED_ALIASES[normalizedKey] || normalizedKey;
    if (CURATED_FOOD_IMAGES[lookupKey]) {
      results.push(...CURATED_FOOD_IMAGES[lookupKey]);
    }

    // 2. Try Wikipedia / Wikimedia Commons for authentic culinary photos
    if (results.length < 3) {
      const wikiResults = await searchWikipediaImages(rawQuery, rawCategory);
      for (const item of wikiResults) {
        if (results.length >= 4) break;
        if (!hasDuplicate(results, item)) {
          results.push(item);
        }
      }
    }

    // 3. Complement with clean Bing results proxied through /api/images/proxy
    if (results.length < 3) {
      const bingResults = await searchBingImages(rawQuery, rawCategory);
      for (const item of bingResults) {
        if (results.length >= 4) break;
        if (!hasDuplicate(results, item)) {
          results.push(item);
        }
      }
    }

    // Return the top 3-4 images
    const finalResults = results.slice(0, 4);
    if (finalResults.length > 0) {
      setCachedResults(queryKey, finalResults);
    }

    return res.json({ results: finalResults });
  } catch (error: any) {
    console.error('Error in search endpoint:', error);
    return res.status(500).json({ error: 'Failed to search images', results: [] });
  }
});

export default router;
