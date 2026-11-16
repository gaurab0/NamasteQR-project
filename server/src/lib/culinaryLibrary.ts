export type FoodFamily =
  | 'thali'
  | 'sandwich'
  | 'burger'
  | 'pizza'
  | 'momo'
  | 'pasta'
  | 'noodle'
  | 'soup'
  | 'rice'
  | 'starter'
  | 'curry'
  | 'bread'
  | 'breakfast'
  | 'dessert'
  | 'coffee'
  | 'tea'
  | 'beverage';

export interface CulinaryItem {
  id: string;
  title: string;
  url: string;
  category: string;
  family: FoodFamily;
  isVeg: boolean;
  tags: string[];
}

export const CULINARY_LIBRARY: CulinaryItem[] = [
  // ==========================================
  // 1. ENTREES & THALI (LUNCH / DINNER SETS)
  // ==========================================
  {
    id: 'entree-veg-thali-1',
    title: 'Nepali Vegetarian Thali Set',
    url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    family: 'thali',
    isVeg: true,
    tags: ['lunch set', 'lunch set veg', 'veg thali', 'nepali veg thali', 'vegetarian thali', 'veg', 'thali', 'dal bhat', 'curry', 'saag', 'achar', 'entrees']
  },
  {
    id: 'entree-veg-thali-2',
    title: 'Traditional Veg Platter & Rice',
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Vegetarian_Curry.jpeg',
    category: 'Entrees',
    family: 'thali',
    isVeg: true,
    tags: ['lunch set', 'lunch set veg', 'veg thali', 'thali', 'veg platter', 'set', 'rice', 'curry', 'entrees']
  },
  {
    id: 'entree-veg-thali-3',
    title: 'Authentic Nepali Veg Thali Platter',
    url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    family: 'thali',
    isVeg: true,
    tags: ['lunch set', 'lunch set veg', 'veg thali', 'nepali lunch set', 'thali', 'veg', 'entrees']
  },
  {
    id: 'entree-chicken-thali-1',
    title: 'Nepali Chicken Thali Set',
    url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    family: 'thali',
    isVeg: false,
    tags: ['lunch set', 'lunch set chicken', 'chicken thali', 'nepali chicken thali', 'non-veg', 'chicken', 'thali', 'meat', 'dal bhat chicken', 'entrees']
  },
  {
    id: 'entree-chicken-thali-2',
    title: 'Non-Veg Curry & Rice Platter',
    url: 'https://images.unsplash.com/photo-1505253758473-96b7015fcd40?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    family: 'thali',
    isVeg: false,
    tags: ['lunch set', 'lunch set chicken', 'chicken thali', 'meat thali', 'chicken', 'curry', 'rice', 'entrees']
  },

  // ==========================================
  // 2. SANDWICHES & BURGERS (CHEF SPECIAL)
  // ==========================================
  {
    id: 'sandwich-veg-1',
    title: 'Fresh Garden Veg Sandwich',
    url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'sandwich',
    isVeg: true,
    tags: ['veg sandwich', 'sandwich', 'fresh sandwich', 'garden veg', 'cheese sandwich', 'vegetable sandwich']
  },
  {
    id: 'sandwich-grilled-cheese-1',
    title: 'Golden Grilled Cheese Sandwich',
    url: 'https://images.unsplash.com/photo-1554433607-66b5efe9d304?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'sandwich',
    isVeg: true,
    tags: ['grilled cheese', 'grilled cheese sandwich', 'grilled cheese with tomato', 'cheese sandwich', 'sandwich']
  },
  {
    id: 'sandwich-toasted-deli-1',
    title: 'Toasted Deli Sandwich Slices',
    url: 'https://images.unsplash.com/photo-1481070414801-51fd732d7184?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'sandwich',
    isVeg: true,
    tags: ['toasted sandwich', 'sandwich', 'club sandwich', 'cheese sandwich']
  },
  {
    id: 'sandwich-club-1',
    title: 'Classic Club Sandwich & Chips',
    url: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'sandwich',
    isVeg: false,
    tags: ['club sandwich', 'triple decker', 'sandwich', 'chicken sandwich']
  },
  {
    id: 'sandwich-egg-1',
    title: 'Egg & Salad Brioche Sandwich',
    url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'sandwich',
    isVeg: false,
    tags: ['egg sandwich', 'boiled egg sandwich', 'sandwich', 'egg']
  },
  {
    id: 'sandwich-chicken-1',
    title: 'Grilled Chicken Breast Sandwich',
    url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'sandwich',
    isVeg: false,
    tags: ['chicken sandwich', 'grilled cheese chicken sandwich', 'sandwich', 'chicken']
  },
  {
    id: 'sandwich-ham-1',
    title: 'Grilled Cheese Ham Sandwich',
    url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'sandwich',
    isVeg: false,
    tags: ['grilled cheese ham sandwich', 'ham sandwich', 'sandwich', 'non-veg']
  },
  {
    id: 'burger-chicken-1',
    title: 'Gourmet Chicken Burger',
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'burger',
    isVeg: false,
    tags: ['burger chicken', 'chicken burger', 'burger', 'crispy chicken burger', 'hamburger']
  },

  // ==========================================
  // 3. MOMOS & DUMPLINGS (STARTERS)
  // ==========================================
  {
    id: 'momo-steamed-1',
    title: 'Steamed Nepali Momos',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Momo_nepal.jpg/960px-Momo_nepal.jpg',
    category: 'Starters',
    family: 'momo',
    isVeg: true,
    tags: ['momo', 'momos', 'steamed momo', 'veg momo', 'momo veg', 'dumpling', 'dumplings']
  },
  {
    id: 'momo-chicken-1',
    title: 'Steamed Chicken Momos',
    url: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    family: 'momo',
    isVeg: false,
    tags: ['momo chicken', 'chicken momo', 'steamed chicken momo', 'momo buff', 'buff momo', 'momo', 'meat momo']
  },
  {
    id: 'momo-jhol-1',
    title: 'Himalayan Jhol Momo with Spicy Broth',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Momo_nepal.jpg/960px-Momo_nepal.jpg',
    category: 'Starters',
    family: 'momo',
    isVeg: true,
    tags: ['jhol momo', 'jhol momo veg', 'jhol momo chicken', 'jhol momo buff', 'soup momo', 'momo in soup']
  },
  {
    id: 'momo-c-momo-1',
    title: 'Spicy Chilli C-Momo',
    url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    family: 'momo',
    isVeg: false,
    tags: ['c-momo', 'c momo', 'chilli momo', 'fried momo', 'kothey', 'spicy momo']
  },

  // ==========================================
  // 4. NOODLES, CHINESE & THAI (ENTREES / SPECIAL)
  // ==========================================
  {
    id: 'noodle-chowmein-1',
    title: 'Stir-Fried Veg Chowmein',
    url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    family: 'noodle',
    isVeg: true,
    tags: ['chowmein', 'veg chowmein', 'noodles', 'stir fry noodles', 'chowmein veg', 'chinese']
  },
  {
    id: 'noodle-chowmein-chicken-1',
    title: 'Chicken Chowmein with Wok Toss',
    url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    family: 'noodle',
    isVeg: false,
    tags: ['chowmein chicken', 'chicken chowmein', 'egg chowmein', 'buff chowmein', 'mixed chowmein', 'noodles']
  },
  {
    id: 'noodle-thukpa-1',
    title: 'Himalayan Noodle Soup (Thukpa)',
    url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    family: 'noodle',
    isVeg: true,
    tags: ['thukpa', 'thukpa veg', 'thukpa chicken', 'thukpa buff', 'himalayan thukpa', 'noodle soup', 'noodles']
  },
  {
    id: 'noodle-pad-thai-1',
    title: 'Authentic Thai Pad Thai',
    url: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'noodle',
    isVeg: false,
    tags: ['pad thai', 'thai rice noodles', 'sautéed thai rice noodles', 'thai noodles', 'noodles']
  },
  {
    id: 'noodle-chopsuey-veg-1',
    title: 'Crispy American Chopsuey Bowl',
    url: 'https://images.unsplash.com/photo-1617093727343-374698b1b08d?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'noodle',
    isVeg: true,
    tags: ['chopsuey', 'chopsuey veg', 'chicken chopsuey', 'american chopsuey', 'crispy noodles']
  },

  // ==========================================
  // 5. PASTA (SPECIAL MENU)
  // ==========================================
  {
    id: 'pasta-spaghetti-garlic-1',
    title: 'Garlic Spaghetti Aglio e Olio',
    url: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'pasta',
    isVeg: true,
    tags: ['garlic spaghetti', 'spaghetti', 'pasta', 'aglio e olio', 'italian']
  },
  {
    id: 'pasta-spaghetti-chicken-1',
    title: 'Chicken Spaghetti Marinara',
    url: 'https://images.unsplash.com/photo-1556761223-4c4282c73f77?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'pasta',
    isVeg: false,
    tags: ['chicken spaghetti', 'spaghetti', 'chicken pasta', 'pasta']
  },
  {
    id: 'pasta-penne-tomato-veg-1',
    title: 'Penne Tomato Sauce (Veg)',
    url: 'https://images.unsplash.com/photo-1598866594230-a7c12756260f?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'pasta',
    isVeg: true,
    tags: ['penne tomato sauce veg', 'penne tomato sauce', 'penne', 'pasta', 'arrabiata', 'tomato sauce']
  },
  {
    id: 'pasta-penne-tomato-nonveg-1',
    title: 'Penne Tomato Sauce (Non-Veg)',
    url: 'https://images.unsplash.com/photo-1598866594230-a7c12756260f?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'pasta',
    isVeg: false,
    tags: ['penne tomato sauce non-veg', 'penne tomato sauce', 'chicken penne', 'penne', 'pasta']
  },

  // ==========================================
  // 6. PIZZA (SPECIAL MENU)
  // ==========================================
  {
    id: 'pizza-cheese-1',
    title: 'Classic Margherita Cheese Pizza',
    url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'pizza',
    isVeg: true,
    tags: ['cheese pizza', 'cheese', 'pizza', 'margherita', 'plain cheese']
  },
  {
    id: 'pizza-veg-2',
    title: 'Fresh Vegetable Supreme Pizza',
    url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'pizza',
    isVeg: true,
    tags: ['vegetable pizza', 'vegetable', 'veg pizza', 'pizza', 'garden veggie']
  },
  {
    id: 'pizza-mushroom-3',
    title: 'Wild Mushroom Pizza',
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'pizza',
    isVeg: true,
    tags: ['mushroom pizza', 'mushroom', 'pizza', 'fungi']
  },
  {
    id: 'pizza-chicken-4',
    title: 'BBQ Chicken Pizza',
    url: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'pizza',
    isVeg: false,
    tags: ['chicken pizza', 'chicken', 'mixed pizza', 'mixed', 'meat pizza', 'pizza']
  },

  // ==========================================
  // 7. RICE & CHEF SPECIAL DISHES
  // ==========================================
  {
    id: 'rice-fried-rice-1',
    title: 'Wok-Tossed Fried Rice',
    url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80',
    category: 'Entrees',
    family: 'rice',
    isVeg: true,
    tags: ['fried rice', 'thai fried rice', 'veg fried rice', 'chicken fried rice', 'egg fried rice', 'rice']
  },
  {
    id: 'rice-kaprou-gai-1',
    title: 'Ka-prou Gai Thai Basil Chicken Rice',
    url: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'rice',
    isVeg: false,
    tags: ['ka-prou gai', 'kaprou gai', 'ka prou gai', 'thai basil chicken', 'rice topped with minced chicken', 'mushroom sauce rice', 'rice']
  },
  {
    id: 'rice-mapo-tofu-1',
    title: 'Mapo Tofu with Rice',
    url: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'rice',
    isVeg: true,
    tags: ['mapo tofu w rice', 'mapo tofu', 'tofu rice', 'chinese mapo tofu', 'japanese style mapo tofu', 'rice']
  },
  {
    id: 'rice-shredded-chicken-1',
    title: 'Shredded Chicken with Rice',
    url: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'rice',
    isVeg: false,
    tags: ['shredded chicken with rice', 'shredded chicken', 'chicken with rice', 'rice']
  },
  {
    id: 'rice-beijing-chicken-1',
    title: 'Beijing Chicken with Rice',
    url: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'rice',
    isVeg: false,
    tags: ['beijing chicken w rice', 'beijing chicken', 'chicken rice', 'rice']
  },
  {
    id: 'rice-choysum-1',
    title: 'Choy-sum Chinese Spinach with Rice',
    url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    category: 'Special Menu',
    family: 'rice',
    isVeg: true,
    tags: ['choy-sum rice', 'choy sum rice', 'chinese spinach w rice', 'chinese spinach', 'rice']
  },
  {
    id: 'rice-jaulo-1',
    title: 'Nepali Comfort Jaulo',
    url: 'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=600&q=80',
    category: 'Health Menu',
    family: 'rice',
    isVeg: true,
    tags: ['jaulo', 'special non-veg jaulo', 'khichdi', 'rice porridge', 'healing rice', 'rice']
  },
  {
    id: 'rice-plain-steamed-1',
    title: 'Steamed Basmati Plain Rice',
    url: 'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=600&q=80',
    category: 'Extras',
    family: 'rice',
    isVeg: true,
    tags: ['plain rice', 'rice', 'steamed rice', 'basmati rice', 'bhat', 'extras']
  },
  {
    id: 'rice-porridge-1',
    title: 'Warm Rice Porridge',
    url: 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=600&q=80',
    category: 'Health Menu',
    family: 'rice',
    isVeg: true,
    tags: ['rice porridge', 'congee', 'porridge', 'health menu', 'rice']
  },

  // ==========================================
  // 8. SOUPS
  // ==========================================
  {
    id: 'soup-vegetable-1',
    title: 'Clear Vegetable Soup',
    url: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=600&q=80',
    category: 'Soups',
    family: 'soup',
    isVeg: true,
    tags: ['clear soup', 'clear soup veg', 'vegetable soup', 'soup', 'clear vegetable soup']
  },
  {
    id: 'soup-mushroom-1',
    title: 'Creamy Wild Mushroom Soup',
    url: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=600&q=80',
    category: 'Soups',
    family: 'soup',
    isVeg: true,
    tags: ['mushroom soup', 'clear soup mushroom', 'soup']
  },
  {
    id: 'soup-chicken-2',
    title: 'Hearty Chicken & Broth Soup',
    url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80',
    category: 'Soups',
    family: 'soup',
    isVeg: false,
    tags: ['chicken soup', 'clear soup chicken', 'mixed soup', 'hot and sour mixed soup', 'hot and sour', 'protein soup', 'jwana soup', 'soup']
  },

  // ==========================================
  // 9. STARTERS
  // ==========================================
  {
    id: 'starter-fries-1',
    title: 'Golden Potato French Fries',
    url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    family: 'starter',
    isVeg: true,
    tags: ['potato fries', 'french fries', 'chips', 'crispy fries', 'starters']
  },
  {
    id: 'starter-chips-chilly-1',
    title: 'Crispy Chips Chilly',
    url: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    family: 'starter',
    isVeg: true,
    tags: ['chips chilly', 'chilli chips', 'potato chilly', 'starters']
  },
  {
    id: 'starter-chicken-chilly-1',
    title: 'Sizzling Chicken Chilly',
    url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    family: 'starter',
    isVeg: false,
    tags: ['chicken chilly', 'chicken chilly nepal', 'chinese chicken chilly', 'starters']
  },
  {
    id: 'starter-crispy-buff-1',
    title: 'Crispy Buff Chilly Strips',
    url: 'https://images.unsplash.com/photo-1628294895950-9805252327bc?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    family: 'starter',
    isVeg: false,
    tags: ['crispy buff chilly', 'buff chilly', 'chilly buff', 'crispy buff', 'starters']
  },
  {
    id: 'starter-roti-roll-1',
    title: 'Savory Roti Roll',
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/58/Roti.jpg',
    category: 'Starters',
    family: 'starter',
    isVeg: true,
    tags: ['roti rolls', 'roti roll', 'roti rolls veg', 'roti rolls non-veg', 'kathi roll', 'starters']
  },
  {
    id: 'starter-protein-bara-1',
    title: 'Traditional Protein Bara (Lentil Pancake)',
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    family: 'starter',
    isVeg: true,
    tags: ['protein bara', 'bara', 'woh', 'savory lentil pancake', 'lentil pancake', 'health menu']
  },
  {
    id: 'starter-mashed-potato-1',
    title: 'Creamy Mashed Potato Bowl',
    url: 'https://images.unsplash.com/photo-1633436375795-12b3b339712f?auto=format&fit=crop&w=600&q=80',
    category: 'Starters',
    family: 'starter',
    isVeg: true,
    tags: ['mashed potato', 'mashed potatoes', 'creamy potato', 'health menu']
  },

  // ==========================================
  // 10. CURRY & EXTRAS
  // ==========================================
  {
    id: 'curry-veg-1',
    title: 'Mixed Vegetable Curry',
    url: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80',
    category: 'Extras',
    family: 'curry',
    isVeg: true,
    tags: ['veg curry', 'vegetable curry', 'tarkari', 'curry', 'extras']
  },
  {
    id: 'curry-chicken-1',
    title: 'Homestyle Chicken Curry Gravy',
    url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
    category: 'Extras',
    family: 'curry',
    isVeg: false,
    tags: ['chicken curry', 'meat curry', 'chicken gravy', 'curry', 'extras']
  },
  {
    id: 'curry-daal-1',
    title: 'Nepali Yellow Daal / Moong Daal',
    url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    category: 'Extras',
    family: 'curry',
    isVeg: true,
    tags: ['daal', 'dal', 'moong daal', 'lentil daal', 'curry', 'extras']
  },
  {
    id: 'curry-chana-1',
    title: 'Spiced Chana Masala Curry',
    url: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80',
    category: 'Extras',
    family: 'curry',
    isVeg: true,
    tags: ['chana', 'chana masala', 'chickpea curry', 'curry', 'extras']
  },
  {
    id: 'bread-fulka-roti-1',
    title: 'Fresh Roti / Fulka Flatbread',
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/58/Roti.jpg',
    category: 'Extras',
    family: 'bread',
    isVeg: true,
    tags: ['fulka', 'roti', 'chapati', 'fulka per piece', 'extras', 'bread']
  },
  {
    id: 'dessert-yogurt-1',
    title: 'Fresh Plain Yogurt / Dahi',
    url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=600&q=80',
    category: 'Extras',
    family: 'dessert',
    isVeg: true,
    tags: ['yogurt', 'curd', 'dahi', 'fresh yogurt', 'extras', 'dessert']
  },

  // ==========================================
  // 11. BREAKFAST
  // ==========================================
  {
    id: 'breakfast-regular-1',
    title: 'Regular Breakfast Platter with Eggs & Toast',
    url: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    family: 'breakfast',
    isVeg: false,
    tags: ['regular breakfast', 'american breakfast', 'breakfast platter', 'breakfast', 'eggs and toast']
  },
  {
    id: 'breakfast-french-toast-1',
    title: 'Golden French Toast Slices',
    url: 'https://images.unsplash.com/photo-1484723091739-30a097e8f929?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    family: 'breakfast',
    isVeg: true,
    tags: ['french toast', 'toast', 'breakfast']
  },
  {
    id: 'breakfast-cereal-oats-1',
    title: 'Cornflakes & Oats with Warm Milk',
    url: 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    family: 'breakfast',
    isVeg: true,
    tags: ['cornflakes oats with milk', 'cornflakes', 'oats with milk', 'buckwheat flakes phapher', 'buckwheat flakes', 'cereal', 'breakfast']
  },
  {
    id: 'breakfast-omelette-1',
    title: 'Farm Fresh Egg Omelette',
    url: 'https://images.unsplash.com/photo-1510693206972-df098062cb71?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    family: 'breakfast',
    isVeg: false,
    tags: ['plain omelette', 'masala omelette', 'omelette', 'eggs', 'breakfast']
  },
  {
    id: 'breakfast-boiled-eggs-1',
    title: 'Boiled Farm Eggs',
    url: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    family: 'breakfast',
    isVeg: false,
    tags: ['boiled eggs', 'boiled eggs 2 eggs', 'eggs', 'breakfast']
  },
  {
    id: 'breakfast-poached-egg-1',
    title: 'Perfect Poached Egg',
    url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    family: 'breakfast',
    isVeg: false,
    tags: ['egg poached', 'poached egg', 'egg', 'extras', 'breakfast']
  },
  {
    id: 'bread-toast-1',
    title: 'Crispy Butter Toast',
    url: 'https://images.unsplash.com/photo-1584776296944-ab6fb57b0bdd?auto=format&fit=crop&w=600&q=80',
    category: 'Breakfast',
    family: 'bread',
    isVeg: true,
    tags: ['plain toast', 'toast', 'toast with butter', 'toast with jam', 'breakfast', 'bread']
  },

  // ==========================================
  // 12. BEVERAGES & SODAS
  // ==========================================
  {
    id: 'drink-water-1',
    title: 'Chilled Mineral Water Bottle',
    url: 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'beverage',
    isVeg: true,
    tags: ['water', 'mineral water', 'bottled water', 'beverage']
  },
  {
    id: 'drink-hot-milk-1',
    title: 'Steamed Warm Milk',
    url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'beverage',
    isVeg: true,
    tags: ['hot milk', 'warm milk', 'milk', 'beverage']
  },
  {
    id: 'drink-fanta-1',
    title: 'Fanta Orange Can',
    url: 'https://images.unsplash.com/photo-1624552184280-9e9631bbeee9?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'beverage',
    isVeg: true,
    tags: ['fanta', 'coke fanta sprite', 'soda', 'cold drink', 'beverage']
  },
  {
    id: 'drink-sprite-1',
    title: 'Sprite Chilled Bottle/Can',
    url: 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'beverage',
    isVeg: true,
    tags: ['sprite', 'coke fanta sprite', 'soda', 'cold drink', 'beverage']
  },
  {
    id: 'drink-coke-1',
    title: 'Coca-Cola Chilled Can',
    url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'beverage',
    isVeg: true,
    tags: ['coke', 'coca-cola', 'coke fanta sprite', 'soda', 'cold drink', 'beverage']
  },
  {
    id: 'drink-lemon-soda-1',
    title: 'Fresh Lemon Soda with Mint',
    url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'beverage',
    isVeg: true,
    tags: ['fresh lemon soda', 'plain soda', 'lemon soda', 'soda', 'beverage']
  },

  // ==========================================
  // 13. TEAS
  // ==========================================
  {
    id: 'tea-milk-1',
    title: 'Nepali Masala Milk Tea (Chiya)',
    url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'tea',
    isVeg: true,
    tags: ['milk tea', 'nepali tea', 'masala tea', 'chiya', 'chai', 'tea', 'beverage']
  },
  {
    id: 'tea-black-1',
    title: 'Fresh Hot Black Tea',
    url: 'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'tea',
    isVeg: true,
    tags: ['black tea', 'tea', 'beverage']
  },
  {
    id: 'tea-green-1',
    title: 'Pure Organic Green Tea',
    url: 'https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'tea',
    isVeg: true,
    tags: ['green tea', 'tea', 'beverage']
  },
  {
    id: 'tea-lemon-1',
    title: 'Hot Lemon Tea with Honey',
    url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'tea',
    isVeg: true,
    tags: ['hot lemon', 'hot lemon with honey', 'lemon tea', 'tea', 'beverage']
  },
  {
    id: 'tea-iced-lemon-1',
    title: 'Chilled Iced Lemon Tea',
    url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=600&q=80',
    category: 'Beverage',
    family: 'tea',
    isVeg: true,
    tags: ['iced lemon tea', 'cold tea', 'tea', 'beverage']
  },

  // ==========================================
  // 14. COFFEE CORNER
  // ==========================================
  {
    id: 'coffee-espresso-1',
    title: 'Rich Crema Espresso Shot',
    url: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=600&q=80',
    category: 'Coffee Corner',
    family: 'coffee',
    isVeg: true,
    tags: ['espresso', 'single shot', 'double shot', 'coffee']
  },
  {
    id: 'coffee-americano-1',
    title: 'Classic Caffe Americano',
    url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=80',
    category: 'Coffee Corner',
    family: 'coffee',
    isVeg: true,
    tags: ['americano', 'regular black coffee', 'black coffee', 'iced americano', 'coffee']
  },
  {
    id: 'coffee-cappuccino-1',
    title: 'Foamy Italian Cappuccino',
    url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80',
    category: 'Coffee Corner',
    family: 'coffee',
    isVeg: true,
    tags: ['cappuccino', 'coffee']
  },
  {
    id: 'coffee-latte-1',
    title: 'Silky Cafe Latte Art',
    url: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?auto=format&fit=crop&w=600&q=80',
    category: 'Coffee Corner',
    family: 'coffee',
    isVeg: true,
    tags: ['cafe latte', 'latte', 'regular milk coffee', 'milk coffee', 'honey latte', 'coffee']
  },
  {
    id: 'coffee-iced-latte-1',
    title: 'Chilled Iced Latte',
    url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=80',
    category: 'Coffee Corner',
    family: 'coffee',
    isVeg: true,
    tags: ['iced latte', 'iced mocha', 'iced coffee', 'coffee']
  },
  {
    id: 'coffee-mocha-1',
    title: 'Decadent Cafe Mocha',
    url: 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?auto=format&fit=crop&w=600&q=80',
    category: 'Coffee Corner',
    family: 'coffee',
    isVeg: true,
    tags: ['cafe mocha', 'mocha', 'coffee']
  },
  {
    id: 'coffee-hot-chocolate-1',
    title: 'Warm Frothy Hot Chocolate',
    url: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=600&q=80',
    category: 'Coffee Corner',
    family: 'coffee',
    isVeg: true,
    tags: ['hot chocolate', 'cocoa', 'chocolate', 'coffee corner']
  }
];

export interface ImageSearchResult {
  id: string;
  title: string;
  url: string;
  source: string;
}

const FAMILY_PATTERNS: Record<FoodFamily, RegExp> = {
  thali: /\b(thali|lunch\s*set|dinner\s*set|khana\s*set|platter|bhat\s*tarkari)\b/,
  sandwich: /\b(sandwich|sandwiches|grilled\s*cheese|club\s*sandwich)\b/,
  burger: /\b(burger|burgers|hamburger)\b/,
  pizza: /\b(pizza|pizzas)\b/,
  momo: /\b(momo|momos|dumpling|dumplings|c-?momo|jhol\s*momo|kothey)\b/,
  pasta: /\b(pasta|spaghetti|penne|macaroni|arrabiata|carbonara|aglio)\b/,
  noodle: /\b(chowmein|thukpa|pad\s*thai|chopsuey|noodles?|hakka)\b/,
  soup: /\b(soup|broth|shorba|jwana)\b/,
  starter: /\b(fries|french\s*fries|chips\s*chilly|chicken\s*chilly|buff\s*chilly|chilly|chilli|sekuwa|tikka|bara|woh|mashed\s*potato)\b/,
  bread: /\b(roti|fulka|phulka|chapati|naan|paratha|toast)\b/,
  breakfast: /\b(breakfast|omelette|omelet|egg|eggs|poached|boiled\s*egg|french\s*toast|cornflakes|oats|oatmeal|phapar|buckwheat)\b/,
  curry: /\b(curry|gravy|daal|dal|moong\s*daal|chana|tarkari)\b/,
  dessert: /\b(yogurt|curd|dahi|dessert|sweet)\b/,
  coffee: /\b(coffee|espresso|americano|latte|cappuccino|mocha|hot\s*chocolate|cocoa)\b/,
  tea: /\b(tea|chiya|chai|green\s*tea|lemon\s*tea|iced\s*tea|hot\s*lemon)\b/,
  beverage: /\b(water|milk|soda|coke|coca-cola|fanta|sprite|juice|lemonade)\b/,
  rice: /\b(rice|bhat|biryani|biriyani|fried\s*rice|jaulo|khichdi|porridge|congee|kaprou|ka-prou|gai|choy-?sum)\b/
};

export function detectFamily(text: string): FoodFamily | null {
  for (const [fam, reg] of Object.entries(FAMILY_PATTERNS) as [FoodFamily, RegExp][]) {
    if (reg.test(text)) return fam;
  }
  return null;
}

/**
 * Searches the curated culinary library with strict food family isolation,
 * dietary validation (veg vs non-veg), and verified food photo results.
 */
export function queryCuratedLibrary(rawQuery: string, category?: string, foodType?: string): ImageSearchResult[] {
  if (!rawQuery || rawQuery.trim().length === 0) return [];

  const cleanQ = rawQuery
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  const targetFamily = detectFamily(cleanQ);

  const isVegQuery =
    foodType === 'veg' ||
    (/\b(veg|vegetarian)\b/.test(cleanQ) && !/\bnon-?veg\b/.test(cleanQ));

  const isNonVegQuery =
    foodType === 'non-veg' ||
    /\b(non-?veg|chicken|buff|meat|mutton|ham|bacon)\b/.test(cleanQ);

  interface ScoredItem {
    item: CulinaryItem;
    score: number;
  }

  const scored: ScoredItem[] = [];

  for (const item of CULINARY_LIBRARY) {
    let score = 0;

    // Strict Family Isolation: Disqualify completely if target family doesn't match
    if (targetFamily) {
      if (item.family !== targetFamily) {
        // Safe cross-family exception: bread and breakfast can share toast
        const canCross = (targetFamily === 'bread' && item.family === 'breakfast') ||
                         (targetFamily === 'breakfast' && item.family === 'bread');
        if (!canCross) {
          continue; // DISQUALIFIED: Zero cross-contamination between families!
        }
      }
    }

    // Strict Dietary Isolation
    if (isVegQuery) {
      if (!item.isVeg) continue; // DISQUALIFIED: Never show meat items when veg requested!
      score += 25;
    }

    if (isNonVegQuery) {
      if (!item.isVeg) score += 35;
      else score -= 15;
    }

    const itemText = `${item.title} ${item.tags.join(' ')} ${item.category}`.toLowerCase();

    // 1. Exact tag match or phrase match
    for (const tag of item.tags) {
      if (cleanQ === tag || cleanQ.includes(tag) || tag.includes(cleanQ)) {
        score += 80;
      }
    }

    // 2. Token overlap
    const tokens = cleanQ.split(/\s+/).filter(t => t.length > 1);
    for (const token of tokens) {
      if (itemText.includes(token)) {
        score += 20;
      }
    }

    // 3. Category match
    if (category && item.category.toLowerCase().includes(category.toLowerCase())) {
      score += 15;
    }

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

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

  // Fallback: If family matched but zero items scored, return top items in that family
  if (results.length === 0 && targetFamily) {
    const familyItems = CULINARY_LIBRARY.filter(i => i.family === targetFamily && (!isVegQuery || i.isVeg));
    for (const item of familyItems.slice(0, 3)) {
      results.push({
        id: item.id,
        title: item.title,
        url: item.url,
        source: 'Curated Library'
      });
    }
  }

  return results;
}
