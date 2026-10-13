/**
 * Helper to produce clean, URL-safe and human-readable document IDs for Firestore
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
 * Generates a clean Firestore document ID for a menu item based on dish name
 */
export function generateMenuDocId(dishName: string): string {
  const base = slugify(dishName) || 'menu-item';
  return base;
}

/**
 * Generates a clean Firestore document ID for a user based on business name and role/email
 */
export function generateUserDocId(businessName: string, roleOrEmail?: string): string {
  const baseBiz = slugify(businessName) || 'business';
  if (!roleOrEmail) return baseBiz;
  const sub = slugify(roleOrEmail.split('@')[0]);
  return `${baseBiz}-${sub}`;
}

/**
 * Generates a clean Firestore document ID for a menu category based on name
 */
export function generateCategoryDocId(categoryName: string): string {
  return slugify(categoryName) || 'category';
}
