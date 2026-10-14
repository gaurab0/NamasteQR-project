/**
 * Tab-based access control core (working.md section 19).
 *
 * Pure module: no database imports, so it can be unit tested in isolation
 * and imported from services, middleware and routes without circular dependencies.
 *
 * Model:
 *  - An account is allowed to open a set of "tabs" (TAB_PERMISSION_IDS: the 10 sidebar tabs
 *    plus the navbar franchise switcher). Nothing else is a permission.
 *  - Business owners/admins always have all tabs.
 *  - Everyone else (including MANAGER roles) is governed strictly by `allowed_tabs`.
 *  - Roles are display labels only. The role is consulted in exactly two places:
 *    `isBusinessOwnerRole` (the owner bypass) and `deriveAllowedTabs` (one-time migration of
 *    accounts that were created before `allowed_tabs` existed).
 *  - Server resources (menus, tables, orders ...) are protected by mapping each resource to the
 *    tab(s) that need it (`RESOURCE_TAB_MAP`).
 */
import { TAB_PERMISSION_IDS, type TabPermissionId, type AppResource, type AppAction } from '../types/rbac.types';

export { TAB_PERMISSION_IDS };
export type { TabPermissionId };

export type AccessKind = 'read' | 'write';

/** Anything that looks enough like a user/session for permission checks. */
export interface AccessSubject {
  id?: string;
  role?: string | null;
  email?: string;
  allowed_tabs?: unknown;
  /** @deprecated only read by deriveAllowedTabs for one-time migration of legacy accounts */
  custom_permissions?: unknown;
  acting_as?: {
    id?: string;
    email?: string;
    role?: string | null;
    allowed_tabs?: unknown;
  } | null;
}

// ---------------------------------------------------------------------------
// Owner bypass
// ---------------------------------------------------------------------------

const BUSINESS_OWNER_ROLES = new Set(['OWNER', 'ADMIN', 'RESTAURANT_OWNER', 'HOTEL_OWNER']);
const MANAGER_ROLES = new Set(['MANAGER', 'RESTAURANT_MANAGER', 'HOTEL_MANAGER']);

const normalizeRoleName = (role: unknown): string =>
  typeof role === 'string' ? role.trim().toUpperCase() : '';

/** Exact-match owner check. Managers are deliberately NOT owners. */
export function isBusinessOwnerRole(role: unknown): boolean {
  return BUSINESS_OWNER_ROLES.has(normalizeRoleName(role));
}

export function isManagerRole(role: unknown): boolean {
  return MANAGER_ROLES.has(normalizeRoleName(role));
}

// ---------------------------------------------------------------------------
// Tab list helpers
// ---------------------------------------------------------------------------

const TAB_SET: ReadonlySet<string> = new Set<string>(TAB_PERMISSION_IDS);

export function isTabPermissionId(value: unknown): value is TabPermissionId {
  return typeof value === 'string' && TAB_SET.has(value);
}

/** Returns the valid, de-duplicated tab ids in canonical order. Non-arrays yield []. */
export function sanitizeTabs(input: unknown): TabPermissionId[] {
  if (!Array.isArray(input)) return [];
  const present = new Set<string>();
  for (const v of input) {
    if (isTabPermissionId(v)) present.add(v);
  }
  return TAB_PERMISSION_IDS.filter((t) => present.has(t));
}

/** Returns the entries of `input` that are not valid tab ids (for request validation). */
export function findInvalidTabs(input: unknown): unknown[] {
  if (!Array.isArray(input)) return [input];
  return input.filter((v) => !isTabPermissionId(v));
}

export function allTabs(): TabPermissionId[] {
  return [...TAB_PERMISSION_IDS];
}

// ---------------------------------------------------------------------------
// One-time migration of legacy accounts (no `allowed_tabs` stored yet)
// ---------------------------------------------------------------------------

/** Legacy custom_permissions resource -> tabs that resource unlocked. */
const LEGACY_RESOURCE_TO_TABS: Partial<Record<AppResource, TabPermissionId[]>> = {
  orders: ['kds', 'waiter'],
  check_ins: ['checkins', 'waiter'],
  tables: ['checkins'],
  rooms: ['checkins'],
  menus: ['menus'],
  billing: ['billing'],
  staff: ['team'],
  settings: ['configurations'],
  business_details: ['account'],
  franchise: ['franchise'],
};

const SERVICE_ROLES = new Set(['WAITER', 'WAITRESS', 'SERVICE', 'SERVICE_STAFF', 'HOUSEKEEPING']);
const KITCHEN_ROLES = new Set(['KITCHEN', 'KITCHEN_STAFF', 'CHEF', 'COOK', 'BAR_STAFF', 'BARTENDER']);
const FRONT_DESK_ROLES = new Set(['FRONT_DESK', 'RECEPTION', 'RECEPTIONIST']);
const CASHIER_ROLES = new Set(['CASHIER']);

/** Which legacy resources each role could touch before the tab model (used only for migration). */
function legacyRoleDefaultHasResource(role: string, resource: AppResource): boolean {
  switch (resource) {
    case 'orders':
      return SERVICE_ROLES.has(role) || KITCHEN_ROLES.has(role) || FRONT_DESK_ROLES.has(role);
    case 'check_ins':
      return SERVICE_ROLES.has(role) || FRONT_DESK_ROLES.has(role);
    case 'menus':
      return KITCHEN_ROLES.has(role);
    case 'billing':
      return FRONT_DESK_ROLES.has(role) || CASHIER_ROLES.has(role);
    default:
      return false;
  }
}

/**
 * Derives the tab list for an account that has no stored `allowed_tabs`.
 * Manager roles keep everything they effectively had (all tabs). For other roles the legacy
 * `custom_permissions` are merged per resource: a resource present in custom_permissions is
 * decided by it (non-empty = granted); a resource absent falls back to the legacy role default.
 * Unknown roles with no custom permissions get no tabs (least privilege).
 */
export function deriveAllowedTabs(role: unknown, customPermissions?: unknown): TabPermissionId[] {
  const normalized = normalizeRoleName(role);
  if (isBusinessOwnerRole(normalized) || isManagerRole(normalized)) return allTabs();

  const custom =
    customPermissions && typeof customPermissions === 'object' && !Array.isArray(customPermissions)
      ? (customPermissions as Record<string, unknown>)
      : {};

  const granted = new Set<TabPermissionId>();
  for (const resource of Object.keys(LEGACY_RESOURCE_TO_TABS) as AppResource[]) {
    const entry = custom[resource];
    let has = false;
    if (Array.isArray(entry)) {
      const actions = entry as AppAction[];
      has = resource === 'franchise' ? actions.includes('manage') : actions.length > 0;
    } else {
      has = legacyRoleDefaultHasResource(normalized, resource);
    }
    if (has) {
      for (const tab of LEGACY_RESOURCE_TO_TABS[resource] || []) granted.add(tab);
    }
  }
  return TAB_PERMISSION_IDS.filter((t) => granted.has(t));
}

// ---------------------------------------------------------------------------
// System / guest contexts (unforgeable markers)
// ---------------------------------------------------------------------------

const systemContexts = new WeakSet<object>();
const guestContexts = new WeakSet<object>();

/** Context for trusted server-internal operations (e.g. creating a sale from a confirmed order). */
export function createSystemContext(): { id: string; role: string; email: string } {
  const ctx = Object.freeze({ id: 'system', role: 'SYSTEM', email: 'system@serveflow.local' });
  systemContexts.add(ctx);
  return ctx;
}

/** Context for unauthenticated customers (QR menu). Public reads only. */
export function createGuestContext(): { id: string; role: string; email: string } {
  const ctx = Object.freeze({ id: 'public-guest', role: 'GUEST', email: 'guest@serveflow.app' });
  guestContexts.add(ctx);
  return ctx;
}

export const isSystemContext = (subject: unknown): boolean =>
  !!subject && typeof subject === 'object' && systemContexts.has(subject as object);

export const isGuestContext = (subject: unknown): boolean =>
  !!subject && typeof subject === 'object' && guestContexts.has(subject as object);

// ---------------------------------------------------------------------------
// Effective tabs / checks
// ---------------------------------------------------------------------------

/**
 * The subject permissions are evaluated for: the acting-as staff member when an owner session
 * is operating under a PIN staff profile, otherwise the user itself.
 */
export function resolveSubject(user: AccessSubject | null | undefined): AccessSubject | null {
  if (!user) return null;
  if (user.acting_as && typeof user.acting_as === 'object') {
    return {
      id: user.acting_as.id,
      email: user.acting_as.email,
      role: user.acting_as.role,
      allowed_tabs: user.acting_as.allowed_tabs,
    };
  }
  return user;
}

/** Effective tab list of a user (after acting-as resolution). */
export function getEffectiveTabs(user: AccessSubject | null | undefined): TabPermissionId[] {
  const subject = resolveSubject(user);
  if (!subject) return [];
  if (isBusinessOwnerRole(subject.role)) return allTabs();
  if (Array.isArray(subject.allowed_tabs)) return sanitizeTabs(subject.allowed_tabs);
  return deriveAllowedTabs(subject.role, subject.custom_permissions);
}

/** True when the (acting-as resolved) subject is a business owner/admin. */
export function isOwnerSubject(user: AccessSubject | null | undefined): boolean {
  const subject = resolveSubject(user);
  return !!subject && isBusinessOwnerRole(subject.role);
}

export function canAccessTab(user: AccessSubject | null | undefined, tab: TabPermissionId): boolean {
  if (isSystemContext(user)) return true;
  if (isGuestContext(user)) return false;
  return getEffectiveTabs(user).includes(tab);
}

/**
 * Resource -> tabs needing it. `public` reads are allowed for everyone including guests.
 * Empty `write` list means owners only (nobody can be granted it through a tab).
 */
export interface ResourceTabRule {
  /** Anyone (incl. unauthenticated guests) may read. */
  publicRead?: boolean;
  read: TabPermissionId[];
  write: TabPermissionId[];
}

export const RESOURCE_TAB_MAP: Record<AppResource, ResourceTabRule> = {
  // The menu is customer-facing; reading it is public. Editing needs the Menu tab
  // (or Settings, which hosts table/menu configuration widgets).
  menus: { publicRead: true, read: [], write: ['menus', 'configurations'] },
  tables: { publicRead: true, read: [], write: ['checkins', 'configurations'] },
  rooms: { read: ['checkins', 'waiter'], write: ['checkins'] },
  check_ins: { read: ['checkins', 'waiter', 'kds', 'billing'], write: ['checkins'] },
  orders: { read: ['kds', 'waiter', 'billing', 'checkins'], write: ['kds', 'waiter', 'billing', 'checkins'] },
  billing: { read: ['billing'], write: ['billing'] },
  staff: { read: ['team'], write: ['team'] },
  settings: { read: ['configurations'], write: ['configurations'] },
  business_details: { read: ['account', 'configurations', 'menus'], write: ['account', 'configurations', 'menus'] },
  franchise: { read: ['franchise'], write: ['franchise'] },
  audit_logs: { read: ['overview'], write: [] },
};

/** AppAction -> read/write. Anything that is not `read` mutates data. */
export function accessKindOf(action: AppAction | string): AccessKind {
  return action === 'read' ? 'read' : 'write';
}

export function canAccessResource(
  user: AccessSubject | null | undefined,
  resource: AppResource,
  kind: AccessKind
): boolean {
  if (isSystemContext(user)) return true;
  const rule = RESOURCE_TAB_MAP[resource];
  if (!rule) return false;
  if (kind === 'read' && rule.publicRead) return true;
  if (isGuestContext(user)) return false;
  if (!user) return false;
  if (isOwnerSubject(user)) return true;
  const needed = kind === 'read' ? rule.read.concat(rule.write) : rule.write;
  if (needed.length === 0) return false;
  const effective = getEffectiveTabs(user);
  return needed.some((tab) => effective.includes(tab));
}

/** Human readable denial reason (for error messages / 403 bodies). */
export function describeResourceRequirement(resource: AppResource, kind: AccessKind): string {
  const rule = RESOURCE_TAB_MAP[resource];
  const tabs = rule ? (kind === 'read' ? rule.read.concat(rule.write) : rule.write) : [];
  return tabs.length ? `requires one of these tabs: ${tabs.join(', ')}` : 'is restricted to business owners';
}
