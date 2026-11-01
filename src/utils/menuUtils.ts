import { MenuItem } from '../types/rbac';

/**
 * Returns all categories assigned to an item (primary category + additional categories).
 * Guarantees no duplicates and non-empty strings.
 */
export function getAllItemCategories(item: Partial<MenuItem> | null | undefined): string[] {
  if (!item) return [];
  const result: string[] = [];

  if (item.category && item.category.trim()) {
    result.push(item.category.trim());
  }

  if (Array.isArray(item.additional_categories)) {
    for (const cat of item.additional_categories) {
      if (typeof cat === 'string' && cat.trim()) {
        const trimmed = cat.trim();
        if (!result.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
          result.push(trimmed);
        }
      }
    }
  }

  return result;
}

/**
 * Checks if a MenuItem belongs to the specified category filter.
 * Returns true if filter is 'All' or if primary/additional categories match.
 */
export function itemMatchesCategory(item: MenuItem, filterCategory: string): boolean {
  if (!filterCategory || filterCategory === 'All' || filterCategory.toLowerCase() === 'all') {
    return true;
  }
  const filterLower = filterCategory.toLowerCase();
  
  if (item.category && item.category.toLowerCase() === filterLower) {
    return true;
  }

  if (Array.isArray(item.additional_categories)) {
    return item.additional_categories.some(
      (c) => typeof c === 'string' && c.toLowerCase() === filterLower
    );
  }

  return false;
}

/**
 * Resolves the station assignment of an item.
 * Explicitly manual: returns item.station if set, or defaults to 'KITCHEN'.
 */
export function determineItemStation(
  item: { name?: string; category?: string; additional_categories?: string[]; station?: 'KITCHEN' | 'BAR' | 'BOTH' }
): 'KITCHEN' | 'BAR' | 'BOTH' {
  if (item?.station) return item.station;
  return 'KITCHEN';
}

