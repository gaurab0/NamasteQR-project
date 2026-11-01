import { TabPermissionId, TAB_PERMISSION_IDS } from '../types/rbac';

export const TAB_LABELS: Record<TabPermissionId, string> = {
  overview: 'Dashboard',
  operations: 'Business Operation',
  kds: 'Orders',
  waiter: 'Waiter Station',
  checkins: 'Table & Space',
  menus: 'Menu',
  billing: 'Finance & POS',
  team: 'Staff',
  configurations: 'Settings',
  account: 'Business Details',
  franchise: 'Franchise / Branch Switcher',
};

const BUSINESS_OWNER_ROLES = new Set(['OWNER', 'ADMIN', 'RESTAURANT_OWNER', 'HOTEL_OWNER']);

const TAB_SET: ReadonlySet<string> = new Set<string>(TAB_PERMISSION_IDS);

/**
 * Standard order for sidebar tab navigation fallback.
 * (franchise is in the navbar, not a sidebar dashboard tab).
 */
export const SIDEBAR_TAB_ORDER = [
  'overview',
  'account',
  'operations',
  'kds',
  'waiter',
  'checkins',
  'menus',
  'billing',
  'team',
  'configurations',
] as const;

export type SidebarTabId = (typeof SIDEBAR_TAB_ORDER)[number];

export type AccessSubject = {
  role?: string | null;
  allowed_tabs?: TabPermissionId[] | null;
} | null | undefined;

/**
 * Exact-match check for business owner / admin roles.
 * Managers are NOT owners. Do NOT use substring matching (.includes('OWNER')).
 */
export function isBusinessOwner(role?: string | null): boolean {
  if (!role || typeof role !== 'string') return false;
  return BUSINESS_OWNER_ROLES.has(role.trim().toUpperCase());
}

/**
 * Returns all valid permitted tabs for the given subject.
 * Owners always receive all 11 tabs.
 * Non-owners are strictly limited to valid IDs present in allowed_tabs.
 */
export function getEffectiveTabs(subject: AccessSubject): TabPermissionId[] {
  if (!subject) return [];
  if (isBusinessOwner(subject.role)) {
    return [...TAB_PERMISSION_IDS];
  }
  if (!Array.isArray(subject.allowed_tabs)) {
    return [];
  }
  const clean = new Set<TabPermissionId>();
  for (const tab of subject.allowed_tabs) {
    if (typeof tab === 'string' && TAB_SET.has(tab)) {
      clean.add(tab as TabPermissionId);
    }
  }
  return TAB_PERMISSION_IDS.filter((t) => clean.has(t));
}

/**
 * Checks whether the subject has permission to access the requested tab.
 */
export function canAccessTab(subject: AccessSubject, tab: TabPermissionId | 'analytics'): boolean {
  if (!subject) return false;
  if (isBusinessOwner(subject.role)) return true;
  if (tab === 'analytics') {
    const eff = getEffectiveTabs(subject);
    return eff.includes('operations') || eff.includes('billing') || eff.includes('overview');
  }
  return getEffectiveTabs(subject).includes(tab as TabPermissionId);
}

/**
 * Returns the first accessible dashboard tab in canonical sidebar order,
 * or null if no sidebar tabs are permitted.
 */
export function getFirstPermittedTab(subject: AccessSubject): SidebarTabId | null {
  if (!subject) return null;
  const effective = new Set(getEffectiveTabs(subject));
  for (const tab of SIDEBAR_TAB_ORDER) {
    if (effective.has(tab)) {
      return tab;
    }
  }
  return null;
}
