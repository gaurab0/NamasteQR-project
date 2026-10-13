import { Router, Request, Response } from 'express';

const router = Router();

interface ImageSearchResult {
  id: string;
  title: string;
  url: string;
  source: string;
}

// In-memory cache to avoid duplicate remote requests
const searchCache = new Map<string, { timestamp: number; results: ImageSearchResult[] }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Searches Google Images directly for the exact dish name (with food/recipe context)
 */
async function searchGoogleImages(query: string): Promise<ImageSearchResult[]> {
  const results: ImageSearchResult[] = [];
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' food recipe')}&tbm=isch&asearch=ichunk&async=_id:rg_s,_pms:s,_fmt:pc`;
    
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      // Fallback to standard Google Image search page
      const standardUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' food recipe')}&tbm=isch`;
      const fallbackRes = await fetch(standardUrl, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      });
      if (fallbackRes.ok) {
        const html = await fallbackRes.text();
        return parseGoogleImagesHtml(html, query);
      }
      return [];
    }

    const html = await res.text();
    return parseGoogleImagesHtml(html, query);
  } catch (err) {
    console.warn('Google image search fetch error:', err);
    return [];
  }
}

/**
 * Parses Google Images HTML to extract high-quality photo thumbnails and titles
 */
function parseGoogleImagesHtml(html: string, query: string): ImageSearchResult[] {
  const results: ImageSearchResult[] = [];
  const seenUrls = new Set<string>();

  // Regex pattern 1: Look for encrypted gstatic image thumbnails and accompanying alt/title
  const imgRegex = /<img[^>]+src=["'](https:\/\/encrypted-tbn0\.gstatic\.com\/images\?[^"']+)["'][^>]*alt=["']([^"']*)["']/g;
  let match;
  while ((match = imgRegex.exec(html)) !== null && results.length < 4) {
    const url = match[1].replace(/&amp;/g, '&');
    const alt = match[2] || `${query} image`;
    if (!seenUrls.has(url) && !alt.toLowerCase().includes('google') && !alt.toLowerCase().includes('logo')) {
      seenUrls.add(url);
      results.push({
        id: `gimg-${results.length + 1}`,
        title: alt.length > 50 ? alt.slice(0, 48) + '...' : alt,
        url: url,
        source: 'Google Images',
      });
    }
  }

  // Regex pattern 2: Look for data-src or src with gstatic images if alt wasn't grouped
  if (results.length < 3) {
    const srcOnlyRegex = /(https:\/\/encrypted-tbn0\.gstatic\.com\/images\?q=tbn:[^"'\s&]+(?:&amp;|&)[^"'\s]+)/g;
    while ((match = srcOnlyRegex.exec(html)) !== null && results.length < 4) {
      const url = match[1].replace(/&amp;/g, '&');
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        results.push({
          id: `gimg-${results.length + 1}`,
          title: `${query} photo ${results.length + 1}`,
          url: url,
          source: 'Google Images',
        });
      }
    }
  }

  return results;
}

/**
 * Direct Bing Image Search as secondary high-definition search engine
 */
async function searchBingImages(query: string): Promise<ImageSearchResult[]> {
  const results: ImageSearchResult[] = [];
  try {
    const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query + ' food dish recipe')}&qft=+filterui:photo-photo&form=HDRSC2&first=1`;
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
        let title = (m[3] || `${query} dish`).replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
        
        if (
          rawUrl.startsWith('http') &&
          !rawUrl.endsWith('.svg') &&
          !rawUrl.includes('logo') &&
          !rawUrl.includes('icon')
        ) {
          results.push({
            id: `bing-${results.length + 1}`,
            title: title.length > 50 ? title.slice(0, 48) + '...' : title,
            url: rawUrl,
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
 * GET /api/images/search?q=juice
 * Returns top 3-4 authentic Google Image food results for any food name.
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const rawQuery = (req.query.q as string || '').trim();
    if (!rawQuery || rawQuery.length < 2) {
      return res.json({ results: [] });
    }

    const queryKey = rawQuery.toLowerCase();
    const cached = searchCache.get(queryKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json({ results: cached.results });
    }

    let results: ImageSearchResult[] = [];

    // 1. Try Google Images directly
    const googleResults = await searchGoogleImages(rawQuery);
    if (googleResults.length > 0) {
      results.push(...googleResults);
    }

    // 2. If Google returned fewer than 3, complement with Bing image results
    if (results.length < 3) {
      const bingResults = await searchBingImages(rawQuery);
      for (const item of bingResults) {
        if (results.length >= 4) break;
        if (!results.some(r => r.url === item.url)) {
          results.push(item);
        }
      }
    }

    // Return the top 3-4 images
    const finalResults = results.slice(0, 4);
    if (finalResults.length > 0) {
      searchCache.set(queryKey, { timestamp: Date.now(), results: finalResults });
    }

    return res.json({ results: finalResults });
  } catch (error: any) {
    console.error('Error in search endpoint:', error);
    return res.status(500).json({ error: 'Failed to search images', results: [] });
  }
});

export default router;
