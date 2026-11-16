import { Router, Request, Response } from 'express';
import { queryCuratedLibrary, type ImageSearchResult } from '../lib/culinaryLibrary';

const router = Router();
export type { ImageSearchResult };

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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
 * GET /api/images/search?q=juice&category=Beverage
 * Returns verified, authentic culinary food & beverage photo suggestions.
 */
router.get('/search', (req: Request, res: Response) => {
  try {
    const rawQuery = (req.query.q as string || '').trim();
    if (!rawQuery || rawQuery.length < 2) {
      return res.json({ results: [] });
    }

    const rawCategory = (req.query.category as string || '').trim();
    const rawFoodType = (req.query.foodType as string || '').trim();
    const results = queryCuratedLibrary(rawQuery, rawCategory, rawFoodType);
    return res.json({ results });
  } catch (error: any) {
    console.error('Error in search endpoint:', error);
    return res.status(500).json({ error: 'Failed to search images', results: [] });
  }
});

export default router;
