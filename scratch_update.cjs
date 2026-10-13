const fs = require('fs');
let c = fs.readFileSync('src/types/rbac.ts', 'utf8');
c = c.replace(/export interface MenuItemVariant \{[\s\S]*?is_available\?: boolean;\r?\n\}/, `export interface MenuItemVariant {
  id: string;
  name: string; // e.g. "Small", "Medium", "Large" or "Half", "Full", or "30ml", "60ml", "Bottle"
  price: number;
  is_available?: boolean;
  image_url?: string;
  description?: string;
}`);
fs.writeFileSync('src/types/rbac.ts', c);
