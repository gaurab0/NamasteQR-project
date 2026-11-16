export interface CulinaryItem {
  id: string;
  title: string;
  url: string;
  category: string;
  tags: string[];
}

export const CULINARY_LIBRARY: CulinaryItem[] = [
  // --- ENTREES & THALI (LUNCH / DINNER SETS) ---
  {
    id: 'entree-veg-thali-1',
    title: 'Nepali Vegetarian Thali Set',
    url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    tags: ['lunch set', 'veg', 'vegetarian', 'thali', 'curry', 'dal', 'bhat', 'saag', 'achar', 'entrees']
  },
  {
    id: 'entree-veg-thali-2',
    title: 'Traditional Veg Platter & Rice',
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Vegetarian_Curry.jpeg',
    category: 'Entrees',
    tags: ['lunch set', 'veg', 'thali', 'platter', 'set', 'rice', 'curry', 'entrees']
  },
  {
    id: 'entree-chicken-thali-1',
    title: 'Nepali Chicken Thali Set',
    url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    tags: ['lunch set', 'chicken', 'non-veg', 'thali', 'curry', 'meat', 'entrees']
  },
  {
    id: 'entree-chicken-thali-2',
    title: 'Non-Veg Curry & Rice Platter',
    url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    tags: ['lunch set', 'chicken', 'meat', 'curry', 'rice', 'entrees']
  },
  {
    id: 'entree-biryani-1',
    title: 'Dum Biryani with Spices',
    url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    tags: ['biryani', 'biriyani', 'chicken biryani', 'rice', 'spiced rice', 'entrees']
  },
  {
    id: 'entree-biryani-2',
    title: 'Hyderabadi Dum Biryani',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5a/%22Hyderabadi_Dum_Biryani%22.jpg/960px-%22Hyderabadi_Dum_Biryani%22.jpg',
    category: 'Entrees',
    tags: ['biryani', 'biriyani', 'rice', 'dum biryani', 'entrees']
  },
  {
    id: 'entree-fried-rice-1',
    title: 'Wok-Tossed Fried Rice',
    url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    tags: ['fried rice', 'thai fried rice', 'rice', 'wok', 'veg fried rice', 'chicken fried rice']
  },
  {
    id: 'entree-fried-rice-2',
    title: 'Asian Style Fried Rice',
    url: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    tags: ['fried rice', 'rice', 'thai', 'asian']
  },
  {
    id: 'entree-curry-1',
    title: 'Rich Spiced Curry Bowl',
    url: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80',
    category: 'Extras',
    tags: ['curry', 'veg curry', 'chicken curry', 'gravy', 'sauce']
  },
  {
    id: 'entree-plain-rice-1',
    title: 'Steamed Basmati Rice',
    url: 'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=600&q=80',
    category: 'Extras',
    tags: ['plain rice', 'rice', 'basmati', 'steamed rice', 'extras']
  },

  // --- MOMOS & DUMPLINGS ---
  {
    id: 'momo-steamed-1',
    title: 'Steamed Nepali Momos',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Momo_nepal.jpg/960px-Momo_nepal.jpg',
    category: 'Starters',
    tags: ['momo', 'momos', 'steamed momo', 'veg momo', 'chicken momo', 'buff momo', 'dumpling', 'dumplings']
  },
  {
    id: 'momo-dumpling-2',
    title: 'Fresh Hot Dumplings with Chutney',
    url: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    tags: ['momo', 'dumplings', 'chilli momo', 'c-momo', 'fried momo', 'jhol momo']
  },
  {
    id: 'momo-panfried-3',
    title: 'Kothey Pan-Fried Momos',
    url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    tags: ['kothey', 'fried momo', 'c-momo', 'momo', 'pan-fried']
  },

  // --- NOODLES & CHINESE / THAI ---
  {
    id: 'noodle-chowmein-1',
    title: 'Stir-Fried Veg Chowmein',
    url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    tags: ['chowmein', 'noodles', 'veg chowmein', 'chicken chowmein', 'chinese', 'stir fry']
  },
  {
    id: 'noodle-chowmein-2',
    title: 'Asian Hakka Noodles',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Homemade_Chow_mein_with_shrimps_and_meat_with_a_choy_and_Choung.jpg/960px-Homemade_Chow_mein_with_shrimps_and_meat_with_a_choy_and_Choung.jpg',
    category: 'Entrees',
    tags: ['chowmein', 'noodles', 'chopsuey', 'pad thai']
  },
  {
    id: 'noodle-thukpa-1',
    title: 'Himalayan Noodle Soup (Thukpa)',
    url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    tags: ['thukpa', 'noodle soup', 'ramen', 'soup', 'himalayan']
  },

  // --- PASTA & ITALIAN ---
  {
    id: 'pasta-spaghetti-1',
    title: 'Garlic Spaghetti Aglio e Olio',
    url: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    tags: ['spaghetti', 'garlic spaghetti', 'pasta', 'chicken spaghetti', 'italian']
  },
  {
    id: 'pasta-penne-1',
    title: 'Penne Arrabiata Tomato Sauce',
    url: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    tags: ['penne', 'pasta', 'penne tomato sauce', 'tomato sauce', 'arrabiata', 'italian']
  },

  // --- PIZZA ---
  {
    id: 'pizza-cheese-1',
    title: 'Classic Margherita Cheese Pizza',
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
    category: 'Pizza',
    tags: ['pizza', 'cheese pizza', 'margherita', 'cheese', 'mozzarella']
  },
  {
    id: 'pizza-veg-2',
    title: 'Fresh Vegetable Herb Pizza',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/91/Pizza-3007395.jpg/960px-Pizza-3007395.jpg',
    category: 'Pizza',
    tags: ['pizza', 'vegetable pizza', 'veg pizza', 'mushroom pizza', 'mixed pizza']
  },
  {
    id: 'pizza-mushroom-3',
    title: 'Gourmet Sauteed Mushroom Pizza',
    url: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=600&q=80',
    category: 'Pizza',
    tags: ['pizza', 'mushroom pizza', 'mushroom', 'chicken pizza']
  },
  {
    id: 'pizza-chicken-4',
    title: 'Grilled Chicken Pizza',
    url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80',
    category: 'Pizza',
    tags: ['pizza', 'chicken pizza', 'chicken', 'bbq chicken pizza']
  },

  // --- STARTERS & SIDES ---
  {
    id: 'starter-fries-1',
    title: 'Crispy Golden Potato Fries',
    url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    tags: ['potato fries', 'fries', 'french fries', 'chips', 'starters']
  },
  {
    id: 'starter-chicken-chilly-1',
    title: 'Spicy Chicken Chilly',
    url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    tags: ['chicken chilly', 'chilly chicken', 'crispy chicken', 'chicken', 'spicy']
  },
  {
    id: 'starter-chips-chilly-1',
    title: 'Crispy Chips Chilly',
    url: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    tags: ['chips chilly', 'potato chilly', 'wedges', 'spicy fries']
  },

  // --- BURGERS & SANDWICHES ---
  {
    id: 'burger-chicken-1',
    title: 'Gourmet Chicken Burger',
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
    category: 'Chef Special',
    tags: ['burger', 'chicken burger', 'crispy chicken burger', 'patty', 'bun']
  },
  {
    id: 'sandwich-club-1',
    title: 'Toasted Club Sandwich & Fries',
    url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80',
    category: 'Chef Special',
    tags: ['sandwich', 'club sandwich', 'chicken sandwich', 'veg sandwich']
  },
  {
    id: 'sandwich-grilled-cheese-1',
    title: 'Golden Grilled Cheese Sandwich',
    url: 'https://images.unsplash.com/photo-1554433607-66b5efe9d304?auto=format&fit=crop&w=600&q=80',
    category: 'Chef Special',
    tags: ['grilled cheese', 'cheese sandwich', 'sandwich', 'toast']
  },

  // --- BREAKFAST & EGGS ---
  {
    id: 'breakfast-platter-1',
    title: 'Continental Breakfast Platter',
    url: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    tags: ['breakfast', 'regular breakfast', 'american breakfast', 'toast', 'eggs', 'morning']
  },
  {
    id: 'breakfast-french-toast-1',
    title: 'Golden French Toast',
    url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    tags: ['french toast', 'toast', 'breakfast', 'pancakes']
  },
  {
    id: 'breakfast-omelette-1',
    title: 'Fresh Herb Omelette',
    url: 'https://images.unsplash.com/photo-1510693206972-df098062cb71?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    tags: ['omelette', 'plain omelette', 'masala omelette', 'eggs', 'egg', 'breakfast']
  },
  {
    id: 'breakfast-toast-1',
    title: 'Toasted Bread with Butter & Jam',
    url: 'https://images.unsplash.com/photo-1584776296944-ab6fb57b0bdd?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    tags: ['plain toast', 'toast', 'bread', 'jam', 'butter']
  },

  // --- COLD BEVERAGES & SODAS ---
  {
    id: 'drink-fanta-1',
    title: 'Fanta Orange Chilled Can',
    url: 'https://images.unsplash.com/photo-1624552184280-9e9631bbeee9?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    tags: ['fanta', 'fanta orange', 'cold drinks', 'soda', 'soft drink', 'beverage']
  },
  {
    id: 'drink-fanta-2',
    title: 'Chilled Fanta Bottle with Ice',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Fanta_Strawberry_2022_Soda_Bottle_%28Dec_31._2022%29.jpg/960px-Fanta_Strawberry_2022_Soda_Bottle_%28Dec_31._2022%29.jpg',
    category: 'Beverage',
    tags: ['fanta', 'orange soda', 'cold drinks', 'drink']
  },
  {
    id: 'drink-sprite-1',
    title: 'Sprite Lemon-Lime Chilled Can',
    url: 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    tags: ['sprite', 'cold drinks', 'soda', 'lemon lime', 'beverage']
  },
  {
    id: 'drink-sprite-2',
    title: 'Icy Cold Sprite Cup and Can',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/A_cup_and_can_of_Sprite.jpg/960px-A_cup_and_can_of_Sprite.jpg',
    category: 'Beverage',
    tags: ['sprite', 'lemon drink', 'cold drinks']
  },
  {
    id: 'drink-coke-1',
    title: 'Coca-Cola Can Chilled',
    url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    tags: ['coke', 'coca-cola', 'coca cola', 'cold drinks', 'cola', 'soda']
  },
  {
    id: 'drink-coke-2',
    title: 'Coca-Cola Glass with Ice Cubes',
    url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    tags: ['coke', 'coca cola', 'cola', 'cold drinks', 'beverage']
  },
  {
    id: 'drink-water-1',
    title: 'Chilled Bottle of Pure Water',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ad/Bottle_of_Water.jpg/960px-Bottle_of_Water.jpg',
    category: 'Beverage',
    tags: ['water', 'mineral water', 'bottled water', 'drinking water', 'beverage']
  },
  {
    id: 'drink-water-2',
    title: 'Fresh Mineral Water Bottle',
    url: 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    tags: ['water', 'mineral water', 'beverage']
  },
  {
    id: 'drink-fresh-lemon-soda-1',
    title: 'Fresh Lemon Soda with Mint & Ice',
    url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    tags: ['fresh lemon soda', 'plain soda', 'soda', 'lemon soda', 'iced tea', 'iced lemon tea', 'beverage']
  },

  // --- COFFEE & HOT DRINKS ---
  {
    id: 'coffee-americano-1',
    title: 'Fresh Caffè Americano',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/Espresso_Americano.jpeg/960px-Espresso_Americano.jpeg',
    category: 'Coffee Corner',
    tags: ['americano', 'coffee', 'black coffee', 'caffe americano', 'regular black coffee']
  },
  {
    id: 'coffee-americano-2',
    title: 'Hot Brewed Americano Coffee',
    url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=80',
    category: 'Coffee Corner',
    tags: ['americano', 'coffee', 'hot coffee', 'iced americano']
  },
  {
    id: 'coffee-espresso-1',
    title: 'Classic Italian Espresso Shot',
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Espresso.jpg',
    category: 'Coffee Corner',
    tags: ['espresso', 'single shot', 'double shot', 'coffee']
  },
  {
    id: 'coffee-cappuccino-1',
    title: 'Frothy Cappuccino with Latte Art',
    url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80',
    category: 'Coffee Corner',
    tags: ['cappuccino', 'cafe latte', 'latte', 'cafe mocha', 'coffee', 'regular milk coffee']
  },
  {
    id: 'coffee-latte-2',
    title: 'Artisan Cafe Latte',
    url: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=600&q=80',
    category: 'Coffee Corner',
    tags: ['cafe latte', 'latte', 'honey latte', 'cappuccino', 'iced latte']
  },
  {
    id: 'tea-milk-1',
    title: 'Traditional Spiced Milk Tea (Chai)',
    url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    tags: ['milk tea', 'tea', 'black tea', 'masala tea', 'hot milk']
  },
  {
    id: 'tea-black-2',
    title: 'Steaming Cup of Black Tea',
    url: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    tags: ['black tea', 'green tea', 'lemon tea', 'tea']
  },
  {
    id: 'tea-hot-lemon-1',
    title: 'Warm Hot Lemon with Honey',
    url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    tags: ['hot lemon', 'hot lemon with honey', 'lemon', 'honey', 'lemon tea']
  },

  // --- SOUPS & HEALTH MENU ---
  {
    id: 'soup-vegetable-1',
    title: 'Warm Vegetable Herb Soup',
    url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80',
    category: 'Soups',
    tags: ['soup', 'vegetable soup', 'clear soup', 'mushroom soup', 'jaulo', 'protein soup']
  },
  {
    id: 'soup-chicken-2',
    title: 'Comforting Chicken Broth Soup',
    url: 'https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?auto=format&fit=crop&w=600&q=80',
    category: 'Soups',
    tags: ['chicken soup', 'mixed soup', 'hot and sour', 'soup', 'jwana soup']
  }
];

export interface ImageSearchResult {
  id: string;
  title: string;
  url: string;
  source: string;
}

/**
 * Searches the curated culinary library with intelligent query cleaning,
 * dietary hints, token matching, and category fallbacks.
 */
export function queryCuratedLibrary(rawQuery: string, category?: string): ImageSearchResult[] {
  if (!rawQuery || rawQuery.trim().length === 0) return [];

  // Normalize query: strip parentheses, lowercase, clean symbols
  const cleanQ = rawQuery
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  const tokens = cleanQ.split(/\s+/).filter(t => t.length > 1);
  const isVegQuery = /\b(veg|vegetarian)\b/.test(cleanQ) && !/\bnon-?veg\b/.test(cleanQ);
  const isNonVegQuery = /\b(non-?veg|chicken|buff|meat|mutton)\b/.test(cleanQ);
  const catLower = (category || '').toLowerCase();

  interface ScoredItem {
    item: CulinaryItem;
    score: number;
  }

  const scored: ScoredItem[] = [];

  for (const item of CULINARY_LIBRARY) {
    let score = 0;
    const itemText = `${item.title} ${item.tags.join(' ')} ${item.category}`.toLowerCase();

    // 1. Exact phrase in tags or title
    if (item.tags.some(t => t === cleanQ || cleanQ.includes(t))) {
      score += 40;
    }

    // 2. Token overlap score
    let tokenMatches = 0;
    for (const token of tokens) {
      if (itemText.includes(token)) {
        tokenMatches++;
        score += 15;
      }
    }

    // Extra boost if multiple tokens match
    if (tokenMatches >= 2) {
      score += 25;
    }

    // 3. Category match
    if (catLower && item.category.toLowerCase().includes(catLower)) {
      score += 10;
    }

    // 4. Dietary consistency
    const itemIsVeg = item.tags.includes('veg') || item.tags.includes('vegetarian');
    const itemIsMeat = item.tags.includes('chicken') || item.tags.includes('meat') || item.tags.includes('non-veg');

    if (isVegQuery) {
      if (itemIsVeg) score += 30;
      if (itemIsMeat) score -= 50; // Heavily penalize meat if user asked for veg
    }

    if (isNonVegQuery) {
      if (itemIsMeat) score += 30;
      if (itemIsVeg && !itemIsMeat) score -= 20;
    }

    if (score > 15) {
      scored.push({ item, score });
    }
  }

  // Sort by highest score first
  scored.sort((a, b) => b.score - a.score);

  // If matches found, return top 3-4 unique results
  const results: ImageSearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const s of scored) {
    if (!seenUrls.has(s.item.url)) {
      seenUrls.add(s.item.url);
      results.push({
        id: s.item.id,
        title: s.item.title,
        url: s.item.url,
        source: 'Curated Library'
      });
      if (results.length >= 4) break;
    }
  }

  // If no direct keyword matches, provide category fallback
  if (results.length === 0 && catLower) {
    const catMatches = CULINARY_LIBRARY.filter(i =>
      i.category.toLowerCase().includes(catLower) || catLower.includes(i.category.toLowerCase())
    );
    for (const item of catMatches) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        results.push({
          id: item.id,
          title: item.title,
          url: item.url,
          source: 'Curated Library'
        });
        if (results.length >= 3) break;
      }
    }
  }

  // Fallback to top signature culinary items if completely unmatched
  if (results.length === 0) {
    const defaultIds = ['entree-veg-thali-1', 'momo-steamed-1', 'pizza-cheese-1'];
    for (const id of defaultIds) {
      const item = CULINARY_LIBRARY.find(i => i.id === id);
      if (item) {
        results.push({
          id: item.id,
          title: item.title,
          url: item.url,
          source: 'Curated Library'
        });
      }
    }
  }

  return results.slice(0, 4);
}
