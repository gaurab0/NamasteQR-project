/**
 * Helper to produce clean, URL-safe and human-readable IDs
 */
export function slugify(text: string): string {
  if (!text) return 'item';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-') // Replace spaces and non-word characters with a single dash
    .replace(/^-+|-+$/g, '');   // Trim leading/trailing dashes
}

/**
 * Sanitizes phone numbers to standard format (e.g. "+9779812345678" or "9812345678")
 */
export function sanitizePhoneId(phone: string): string {
  if (!phone) return 'unknown_phone';
  return phone.toString().trim().replace(/[^a-zA-Z0-9+]/g, '');
}

/**
 * Generates a clean ID for a menu item based on dish name and business
 */
export function generateMenuDocId(dishName: string, businessId?: string): string {
  const base = slugify(dishName) || 'item';
  const bizPrefix = businessId ? `${slugify(businessId)}_` : '';
  const rand = Math.random().toString(36).substring(2, 8);
  return `${bizPrefix}${base}_${rand}`;
}

/**
 * Generates a clean ID for a user based on business name and role/email
 */
export function generateUserDocId(businessName: string, roleOrEmail?: string): string {
  const baseBiz = slugify(businessName) || 'business';
  if (!roleOrEmail) return baseBiz;
  const sub = slugify(roleOrEmail.split('@')[0]);
  return `${baseBiz}-${sub}`;
}

/**
 * Generates a clean ID for a menu category based on name and business
 */
export function generateCategoryDocId(categoryName: string, businessId?: string): string {
  const base = slugify(categoryName) || 'cat';
  const bizPrefix = businessId ? `${slugify(businessId)}_` : '';
  const rand = Math.random().toString(36).substring(2, 8);
  return `${bizPrefix}${base}_${rand}`;
}
