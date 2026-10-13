import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { 
  firestoreDb, 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  runTransaction, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit 
} from '../config/firebase';
import { 
  AppRole, 
  AppResource, 
  AppAction, 
  RolePermissions, 
  MenuItem, 
  MenuItemVariant,
  FoodType,
  MenuStatus,
  MenuCategory,
  CheckIn, 
  CheckInStatus, 
  RestaurantTable,
  TableStatus,
  TableOrder,
  TableOrderItem,
  OrderStatus,
  AccessCheckResult,
  BusinessTaxConfig,
  TaxRateItem,
  SaleRecord,
  SaleItem,
  SaleTaxBreakdown,
  GLAccountLink,
  GLAccountCategory
} from '../types/rbac.types';
import { db } from './db.service';
import { auditService } from './audit.service';
import { incrementSequence } from '../utils/sequence.util';
import { generateMenuDocId, generateCategoryDocId, slugify } from '../utils/id.utils';
import {
  canAccessResource,
  accessKindOf,
  describeResourceRequirement,
  resolveSubject,
  type AccessSubject,
  isOwnerSubject,
  getEffectiveTabs,
  deriveAllowedTabs,
  sanitizeTabs,
  findInvalidTabs,
  isBusinessOwnerRole,
  isManagerRole,
  TAB_PERMISSION_IDS,
  type TabPermissionId,
} from './tabAccess';

/** The authenticated account performing a staff-management action (honours acting_as). */
type StaffActor = AccessSubject & { id: string };

export class RBACService {
  /**
   * Role names that are recognised as display labels. Roles carry NO permissions:
   * access is decided only by the account's allowed tabs (see ./tabAccess.ts, working.md section 19).
   */
  private static readonly KNOWN_ROLES: ReadonlySet<string> = new Set([
    'OWNER', 'MANAGER', 'ADMIN', 'RESTAURANT_OWNER', 'HOTEL_OWNER', 'RESTAURANT_MANAGER', 'HOTEL_MANAGER',
    'FRONT_DESK', 'KITCHEN_STAFF', 'HOUSEKEEPING', 'CASHIER',
  ]);

  /**
   * Normalizes arbitrary user role string into a recognized AppRole (display label only)
   */
  public normalizeRole(roleString?: string): AppRole {
    if (!roleString) return 'KITCHEN_STAFF';
    const upper = roleString.toUpperCase().trim();
    if (upper === 'MANAGER' || upper === 'RESTAURANT_MANAGER' || upper === 'HOTEL_MANAGER') {
      return 'MANAGER';
    }
    if (upper === 'OWNER' || upper === 'RESTAURANT_OWNER' || upper === 'HOTEL_OWNER' || upper === 'ADMIN') {
      return upper as AppRole;
    }
    if (upper === 'STAFF' || upper === 'WAITER') {
      return 'KITCHEN_STAFF';
    }
    if (RBACService.KNOWN_ROLES.has(upper)) {
      return upper as AppRole;
    }
    return 'KITCHEN_STAFF';
  }

  /**
   * Tab-based permission check. A bare role string can only ever be a business-owner check
   * (non-owner role strings fall back to the one-time legacy derivation in tabAccess).
   * Pass the full user/session object so `allowed_tabs` / `acting_as` are honoured.
   */
  public hasPermission(
    subject: AccessSubject | AppRole | string | null | undefined,
    resource: AppResource,
    action: AppAction | string
  ): boolean {
    const user: AccessSubject | null | undefined =
      typeof subject === 'string' ? { role: subject } : subject;
    return canAccessResource(user, resource, accessKindOf(action));
  }

  /**
   * Evaluates access with detailed auditing for compliance
   */
  public evaluateAccess(
    user: AccessSubject & { id: string },
    resource: AppResource,
    action: AppAction | string
  ): AccessCheckResult {
    const subject = resolveSubject(user);
    const normalizedRole = this.normalizeRole(subject?.role || user.role || undefined);
    const kind = accessKindOf(action);
    const granted = canAccessResource(user, resource, kind);

    if (!granted) {
      const reason = `Permission denied: '${action}' on '${resource}' ${describeResourceRequirement(resource, kind)}.`;
      // Record unauthorized attempt
      auditService.logActivity({
        userId: user.id,
        accountName: user.email || 'Staff Member',
        status: 'DENIED',
        eventType: 'ACCESS_DENIED',
      }).catch(() => {});

      return { granted: false, role: normalizedRole, reason };
    }

    return { granted: true, role: normalizedRole };
  }

  // =========================================================================
  // FIRESTORE MENUS COLLECTION (Restricted by RBAC)
  // =========================================================================

  /**
   * Reads menu items: Both MANAGER and STAFF have read access
   */
  public async getMenuItems(
    businessId: string, 
    user: { id: string; role?: string; email?: string }
  ): Promise<MenuItem[]> {
    const access = this.evaluateAccess(user, 'menus', 'read');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Cannot read menus');
    }

    try {
      // First query hierarchical subcollection: /businesses/{businessId}/menus
      let snapshot = await getDocs(collection(firestoreDb, 'businesses', businessId, 'menus'));
      if (snapshot.empty) {
        // Fallback query on root collection
        const q = query(
          collection(firestoreDb, 'menus'),
          where('business_id', '==', businessId)
        );
        snapshot = await getDocs(q);
      }
      const items: MenuItem[] = [];

      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const isAvailable = d.is_available ?? (d.status === 'available' || !d.status);
        const status = d.status || (isAvailable ? 'available' : 'unavailable');
        items.push({
          id: docSnap.id,
          business_id: d.business_id,
          name: d.name,
          category: d.category || 'General',
          category_id: d.category_id,
          price: d.price,
          currency: d.currency || 'Rs.',
          description: d.description || '',
          image_url: d.image_url || '',
          food_type: d.food_type || 'non-veg',
          variants: d.variants || [],
          has_variants: d.has_variants || false,
          variant_group_name: d.variant_group_name,
          additional_categories: d.additional_categories || [],
          show_image: d.show_image,
          promo_badge: d.promo_badge,
          display_style: d.display_style,
          status: status,
          is_available: status === 'available',
          preparation_time_mins: d.preparation_time_mins || 15,
          created_by: d.created_by || 'system',
          created_at: d.created_at ? new Date(d.created_at) : new Date(),
          updated_at: d.updated_at ? new Date(d.updated_at) : new Date(),
        });
      });

      return items;
    } catch (err: any) {
      console.warn('getMenuItems fallback:', err.message);
      return [];
    }
  }

  /**
   * Reads categories for the business
   */
  public async getCategories(
    businessId: string,
    user: { id: string; role?: string; email?: string }
  ): Promise<MenuCategory[]> {
    try {
      const snapshot = await getDocs(collection(firestoreDb, 'businesses', businessId, 'menu_categories'));
      const categories: MenuCategory[] = [];

      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        categories.push({
          id: docSnap.id,
          business_id: d.business_id,
          name: d.name,
          created_at: d.created_at ? new Date(d.created_at) : new Date(),
          updated_at: d.updated_at ? new Date(d.updated_at) : new Date(),
        });
      });

      return categories;
    } catch (err: any) {
      console.warn('getCategories fallback:', err.message);
      return [];
    }
  }

  /**
   * Creates a new menu category: Admin/Manager only
   */
  public async createCategory(
    businessId: string,
    data: { name: string },
    user: { id: string; role?: string; email?: string }
  ): Promise<MenuCategory> {
    const access = this.evaluateAccess(user, 'menus', 'create');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Manager role required to create categories.');
    }

    const catId = generateCategoryDocId(data.name.trim());
    const newCategory: MenuCategory = {
      id: catId,
      business_id: businessId,
      name: data.name.trim(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    const payload = {
      ...newCategory,
      created_at: newCategory.created_at.toISOString(),
      updated_at: newCategory.updated_at.toISOString(),
    };

    // Save directly to /businesses/{businessId}/menu_categories/{catId}
    await setDoc(doc(firestoreDb, 'businesses', businessId, 'menu_categories', newCategory.id), payload);

    return newCategory;
  }

  /**
   * Updates/renames a category: Admin/Manager only
   */
  public async updateCategory(
    businessId: string,
    categoryId: string,
    data: { name: string },
    user: { id: string; role?: string; email?: string }
  ): Promise<void> {
    const access = this.evaluateAccess(user, 'menus', 'update');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Manager role required to rename categories.');
    }

    const payload = {
      name: data.name.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      await updateDoc(doc(firestoreDb, 'businesses', businessId, 'menu_categories', categoryId), payload);
    } catch (e) {
      await setDoc(doc(firestoreDb, 'businesses', businessId, 'menu_categories', categoryId), payload, { merge: true });
    }
  }

  /**
   * Deletes a category: Admin/Manager only
   */
  public async deleteCategory(
    businessId: string,
    categoryId: string,
    user: { id: string; role?: string; email?: string }
  ): Promise<void> {
    const access = this.evaluateAccess(user, 'menus', 'delete');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Manager role required to delete categories.');
    }

    try {
      await deleteDoc(doc(firestoreDb, 'businesses', businessId, 'menu_categories', categoryId));
    } catch (e) {}
  }

  /**
   * Creates a menu item: ONLY Managers / Owners can create new menu items
   */
  public async createMenuItem(
    businessId: string,
    itemData: {
      name: string;
      category: string;
      category_id?: string;
      additional_categories?: string[];
      price: number;
      currency?: string;
      description?: string;
      image_url?: string;
      food_type?: FoodType;
      status?: MenuStatus;
      is_available?: boolean;
      has_variants?: boolean;
      variants?: MenuItemVariant[];
      display_style?: 'auto' | 'hero' | 'bento' | 'text_only';
      show_image?: boolean;
      promo_badge?: string;
      order_index?: number;
      preparation_time_mins?: number;
    },
    user: { id: string; role?: string; email?: string }
  ): Promise<MenuItem> {
    const access = this.evaluateAccess(user, 'menus', 'create');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Staff cannot create menu items. Manager role required.');
    }

    const itemStatus = itemData.status || (itemData.is_available === false ? 'unavailable' : 'available');
    const docId = generateMenuDocId(itemData.name.trim());

    const newItem: MenuItem = {
      id: docId,
      business_id: businessId,
      name: itemData.name.trim(),
      category: itemData.category.trim(),
      category_id: itemData.category_id,
      additional_categories: Array.isArray(itemData.additional_categories) ? itemData.additional_categories : [],
      price: Number(itemData.price),
      currency: itemData.currency || 'Rs.',
      description: itemData.description || '',
      image_url: itemData.image_url || '',
      food_type: itemData.food_type || 'non-veg',
      status: itemStatus,
      is_available: itemStatus === 'available',
      has_variants: Boolean(itemData.has_variants),
      variants: Array.isArray(itemData.variants) ? itemData.variants : undefined,
      display_style: itemData.display_style,
      show_image: itemData.show_image,
      promo_badge: itemData.promo_badge,
      order_index: itemData.order_index,
      preparation_time_mins: itemData.preparation_time_mins || 15,
      created_by: user.id,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const payload: any = {
      ...newItem,
      created_at: newItem.created_at.toISOString(),
      updated_at: newItem.updated_at.toISOString(),
      category_id: newItem.category_id || null,
    };
    // Remove any undefined properties to satisfy Firestore
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    // Save under /businesses/{businessId}/menus/{newItem.id}
    await setDoc(doc(firestoreDb, 'businesses', businessId, 'menus', newItem.id), payload);

    return newItem;
  }

  /**
   * Updates a menu item. Anyone who may open the Menu tab can update every field
   * (access is tab-based, there are no per-field role restrictions).
   */
  public async updateMenuItem(
    businessId: string,
    itemId: string,
    updates: Partial<MenuItem>,
    user: { id: string; role?: string; email?: string }
  ): Promise<void> {
    const access = this.evaluateAccess(user, 'menus', 'update');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Cannot update menu item');
    }

    const payload: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
    
    console.log('UPDATING MENU ITEM, variants incoming:', JSON.stringify(updates.variants, null, 2));

    if (updates.category_id === undefined && 'category_id' in updates) {
      payload.category_id = null;
    }

    if (updates.status) {
      payload.is_available = updates.status === 'available';
    } else if (updates.is_available !== undefined) {
      payload.status = updates.is_available ? 'available' : 'unavailable';
    }

    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    console.log('FINAL PAYLOAD TO FIRESTORE:', JSON.stringify(payload, null, 2));
    
    try {
      await updateDoc(doc(firestoreDb, 'businesses', businessId, 'menus', itemId), payload);
    } catch (e) {
      await setDoc(doc(firestoreDb, 'businesses', businessId, 'menus', itemId), payload, { merge: true });
    }
  }

  /**
   * Deletes a menu item: ONLY Manager / Admin can delete
   */
  public async deleteMenuItem(
    businessId: string,
    itemId: string,
    user: { id: string; role?: string; email?: string }
  ): Promise<void> {
    const access = this.evaluateAccess(user, 'menus', 'delete');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Staff role cannot delete menu items. Manager role required.');
    }

    try {
      await deleteDoc(doc(firestoreDb, 'businesses', businessId, 'menus', itemId));
    } catch (e) {}
  }

  // =========================================================================
  // FIRESTORE CHECK-INS COLLECTION (Restricted by RBAC)
  // =========================================================================

  /**
   * Reads check-ins:
   * Both Manager and Staff can view active and past check-ins
   */
  public async getCheckIns(
    businessId: string,
    user: { id: string; role?: string; email?: string },
    filters?: { status?: CheckInStatus }
  ): Promise<CheckIn[]> {
    const access = this.evaluateAccess(user, 'check_ins', 'read');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Cannot read check-ins');
    }

    try {
      let snapshot = await getDocs(collection(firestoreDb, 'businesses', businessId, 'check_ins'));
      if (snapshot.empty) {
        const q = query(
          collection(firestoreDb, 'check_ins'),
          where('business_id', '==', businessId)
        );
        snapshot = await getDocs(q);
      }
      const checkIns: CheckIn[] = [];

      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        if (!filters?.status || d.status === filters.status) {
          checkIns.push({
            id: docSnap.id,
            business_id: d.business_id,
            guest_name: d.guest_name,
            guest_phone: d.guest_phone || '',
            guest_email: d.guest_email || '',
            room_or_table_number: d.room_or_table_number,
            check_in_date: d.check_in_date ? new Date(d.check_in_date) : new Date(),
            check_out_date: d.check_out_date ? new Date(d.check_out_date) : null,
            status: d.status || 'CHECKED_IN',
            total_amount: d.total_amount || 0,
            deposit_paid: d.deposit_paid || 0,
            notes: d.notes || '',
            handled_by_user_id: d.handled_by_user_id || user.id,
            created_at: d.created_at ? new Date(d.created_at) : new Date(),
            updated_at: d.updated_at ? new Date(d.updated_at) : new Date(),
          });
        }
      });

      return checkIns;
    } catch (err: any) {
      console.warn('getCheckIns fallback:', err.message);
      return [];
    }
  }

  /**
   * Creates a check-in:
   * Both Manager and Staff (Front Desk/Waiter) can check in guests
   */
  public async createCheckIn(
    businessId: string,
    checkInData: {
      guest_name: string;
      guest_phone?: string;
      guest_email?: string;
      room_or_table_number: string;
      check_in_date?: Date;
      total_amount?: number;
      deposit_paid?: number;
      notes?: string;
    },
    user: { id: string; role?: string; email?: string }
  ): Promise<CheckIn> {
    const access = this.evaluateAccess(user, 'check_ins', 'create');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Cannot create check-in record');
    }

    const newCheckIn: CheckIn = {
      id: crypto.randomUUID(),
      business_id: businessId,
      guest_name: checkInData.guest_name.trim(),
      guest_phone: checkInData.guest_phone || '',
      guest_email: checkInData.guest_email || '',
      room_or_table_number: checkInData.room_or_table_number.trim(),
      check_in_date: checkInData.check_in_date || new Date(),
      check_out_date: null,
      status: 'CHECKED_IN',
      total_amount: checkInData.total_amount || 0,
      deposit_paid: checkInData.deposit_paid || 0,
      notes: checkInData.notes || '',
      handled_by_user_id: user.id,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const payload = {
      ...newCheckIn,
      check_in_date: newCheckIn.check_in_date.toISOString(),
      check_out_date: null,
      created_at: newCheckIn.created_at.toISOString(),
      updated_at: newCheckIn.updated_at.toISOString(),
    };

    await setDoc(doc(firestoreDb, 'businesses', businessId, 'check_ins', newCheckIn.id), payload);

    return newCheckIn;
  }

  /**
   * Updates a check-in status (e.g. marking CHECKED_OUT):
   * - Staff can mark check-out and update room notes
   * - Only Manager can override total billing amount or waive fees
   */
  public async updateCheckIn(
    businessId: string,
    checkInId: string,
    updates: Partial<CheckIn>,
    user: { id: string; role?: string; email?: string }
  ): Promise<void> {
    const access = this.evaluateAccess(user, 'check_ins', 'update');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Cannot update check-in record');
    }

    const payload: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (updates.check_in_date instanceof Date) {
      payload.check_in_date = updates.check_in_date.toISOString();
    }
    if (updates.check_out_date instanceof Date) {
      payload.check_out_date = updates.check_out_date.toISOString();
    }

    try {
      await updateDoc(doc(firestoreDb, 'businesses', businessId, 'check_ins', checkInId), payload);
    } catch (e) {
      await setDoc(doc(firestoreDb, 'businesses', businessId, 'check_ins', checkInId), payload, { merge: true });
    }
  }

  /**
   * Deletes a check-in record:
   * Strictly RESTRICTED to Manager/Admin to prevent accidental audit record deletion. Staff cannot delete.
   */
  public async deleteCheckIn(
    businessId: string,
    checkInId: string,
    user: { id: string; role?: string; email?: string }
  ): Promise<void> {
    const access = this.evaluateAccess(user, 'check_ins', 'delete');
    if (!access.granted) {
      throw new Error(access.reason || "Permission denied: Staff role cannot delete check-in records. Manager role required for record removal.");
    }

    try {
      await deleteDoc(doc(firestoreDb, 'businesses', businessId, 'check_ins', checkInId));
    } catch (e) {}
  }

  // =========================================================================
  // INITIAL SEED HELPERS
  // =========================================================================

  // =========================================================================
  // STAFF & TEAM GOVERNANCE (Restricted to Manager / Admin)
  // =========================================================================

  /**
   * Retrieves all staff & team accounts belonging to the business (requires the Staff tab).
   * Each member carries its effective `allowed_tabs` (owners always have every tab).
   */
  public async getTeamMembers(
    businessId: string,
    currentUser: StaffActor
  ) {
    const access = this.evaluateAccess(currentUser, 'staff', 'read');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Cannot view team directory');
    }

    const users = await db.findUsersByBusinessId(businessId);
    const members = [];
    for (const u of users) {
      // Lazily pin the derived tab list of pre-migration accounts so it becomes stable/editable.
      await db.ensureAllowedTabsPersisted(u);
      members.push({
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        last_login_at: u.last_login_at,
        created_at: u.created_at,
        allowed_tabs: getEffectiveTabs(u),
      });
    }
    return members;
  }

  /**
   * Shared validation of a requested tab list. Throws a user-facing error when the list is
   * malformed or empty. Returns the sanitized (canonical order, de-duplicated) list.
   */
  private validateRequestedTabs(requested: unknown): TabPermissionId[] {
    const invalid = findInvalidTabs(requested);
    if (invalid.length > 0) {
      throw new Error(`Invalid tab permission(s): ${invalid.map((v) => JSON.stringify(v)).join(', ')}`);
    }
    const clean = sanitizeTabs(requested);
    if (clean.length === 0) {
      throw new Error('At least one tab must be selected for a staff account.');
    }
    return clean;
  }

  /**
   * Anti-escalation rule for non-owner actors: they can only hand out tabs they hold
   * themselves, and never the Staff or Franchise tabs (those stay with the business owner).
   */
  private assertActorMayGrantTabs(actor: StaffActor, tabs: TabPermissionId[]): void {
    if (isOwnerSubject(actor)) return;
    const actorTabs = new Set(getEffectiveTabs(actor));
    for (const tab of tabs) {
      if (tab === 'team' || tab === 'franchise') {
        throw new Error(`Permission denied: Only the business owner can grant or revoke the '${tab}' tab.`);
      }
      if (!actorTabs.has(tab)) {
        throw new Error(`Permission denied: You cannot grant the '${tab}' tab because you do not have it yourself.`);
      }
    }
  }

  /**
   * Creates a new staff member account under the business.
   * `allowed_tabs` decides what the account can open. When omitted the tabs are derived from the
   * role label (transitional compatibility for callers that do not send tabs yet).
   */
  public async createStaffMember(
    businessId: string,
    staffData: {
      email: string;
      password: string;
      role: AppRole;
      allowed_tabs?: TabPermissionId[];
    },
    currentUser: StaffActor
  ) {
    const access = this.evaluateAccess(currentUser, 'staff', 'create');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Only accounts with the Staff tab can add new staff accounts.');
    }

    const actorIsOwner = isOwnerSubject(currentUser);
    const privilegedRole = isBusinessOwnerRole(staffData.role) || isManagerRole(staffData.role);
    if (privilegedRole && !actorIsOwner) {
      throw new Error('Permission denied: Only the business owner can create owner or manager accounts.');
    }

    let tabsToStore: TabPermissionId[] | undefined;
    if (isBusinessOwnerRole(staffData.role)) {
      tabsToStore = undefined; // owners always have every tab
    } else if (staffData.allowed_tabs !== undefined) {
      tabsToStore = this.validateRequestedTabs(staffData.allowed_tabs);
    } else {
      tabsToStore = deriveAllowedTabs(staffData.role);
    }
    if (tabsToStore) this.assertActorMayGrantTabs(currentUser, tabsToStore);

    // Check if user with email already exists
    const existing = await db.findUserByEmail(staffData.email);
    if (existing) {
      if (existing.business_id === businessId) {
        throw new Error(`A staff account with email ${staffData.email} already exists in your business.`);
      } else {
        throw new Error(`The email ${staffData.email} is already registered in the system. Staff emails must be globally unique across all businesses.`);
      }
    }

    const passwordHash = await bcrypt.hash(staffData.password, 10);
    const newUser = await db.createUser({
      business_id: businessId,
      email: staffData.email,
      password_hash: passwordHash,
      role: staffData.role as any,
      allowed_tabs: tabsToStore,
    });

    // Automatically activate staff created by an authorised account
    await db.updateUserStatus(newUser.id, 'ACTIVE');

    // Create verified phone record so staff can login via standard auth if needed
    const staffPhone = `+97798000${Math.floor(100000 + Math.random() * 900000)}`;
    await db.createPhoneVerification({
      user_id: newUser.id,
      phone_country_code: '+977',
      phone_number: staffPhone.slice(4),
      phone_e164: staffPhone,
    });
    await db.verifyPhone(staffPhone);

    auditService.logActivity({
      userId: currentUser.id,
      accountName: currentUser.email || 'Manager',
      status: 'SUCCESS',
      eventType: 'STAFF_ACCOUNT_CREATED',
      businessId,
    }).catch(() => {});

    return {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      status: 'ACTIVE',
      created_at: newUser.created_at,
      allowed_tabs: getEffectiveTabs(newUser),
    };
  }

  /**
   * Updates an existing staff member's role label and/or the tabs they can open.
   * When `allowedTabs` is omitted the target's current effective tabs are kept (and pinned), so
   * changing only the role label never silently changes access.
   */
  public async updateStaffRole(
    businessId: string,
    targetUserId: string,
    newRole: AppRole,
    currentUser: StaffActor,
    allowedTabs?: TabPermissionId[]
  ) {
    const access = this.evaluateAccess(currentUser, 'staff', 'update');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Only accounts with the Staff tab can modify staff access.');
    }

    const targetUser = await db.findUserById(targetUserId);
    if (!targetUser || targetUser.business_id !== businessId) {
      throw new Error('Staff member not found in this business.');
    }

    if (isBusinessOwnerRole(targetUser.role)) {
      throw new Error('Permission denied: Business owner accounts cannot be modified.');
    }

    const actorIsOwner = isOwnerSubject(currentUser);
    const touchesPrivileged =
      isManagerRole(targetUser.role) || isBusinessOwnerRole(newRole) || isManagerRole(newRole);
    if (touchesPrivileged && !actorIsOwner) {
      throw new Error('Permission denied: Only the business owner can modify or assign owner/manager accounts.');
    }

    const beforeTabs = getEffectiveTabs(targetUser);
    const afterTabs = allowedTabs !== undefined ? this.validateRequestedTabs(allowedTabs) : beforeTabs;

    if (allowedTabs !== undefined && !actorIsOwner) {
      const before = new Set(beforeTabs);
      const after = new Set(afterTabs);
      const changed = TAB_PERMISSION_IDS.filter((t) => before.has(t) !== after.has(t));
      this.assertActorMayGrantTabs(currentUser, changed);
    }

    if (targetUserId === currentUser.id && !afterTabs.includes('team')) {
      throw new Error('You cannot remove your own Staff tab access.');
    }

    await db.updateUserRoleAndPermissions(targetUserId, newRole as any, undefined, afterTabs);

    auditService.logActivity({
      userId: currentUser.id,
      accountName: currentUser.email || 'Manager',
      status: 'SUCCESS',
      eventType: 'ROLE_MODIFIED',
      businessId,
    }).catch(() => {});

    const added = afterTabs.filter((t) => !beforeTabs.includes(t));
    const removed = beforeTabs.filter((t) => !afterTabs.includes(t));
    if (added.length > 0 || removed.length > 0) {
      auditService.logActivity({
        userId: currentUser.id,
        accountName: currentUser.email || 'Manager',
        status: `TABS +[${added.join(',')}] -[${removed.join(',')}] target=${targetUserId}`,
        eventType: 'STAFF_TABS_MODIFIED',
        businessId,
      }).catch(() => {});
    }

    return { id: targetUserId, role: newRole, allowed_tabs: afterTabs };
  }

  /**
   * Deletes / removes a staff account
   */
  public async removeStaffMember(
    businessId: string,
    targetUserId: string,
    currentUser: StaffActor
  ) {
    const access = this.evaluateAccess(currentUser, 'staff', 'delete');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Only accounts with the Staff tab can remove staff accounts.');
    }

    if (targetUserId === currentUser.id) {
      throw new Error('You cannot delete your own active administrator account.');
    }

    const targetUser = await db.findUserById(targetUserId);
    if (!targetUser || targetUser.business_id !== businessId) {
      throw new Error('Staff member not found in this business.');
    }

    if ((isBusinessOwnerRole(targetUser.role) || isManagerRole(targetUser.role)) && !isOwnerSubject(currentUser)) {
      throw new Error('Permission denied: Only the business owner can remove owner or manager accounts.');
    }

    await db.deleteUser(targetUserId);

    auditService.logActivity({
      userId: currentUser.id,
      accountName: currentUser.email || 'Manager',
      status: 'SUCCESS',
      eventType: 'STAFF_ACCOUNT_DELETED',
      businessId,
    }).catch(() => {});
  }

  private async seedDefaultCategories(businessId: string): Promise<MenuCategory[]> {
    const categoryNames = ['Breakfast', 'Lunch', 'Dinner', 'Nepali', 'Chinese', 'Snacks', 'Desserts', 'Beverages'];
    const results: MenuCategory[] = [];
    for (const name of categoryNames) {
      const catId = generateCategoryDocId(name);
      const cat: MenuCategory = {
        id: catId,
        business_id: businessId,
        name,
        created_at: new Date(),
        updated_at: new Date(),
      };
      await setDoc(doc(firestoreDb, 'menu_categories', cat.id), {
        ...cat,
        created_at: cat.created_at.toISOString(),
        updated_at: cat.updated_at.toISOString(),
      });
      results.push(cat);
    }
    return results;
  }

  private async seedDefaultMenuItems(businessId: string, userId: string): Promise<MenuItem[]> {
    const defaults: Array<Omit<MenuItem, 'id' | 'business_id' | 'created_by' | 'created_at' | 'updated_at'>> = [
      { 
        name: 'Chicken Chow Mein', 
        category: 'Chinese', 
        price: 350, 
        currency: 'Rs.', 
        description: 'Stir-fried noodles with chicken, fresh bell peppers, shredded cabbage, and aromatic house seasoning.', 
        image_url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=800&q=80',
        food_type: 'non-veg',
        status: 'available',
        is_available: true, 
        preparation_time_mins: 15 
      },
      { 
        name: 'Steamed Buff Momos', 
        category: 'Nepali', 
        price: 280, 
        currency: 'Rs.', 
        description: 'Traditional juicy dumplings wrapped with seasoned spiced minced meat, served with spicy sesame-tomato dipping sauce.', 
        image_url: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=800&q=80',
        food_type: 'non-veg',
        status: 'available',
        is_available: true, 
        preparation_time_mins: 20 
      },
      { 
        name: 'Paneer Butter Masala', 
        category: 'Dinner', 
        price: 420, 
        currency: 'Rs.', 
        description: 'Cottage cheese cubes simmered in a velvety rich tomato, cashew nut, and butter gravy garnished with fresh coriander.', 
        image_url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=800&q=80',
        food_type: 'veg',
        status: 'available',
        is_available: true, 
        preparation_time_mins: 20 
      },
      { 
        name: 'Crispy Veg Spring Rolls', 
        category: 'Snacks', 
        price: 220, 
        currency: 'Rs.', 
        description: 'Golden fried crispy rolls stuffed with julienned vegetables and served with sweet chili dip.', 
        image_url: 'https://images.unsplash.com/photo-1548869206-93b036288d7e?auto=format&fit=crop&w=800&q=80',
        food_type: 'veg',
        status: 'available',
        is_available: true, 
        preparation_time_mins: 12 
      },
      { 
        name: 'Iced Himalayan Lemon Mint Tea', 
        category: 'Beverages', 
        price: 160, 
        currency: 'Rs.', 
        description: 'Refreshing organic black tea infused with fresh crushed garden mint leaves and squeezed mountain lemons.', 
        image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=800&q=80',
        food_type: 'veg',
        status: 'available',
        is_available: true, 
        preparation_time_mins: 5 
      },
      { 
        name: 'Warm Chocolate Lava Cake', 
        category: 'Desserts', 
        price: 320, 
        currency: 'Rs.', 
        description: 'Decadent dark chocolate molten cake with a warm flowing center, served with vanilla bean ice cream.', 
        image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80',
        food_type: 'veg',
        status: 'available',
        is_available: true, 
        preparation_time_mins: 15 
      }
    ];

    const results: MenuItem[] = [];
    for (const d of defaults) {
      const docId = generateMenuDocId(d.name);
      const item: MenuItem = {
        id: docId,
        business_id: businessId,
        name: d.name,
        category: d.category,
        price: d.price,
        currency: d.currency,
        description: d.description,
        image_url: d.image_url,
        food_type: d.food_type,
        status: d.status,
        is_available: d.is_available,
        preparation_time_mins: d.preparation_time_mins,
        created_by: userId,
        created_at: new Date(),
        updated_at: new Date(),
      };
      await setDoc(doc(firestoreDb, 'businesses', businessId, 'menus', item.id), {
        ...item,
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at.toISOString(),
      });
      try {
        await setDoc(doc(firestoreDb, 'menus', item.id), {
          ...item,
          created_at: item.created_at.toISOString(),
          updated_at: item.updated_at.toISOString(),
        });
      } catch (e) {}
      results.push(item);
    }
    return results;
  }

  private async seedDefaultCheckIns(businessId: string, userId: string): Promise<CheckIn[]> {
    const defaults: Array<Omit<CheckIn, 'id' | 'business_id' | 'handled_by_user_id' | 'created_at' | 'updated_at'>> = [
      { guest_name: 'Alexander Wright', guest_phone: '+14155550192', guest_email: 'alex.wright@example.com', room_or_table_number: 'Room 304 (Deluxe Suite)', check_in_date: new Date(), check_out_date: null, status: 'CHECKED_IN', total_amount: 450, deposit_paid: 100, notes: 'VIP Guest - Early breakfast requested' },
      { guest_name: 'Elena Rostova', guest_phone: '+14155550183', guest_email: 'elena.r@example.com', room_or_table_number: 'Table 12 (Garden Patio)', check_in_date: new Date(), check_out_date: null, status: 'CHECKED_IN', total_amount: 85, deposit_paid: 0, notes: 'Anniversary celebration' }
    ];

    const results: CheckIn[] = [];
    for (const d of defaults) {
      const docId = `${slugify(d.guest_name)}-${slugify(d.room_or_table_number)}`;
      const ci: CheckIn = {
        id: docId,
        business_id: businessId,
        guest_name: d.guest_name,
        guest_phone: d.guest_phone,
        guest_email: d.guest_email,
        room_or_table_number: d.room_or_table_number,
        check_in_date: d.check_in_date,
        check_out_date: d.check_out_date,
        status: d.status,
        total_amount: d.total_amount,
        deposit_paid: d.deposit_paid,
        notes: d.notes,
        handled_by_user_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
      };
      await setDoc(doc(firestoreDb, 'businesses', businessId, 'check_ins', ci.id), {
        ...ci,
        check_in_date: ci.check_in_date.toISOString(),
        check_out_date: null,
        created_at: ci.created_at.toISOString(),
        updated_at: ci.updated_at.toISOString(),
      });
      results.push(ci);
    }
    return results;
  }

  // =========================================================================
  // FIRESTORE TABLES & DIGITAL ORDERING
  // =========================================================================

  /**
   * Fetch all tables for a business
   */
  public async getTables(
    businessId: string,
    user?: { id: string; role?: string; email?: string }
  ): Promise<RestaurantTable[]> {
    try {
      const snapshot = await getDocs(collection(firestoreDb, 'businesses', businessId, 'tables'));
      const tables: RestaurantTable[] = [];

      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        tables.push({
          id: docSnap.id,
          business_id: d.business_id,
          table_number: d.table_number,
          floor: d.floor ?? null,
          building: d.building ?? null,
          capacity: d.capacity || 4,
          status: d.status || 'ACTIVE',
          pay_first_enabled: Boolean(d.pay_first_enabled),
          qr_code_url: d.qr_code_url || '',
          last_scanned_at: d.last_scanned_at ? new Date(d.last_scanned_at) : null,
          current_session_id: d.current_session_id || null,
          created_at: d.created_at ? new Date(d.created_at) : new Date(),
          updated_at: d.updated_at ? new Date(d.updated_at) : new Date(),
        });
      });

      // Sort naturally by table number / id
      tables.sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true, sensitivity: 'base' }));
      return tables;
    } catch (err: any) {
      console.warn('getTables fallback:', err.message);
      return [];
    }
  }

  /**
   * Create a new table (Owner / Admin / Manager)
   */
  public async createTable(
    businessId: string,
    tableData: {
      table_number: string;
      floor?: string | null;
      building?: string | null;
      capacity?: number;
      status?: TableStatus;
      pay_first_enabled?: boolean;
    },
    user: { id: string; role?: string; email?: string }
  ): Promise<RestaurantTable> {
    const access = this.evaluateAccess(user, 'tables', 'create');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Cannot create tables');
    }

    const tableId = `tbl-${slugify(tableData.table_number)}-${crypto.randomBytes(2).toString('hex')}`;
    const newTable: RestaurantTable = {
      id: tableId,
      business_id: businessId,
      table_number: tableData.table_number.trim(),
      floor: tableData.floor?.trim() || null,
      building: tableData.building?.trim() || null,
      capacity: Number(tableData.capacity) || 4,
      status: tableData.status || 'ACTIVE',
      pay_first_enabled: Boolean(tableData.pay_first_enabled),
      qr_code_url: `/menu?businessId=${encodeURIComponent(businessId)}&tableId=${encodeURIComponent(tableId)}&tableNumber=${encodeURIComponent(tableData.table_number.trim())}`,
      last_scanned_at: null,
      current_session_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const payload = {
      ...newTable,
      created_at: newTable.created_at.toISOString(),
      updated_at: newTable.updated_at.toISOString(),
      last_scanned_at: null,
    };

    await setDoc(doc(firestoreDb, 'businesses', businessId, 'tables', newTable.id), payload);

    auditService.log({
      userId: user.id,
      email: user.email,
      businessId,
      eventType: 'TABLE_CREATED',
      status: 'ONLINE',
    });

    return newTable;
  }

  /**
   * Update table details (table number, floor, building, capacity, status)
   */
  public async updateTable(
    businessId: string,
    tableId: string,
    updates: Partial<RestaurantTable>,
    user: { id: string; role?: string; email?: string }
  ): Promise<void> {
    const access = this.evaluateAccess(user, 'tables', 'update');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Cannot update table');
    }

    const payload: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (updates.table_number) {
      payload.table_number = updates.table_number.trim();
      payload.qr_code_url = `/menu?businessId=${encodeURIComponent(businessId)}&tableId=${encodeURIComponent(tableId)}&tableNumber=${encodeURIComponent(updates.table_number.trim())}`;
    }
    if (updates.floor !== undefined) payload.floor = updates.floor ? updates.floor.trim() : null;
    if (updates.building !== undefined) payload.building = updates.building ? updates.building.trim() : null;
    if (updates.capacity !== undefined) payload.capacity = Number(updates.capacity);

    try {
      await updateDoc(doc(firestoreDb, 'businesses', businessId, 'tables', tableId), payload);
    } catch (e) {
      await setDoc(doc(firestoreDb, 'businesses', businessId, 'tables', tableId), payload, { merge: true });
    }

    auditService.log({
      userId: user.id,
      email: user.email,
      businessId,
      eventType: 'TABLE_UPDATED',
      status: 'ONLINE',
    });
  }

  /**
   * Fast toggle status (ACTIVE, INACTIVE, OCCUPIED, RESERVED)
   */
  public async updateTableStatus(
    businessId: string,
    tableId: string,
    status: TableStatus,
    user: { id: string; role?: string; email?: string }
  ): Promise<void> {
    const access = this.evaluateAccess(user, 'tables', 'update');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Cannot update table status');
    }

    const payload = {
      status,
      updated_at: new Date().toISOString(),
    };

    try {
      await updateDoc(doc(firestoreDb, 'businesses', businessId, 'tables', tableId), payload);
    } catch (e) {
      await setDoc(doc(firestoreDb, 'businesses', businessId, 'tables', tableId), payload, { merge: true });
    }
  }

  /**
   * Reset a table to default settings (ACTIVE status, cleared session)
   * Called when a customer requests bill or pays bill
   */
  public async resetTableToDefault(
    businessId: string,
    tableId?: string,
    tableNumber?: string
  ): Promise<void> {
    const now = new Date();
    let targetDocRef = tableId ? doc(firestoreDb, 'businesses', businessId, 'tables', tableId) : null;

    if (!targetDocRef || !(await getDoc(targetDocRef)).exists()) {
      if (tableNumber) {
        const q = query(
          collection(firestoreDb, 'businesses', businessId, 'tables'),
          where('table_number', '==', tableNumber)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          targetDocRef = snap.docs[0].ref;
        }
      }
    }

    const payload = {
      status: 'ACTIVE',
      current_session_id: null,
      host_token: null,
      last_scanned_at: null,
      updated_at: now.toISOString(),
    };

    if (targetDocRef) {
      try {
        await updateDoc(targetDocRef, payload);
      } catch (e) {
        await setDoc(targetDocRef, payload, { merge: true });
      }
    } else if (tableId) {
      await setDoc(doc(firestoreDb, 'businesses', businessId, 'tables', tableId), payload, { merge: true });
    }

    // Complete and archive all open table orders for this table so a new session starts completely clean
    try {
      const ordersSnap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'table_orders'));
      const batchUpdates: Promise<any>[] = [];
      ordersSnap.forEach((oDoc) => {
        const od = oDoc.data();
        const matchesTable = (tableId && od.table_id === tableId) ||
                             (tableNumber && od.table_number === tableNumber);
        if (matchesTable && od.status !== 'COMPLETED' && od.status !== 'CANCELLED') {
          batchUpdates.push(
            updateDoc(oDoc.ref, {
              status: 'COMPLETED',
              bill_requested: false,
              settled: true,
              completed_at: now.toISOString(),
              updated_at: now.toISOString(),
            }).catch(() => {})
          );
        }
      });
      if (batchUpdates.length > 0) {
        await Promise.all(batchUpdates);
      }
    } catch (err) {
      console.warn('Error completing orders during table resetToDefault:', err);
    }

    auditService.log({
      userId: 'customer-bill',
      email: 'guest@serveflow.app',
      businessId,
      eventType: 'TABLE_STATUS_RESET_ACTIVE',
      status: 'ONLINE',
    });
  }

  /**
   * Delete a table (Manager / Owner / Admin only)
   */
  public async deleteTable(
    businessId: string,
    tableId: string,
    user: { id: string; role?: string; email?: string }
  ): Promise<void> {
    const access = this.evaluateAccess(user, 'tables', 'delete');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Cannot delete table');
    }

    try {
      await deleteDoc(doc(firestoreDb, 'businesses', businessId, 'tables', tableId));
    } catch (e) {}

    auditService.log({
      userId: user.id,
      email: user.email,
      businessId,
      eventType: 'TABLE_DELETED',
      status: 'ONLINE',
    });
  }

  /**
   * Reset/Clear table session manually (Manager / Staff)
   * Cancels any active guest session, resets status to ACTIVE, clears host_token & current_session_id
   */
  public async resetTableSession(
    businessId: string,
    tableId: string,
    user?: { id: string; role?: string; email?: string }
  ): Promise<RestaurantTable> {
    const now = new Date();
    let tableDocRef = doc(firestoreDb, 'businesses', businessId, 'tables', tableId);
    let snap = await getDoc(tableDocRef);

    if (!snap.exists()) {
      const q = query(
        collection(firestoreDb, 'businesses', businessId, 'tables'),
        where('table_number', '==', tableId)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        tableDocRef = querySnap.docs[0].ref;
        snap = querySnap.docs[0];
      } else {
        throw new Error(`Table ${tableId} not found`);
      }
    }

    const payload = {
      status: 'ACTIVE' as TableStatus,
      current_session_id: null,
      host_token: null,
      last_scanned_at: null,
      updated_at: now.toISOString(),
    };

    await updateDoc(tableDocRef, payload);

    const actualTableId = snap.id;
    const actualTableNumber = (snap.data() as any)?.table_number;

    // Conclude and archive all active orders for this table so they never bleed into future sessions
    try {
      const ordersSnap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'table_orders'));
      const batchUpdates: Promise<any>[] = [];
      ordersSnap.forEach((oDoc) => {
        const od = oDoc.data();
        const matchesTable = (actualTableId && od.table_id === actualTableId) ||
                             (actualTableNumber && od.table_number === actualTableNumber);
        if (matchesTable && od.status !== 'COMPLETED' && od.status !== 'CANCELLED') {
          batchUpdates.push(
            updateDoc(oDoc.ref, {
              status: 'COMPLETED',
              bill_requested: false,
              settled: true,
              completed_at: now.toISOString(),
              updated_at: now.toISOString(),
            }).catch(() => {})
          );
        }
      });
      if (batchUpdates.length > 0) {
        await Promise.all(batchUpdates);
      }
    } catch (err) {
      console.warn('Error completing orders during table session reset:', err);
    }

    auditService.log({
      userId: user?.id || 'manager',
      email: user?.email || 'manager@serveflow.app',
      businessId,
      eventType: 'TABLE_SESSION_CLEARED_BY_STAFF',
      status: 'ONLINE',
    });

    const updatedSnap = await getDoc(tableDocRef);
    const d = updatedSnap.data() as any;
    return {
      id: updatedSnap.id,
      business_id: d.business_id || businessId,
      table_number: d.table_number || 'Table',
      floor: d.floor ?? null,
      building: d.building ?? null,
      capacity: d.capacity || 4,
      status: d.status || 'ACTIVE',
          pay_first_enabled: Boolean(d.pay_first_enabled),
      qr_code_url: d.qr_code_url || '',
      last_scanned_at: null,
      current_session_id: null,
      host_token: null,
      created_at: d.created_at ? new Date(d.created_at) : now,
      updated_at: now,
    };
  }

  /**
   * Scan / Check-In from customer QR link
   * If table has an active session:
   *   - If scanning device provides matching existingHostToken, recognizes them as Host.
   *   - Otherwise, assigns View-Only mode (Guest), without ordering authority.
   * If table is available (new session):
   *   - Assigns this first scanning device as the Table Host with a unique host_token.
   */
  public async scanTableCheckIn(
    businessId: string,
    tableId: string,
    metadata?: { tableNumber?: string; customerName?: string; existingHostToken?: string }
  ): Promise<{ table: RestaurantTable; business: any; is_host: boolean; host_token: string | null; session_id: string }> {
    let tableDocRef = doc(firestoreDb, 'businesses', businessId, 'tables', tableId);
    let snap = await getDoc(tableDocRef);

    // If table doesn't exist yet, try finding by table_number or create on the fly
    if (!snap.exists() && metadata?.tableNumber) {
      const q = query(
        collection(firestoreDb, 'businesses', businessId, 'tables'),
        where('table_number', '==', metadata.tableNumber)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        tableDocRef = querySnap.docs[0].ref;
        snap = querySnap.docs[0];
      }
    }

    const now = new Date();
    let tableData: RestaurantTable;
    let isHost = false;
    let hostToken: string | null = null;
    let sessionId: string;

    if (snap.exists()) {
      const d = snap.data();
      const existingSessionId = d.current_session_id;
      const existingHostToken = d.host_token;
      const lastScannedMs = d.last_scanned_at ? new Date(d.last_scanned_at).getTime() : 0;
      const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
      const isSessionLive = d.status === 'OCCUPIED' && existingSessionId && (lastScannedMs > fourHoursAgo);

      // Check if there are actual active, unsettled orders on this table
      let hasActiveOrders = false;
      try {
        const ordersSnap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'table_orders'));
        ordersSnap.forEach((oDoc) => {
          const od = oDoc.data();
          const matchesTable = (od.table_id && od.table_id === snap.id) ||
                               (od.table_number && od.table_number === (d.table_number || metadata?.tableNumber));
          if (matchesTable && od.status !== 'COMPLETED' && od.status !== 'CANCELLED') {
            hasActiveOrders = true;
          }
        });
      } catch (e) {}

      const isSessionRecent = (Date.now() - lastScannedMs) < (15 * 60 * 1000); // 15 mins
      if (isSessionLive && (hasActiveOrders || isSessionRecent)) {
        // Active table session with food order underway or recently created!
        sessionId = existingSessionId;

        // Check if this scanner is the original host
        if (metadata?.existingHostToken && metadata.existingHostToken === existingHostToken) {
          isHost = true;
          hostToken = existingHostToken;
        } else {
          // Group member scanning: View-Only Guest mode!
          isHost = false;
          hostToken = null;
        }

        tableData = {
          id: snap.id,
          business_id: d.business_id || businessId,
          table_number: d.table_number || metadata?.tableNumber || 'Table',
          floor: d.floor ?? null,
          building: d.building ?? null,
          capacity: d.capacity || 4,
          status: 'OCCUPIED',
          qr_code_url: d.qr_code_url || '',
          last_scanned_at: d.last_scanned_at ? new Date(d.last_scanned_at) : now,
          current_session_id: sessionId,
          host_token: isHost ? hostToken : null, // Do not expose host token to guests
          created_at: d.created_at ? new Date(d.created_at) : now,
          updated_at: now,
        };
      } else {
        // Brand new session OR table had no active orders: First person becomes TABLE HOST!
        sessionId = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        hostToken = `host-${crypto.randomBytes(12).toString('hex')}`;
        isHost = true;

        // Archive any leftover uncompleted orders from previous session on this table
        try {
          const ordersSnap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'table_orders'));
          const batchUpdates: Promise<any>[] = [];
          ordersSnap.forEach((oDoc) => {
            const od = oDoc.data();
            const matchesTable = (od.table_id && od.table_id === snap.id) ||
                                 (od.table_number && od.table_number === (snap.data() as any)?.table_number);
            if (matchesTable && od.status !== 'COMPLETED' && od.status !== 'CANCELLED') {
              batchUpdates.push(
                updateDoc(oDoc.ref, {
                  status: 'COMPLETED',
                  bill_requested: false,
                  settled: true,
                  completed_at: now.toISOString(),
                  updated_at: now.toISOString(),
                }).catch(() => {})
              );
            }
          });
          if (batchUpdates.length > 0) {
            await Promise.all(batchUpdates);
          }
        } catch (e) {}

        tableData = {
          id: snap.id,
          business_id: d.business_id || businessId,
          table_number: d.table_number || metadata?.tableNumber || 'Table',
          floor: d.floor ?? null,
          building: d.building ?? null,
          capacity: d.capacity || 4,
          status: 'OCCUPIED',
          qr_code_url: d.qr_code_url || '',
          last_scanned_at: now,
          current_session_id: sessionId,
          host_token: hostToken,
          created_at: d.created_at ? new Date(d.created_at) : now,
          updated_at: now,
        };

        const updatePayload = {
          status: 'OCCUPIED',
          last_scanned_at: now.toISOString(),
          current_session_id: sessionId,
          host_token: hostToken,
          updated_at: now.toISOString(),
        };

        try {
          await updateDoc(doc(firestoreDb, 'businesses', businessId, 'tables', tableData.id), updatePayload);
        } catch (e) {}
      }
    } else {
      // Table doesn't exist yet: initialize table and designate scanner as HOST
      sessionId = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      hostToken = `host-${crypto.randomBytes(12).toString('hex')}`;
      isHost = true;

      tableData = {
        id: tableId,
        business_id: businessId,
        table_number: metadata?.tableNumber || 'Table 1',
        floor: null,
        building: null,
        capacity: 4,
        status: 'OCCUPIED',
        qr_code_url: `/menu?businessId=${encodeURIComponent(businessId)}&tableId=${encodeURIComponent(tableId)}&tableNumber=${encodeURIComponent(metadata?.tableNumber || 'Table 1')}`,
        last_scanned_at: now,
        current_session_id: sessionId,
        host_token: hostToken,
        created_at: now,
        updated_at: now,
      };

      const setPayload = {
        ...tableData,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        last_scanned_at: now.toISOString(),
      };

      await setDoc(doc(firestoreDb, 'businesses', businessId, 'tables', tableData.id), setPayload);
    }

    // Fetch business name
    const biz = await db.findBusinessById(businessId);

    // Also record checkin activity
    auditService.log({
      userId: `customer-${sessionId}`,
      email: isHost ? 'host@serveflow.app' : 'guest-viewer@serveflow.app',
      businessId,
      eventType: isHost ? 'QR_TABLE_SCANNED_HOST' : 'QR_TABLE_SCANNED_GUEST',
      status: 'ONLINE',
    });

    return { 
      table: tableData, 
      business: biz, 
      is_host: isHost, 
      host_token: hostToken, 
      session_id: sessionId 
    };
  }

  /**
   * Helper to categorize items as BAR or KITCHEN
   */
  private determineItemStation(item: { name?: string; category?: string; additional_categories?: string[]; station?: 'KITCHEN' | 'BAR' }): 'KITCHEN' | 'BAR' {
    if (item.station) return item.station;
    const DRINK_KEYWORDS = [
      'beverage', 'drink', 'beverages', 'drinks', 'bar', 'cocktail', 'cocktails',
      'mocktail', 'mocktails', 'juice', 'juices', 'shake', 'shakes', 'smoothie',
      'tea', 'coffee', 'espresso', 'cappuccino', 'latte', 'beer', 'wine', 'liquor',
      'whiskey', 'vodka', 'rum', 'gin', 'soda', 'lassi', 'water', 'cold drink'
    ];
    const combined = [
      item.name || '',
      item.category || '',
      ...(item.additional_categories || [])
    ].join(' ').toLowerCase();
    return DRINK_KEYWORDS.some((kw) => combined.includes(kw)) ? 'BAR' : 'KITCHEN';
  }

  /**
   * Create or update customer table order (Digital Ordering via Cart UI)
   * If customer hasn't settled/requested bill, re-ordering in the same session appends items and immediately updates the bill.
   */
  public async createTableOrder(
    businessId: string,
    orderData: {
      table_id: string;
      table_number: string;
      floor?: string | null;
      building?: string | null;
      items: TableOrderItem[];
      currency?: string;
      customer_name?: string;
      customer_phone?: string;
      order_notes?: string;
      existing_order_id?: string;
      host_token?: string;
      session_id?: string;
    }
  ): Promise<TableOrder> {
    if (!orderData.items || orderData.items.length === 0) {
      throw new Error('Cannot place an empty order. Please add at least 1 item.');
    }

    const now = new Date();

    // 1. Check if there is an active unsettled order for this table/session
    let existingDocSnap: any = null;
    let targetOrderId = orderData.existing_order_id;

    if (targetOrderId) {
      try {
        const existingRef = doc(firestoreDb, 'businesses', businessId, 'table_orders', targetOrderId);
        const snap = await getDoc(existingRef);
        if (snap.exists()) {
          const d = snap.data();
          if (!d.bill_requested && d.status !== 'COMPLETED' && d.status !== 'CANCELLED') {
            existingDocSnap = snap;
          }
        }
      } catch (e) {
        console.warn('Existing order ID lookup note:', e);
      }
    }

    // Fallback search: find active unsettled order for this table from the last 12 hours
    if (!existingDocSnap && (orderData.table_id || orderData.table_number)) {
      try {
        const snap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'table_orders'));
        const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
        for (const docSnap of snap.docs) {
          const d = docSnap.data();
          const createdAt = d.created_at ? new Date(d.created_at).getTime() : 0;
          const isSameTable = (orderData.table_id && d.table_id === orderData.table_id) ||
                              (orderData.table_number && d.table_number === orderData.table_number);
          if (
            isSameTable &&
            !d.bill_requested &&
            d.status !== 'COMPLETED' &&
            d.status !== 'CANCELLED' &&
            createdAt > twelveHoursAgo
          ) {
            existingDocSnap = docSnap;
            targetOrderId = docSnap.id;
            break;
          }
        }
      } catch (e) {
        console.warn('Active table order search note:', e);
      }
    }

    let tableDocData: any = null;

    // Session Security Enforcement: Validate table session is active and not settled/expired
    if (orderData.table_id && orderData.table_id !== 'walk-in' && orderData.table_id !== 'takeout') {
      try {
        let tableDocRef = doc(firestoreDb, 'businesses', businessId, 'tables', orderData.table_id);
        let tableSnap = await getDoc(tableDocRef);
        if (!tableSnap.exists() && orderData.table_number) {
          const tQ = query(
            collection(firestoreDb, 'businesses', businessId, 'tables'),
            where('table_number', '==', orderData.table_number)
          );
          const tSnap = await getDocs(tQ);
          if (!tSnap.empty) {
            tableSnap = tSnap.docs[0];
          }
        }

        if (tableSnap.exists()) {
          const tableData = tableSnap.data();
          tableDocData = tableData;

          // If table has been reset to ACTIVE (settled / paid / cleared) or current_session_id is null:
          // NEVER reuse an old order!
          if (tableData.status === 'ACTIVE' || !tableData.current_session_id) {
            existingDocSnap = null;
            targetOrderId = undefined;
          }
          if (tableData.pay_first_enabled) {
            existingDocSnap = null;
            targetOrderId = undefined;
          } else if (existingDocSnap) {
            const exData = existingDocSnap.data();
            // If the existing order's session_id doesn't match the current active session, do not reuse it
            if (exData.session_id && tableData.current_session_id && exData.session_id !== tableData.current_session_id) {
              existingDocSnap = null;
              targetOrderId = undefined;
            }
          }

          // If table session is older than 4 hours without active orders:
          if (tableData.last_scanned_at && !existingDocSnap) {
            const lastScannedMs = new Date(tableData.last_scanned_at).getTime();
            const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
            if (lastScannedMs < fourHoursAgo) {
              throw new Error('Table QR session has expired (timeout). Please scan the live QR code on your table.');
            }
          }
          // Validate Host ordering authority: Only the Table Host who first scanned can place orders
          if (tableData.host_token) {
            if (!orderData.host_token || orderData.host_token !== tableData.host_token) {
              throw new Error('Ordering authority required: Only the Table Host who first scanned the table QR code can place or modify orders. Other group members are in View-Only mode.');
            }
          }
        }
      } catch (err: any) {
        if (err.message && (err.message.includes('dining session') || err.message.includes('session has expired') || err.message.includes('Ordering authority required'))) {
          throw err;
        }
        console.warn('Table session verification note:', err);
      }
    }

    // Format incoming new items
    const newItems: TableOrderItem[] = orderData.items.map((item, idx) => ({
      ...item,
      item_key: item.item_key || `${item.item_id || 'dish'}_${now.getTime()}_${idx}`,
      station: item.station || this.determineItemStation(item),
      status: (tableDocData?.pay_first_enabled ? 'AWAITING_PAYMENT' : 'RECEIVED') as OrderStatus,
      ready_at: null,
      served_at: null,
      ordered_at: item.ordered_at || now.toISOString(),
    }));

    // If an existing unsettled order is found, APPEND new items & update bill immediately!
    if (existingDocSnap) {
      const existingData = existingDocSnap.data();
      const existingItems: TableOrderItem[] = (existingData.items || []).map((it: any, i: number) => ({
        ...it,
        item_key: it.item_key || `${it.item_id || 'dish'}_prev_${i}`,
        station: it.station || this.determineItemStation(it),
        status: it.status || 'RECEIVED',
        ordered_at: it.ordered_at || existingData.created_at || now.toISOString(),
      }));

      const combinedItems = [...existingItems, ...newItems];
      const activeCombinedItems = combinedItems.filter((item) => item.status !== 'CANCELLED');
      const itemsMenuTotal = activeCombinedItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
      const taxConfig = await this.getTaxConfig(businessId);
      const {
        subtotal: newSubtotal,
        taxAmount: calculatedTax,
        computedTaxes,
        totalAmount: preDiscountTotal,
      } = this.calculateOrderTaxBreakdown(itemsMenuTotal, taxConfig);
      const promoDiscount = this.resolveOrderPromoDiscount(preDiscountTotal, existingData, taxConfig);
      const newTotalAmount = Math.max(0, Math.round((preDiscountTotal - promoDiscount) * 100) / 100);

      // When new items arrive, kitchen & bar need to prepare them, so status transitions to RECEIVED or PREPARING
      const updatedStatus: OrderStatus = (existingData.status === 'READY' || existingData.status === 'SERVED')
        ? 'RECEIVED'
        : (existingData.status || 'RECEIVED');

      const combinedNotes = [existingData.order_notes, orderData.order_notes].filter(Boolean).join(' • ');

      let existingOrderNumber = existingData.order_number;
      if (!existingOrderNumber) {
        existingOrderNumber = await this.getNextSequenceNumber(businessId, 'order', undefined, 'ORD-0', taxConfig);
      }

      const updatedOrder: TableOrder = {
        id: existingDocSnap.id,
        order_number: existingOrderNumber,
        business_id: businessId,
        table_id: existingData.table_id || orderData.table_id || '',
        table_number: existingData.table_number || orderData.table_number || 'Table',
        floor: existingData.floor ?? orderData.floor ?? null,
        building: existingData.building ?? orderData.building ?? null,
        items: combinedItems,
        subtotal: newSubtotal,
        tax_amount: calculatedTax,
        taxes: computedTaxes,
        promo_code: existingData.promo_code || null,
        promo_discount: promoDiscount,
        total_amount: newTotalAmount,
        currency: existingData.currency || orderData.currency || 'Rs.',
        customer_name: existingData.customer_name || orderData.customer_name || 'Guest',
        customer_phone: existingData.customer_phone || orderData.customer_phone || '',
        order_notes: combinedNotes,
        status: updatedStatus,
        bill_requested: false,
        ready_at: null,
        served_at: null,
        created_at: existingData.created_at ? new Date(existingData.created_at) : now,
        updated_at: now,
      };

      await updateDoc(doc(firestoreDb, 'businesses', businessId, 'table_orders', existingDocSnap.id), {
        order_number: existingOrderNumber,
        items: combinedItems,
        subtotal: newSubtotal,
        tax_amount: calculatedTax,
        taxes: computedTaxes,
        promo_discount: promoDiscount,
        total_amount: newTotalAmount,
        order_notes: combinedNotes,
        status: updatedStatus,
        bill_requested: false,
        ready_at: null,
        updated_at: now.toISOString(),
      });

      // Keep table occupied
      try {
        await updateDoc(doc(firestoreDb, 'businesses', businessId, 'tables', updatedOrder.table_id), {
          status: 'OCCUPIED',
          updated_at: now.toISOString(),
        });
      } catch (e) {}

      auditService.log({
        userId: `order-${updatedOrder.customer_name}`,
        email: 'guest@serveflow.app',
        eventType: 'DIGITAL_ORDER_ITEMS_APPENDED',
        status: 'ONLINE',
      });

      return updatedOrder;
    }

    // Otherwise, create a brand new Table Order
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const itemsMenuTotal = newItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);

    const taxConfig = await this.getTaxConfig(businessId);
    const {
      subtotal,
      taxAmount,
      computedTaxes,
      totalAmount,
    } = this.calculateOrderTaxBreakdown(itemsMenuTotal, taxConfig);

    const orderNumber = await this.getNextSequenceNumber(businessId, 'order', undefined, 'ORD-0', taxConfig);

    const order: TableOrder = {
      id: orderId,
      order_number: orderNumber,
      business_id: businessId,
      table_id: orderData.table_id || '',
      table_number: orderData.table_number || 'Table',
      floor: orderData.floor ?? null,
      building: orderData.building ?? null,
      items: newItems,
      subtotal,
      tax_amount: taxAmount,
      taxes: computedTaxes,
      total_amount: totalAmount,
      currency: orderData.currency || 'Rs.',
      customer_name: orderData.customer_name || 'Guest',
      customer_phone: orderData.customer_phone || '',
      order_notes: orderData.order_notes || '',
      status: tableDocData?.pay_first_enabled ? 'AWAITING_PAYMENT' : 'RECEIVED',
      pay_first: Boolean(tableDocData?.pay_first_enabled),
      payment_status: tableDocData?.pay_first_enabled ? 'UNPAID' : null,
      session_id: orderData.session_id || (tableDocData?.current_session_id || null),
      created_at: now,
      updated_at: now,
    };

    const payload = {
      ...order,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    await setDoc(doc(firestoreDb, 'businesses', businessId, 'table_orders', order.id), payload);

    // Make sure the table remains OCCUPIED
    try {
      await updateDoc(doc(firestoreDb, 'businesses', businessId, 'tables', order.table_id), {
        status: 'OCCUPIED',
        updated_at: now.toISOString(),
      });
    } catch (e) {}

    auditService.log({
      userId: `order-${order.customer_name}`,
      email: 'guest@serveflow.app',
      eventType: 'DIGITAL_ORDER_PLACED',
      status: 'ONLINE',
    });

    return order;
  }

  /**
   * Get table orders
   * Note: Automatically purges orders older than 24 hours from Firebase to avoid data buildup
   */
  public async getTableOrders(
    businessId: string,
    user: { id: string; role?: string; email?: string },
    tableId?: string
  ): Promise<TableOrder[]> {
    try {
      const snapshot = await getDocs(collection(firestoreDb, 'businesses', businessId, 'table_orders'));
      let orders: TableOrder[] = [];
      const now = Date.now();
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
      const staleDocsToDelete: Promise<any>[] = [];

      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const createdAt = d.created_at ? new Date(d.created_at).getTime() : 0;

        // Auto-purge items from Firebase if older than 24 hours
        if (createdAt > 0 && createdAt < twentyFourHoursAgo) {
          staleDocsToDelete.push(deleteDoc(docSnap.ref).catch(() => {}));
          return;
        }

        if (!tableId || d.table_id === tableId) {
          orders.push({
            id: docSnap.id,
            business_id: d.business_id,
            table_id: d.table_id,
            table_number: d.table_number,
            floor: d.floor ?? null,
            building: d.building ?? null,
            items: d.items || [],
            subtotal: d.subtotal || 0,
            tax_amount: d.tax_amount || 0,
            total_amount: d.total_amount || 0,
            currency: d.currency || 'Rs.',
            customer_name: d.customer_name || 'Guest',
            customer_phone: d.customer_phone || '',
            order_notes: d.order_notes || '',
            status: d.status || 'RECEIVED',
          pay_first: Boolean(d.pay_first),
          payment_confirmed_at: d.payment_confirmed_at || null,
          payment_confirmed_by: d.payment_confirmed_by || null,
          sale_id: d.sale_id || null,
          payment_rejected_reason: d.payment_rejected_reason || null,
            bill_requested: d.bill_requested || false,
            bill_requested_at: d.bill_requested_at || null,
            payment_method: d.payment_method || null,
            payment_status: d.payment_status || null,
            promo_code: d.promo_code || null,
            promo_discount: d.promo_discount || 0,
            taxes: d.taxes || [],
            ready_at: d.ready_at ? new Date(d.ready_at) : null,
            served_at: d.served_at ? new Date(d.served_at) : null,
            created_at: d.created_at ? new Date(d.created_at) : new Date(),
            updated_at: d.updated_at ? new Date(d.updated_at) : new Date(),
          });
        }
      });

      // Cleanup stale documents in background without blocking
      if (staleDocsToDelete.length > 0) {
        Promise.all(staleDocsToDelete).catch(() => {});
      }

      // Sort newest first
      orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return orders;
    } catch (err: any) {
      console.warn('getTableOrders fallback:', err.message);
      return [];
    }
  }

  /**
   * Update table order status (RECEIVED -> PREPARING -> READY -> SERVED -> COMPLETED / CANCELLED)
   */
  public async updateTableOrderStatus(
    businessId: string,
    orderId: string,
    status: OrderStatus,
    user?: { id: string; role?: string; email?: string }
  ): Promise<TableOrder> {
    const orderRef = doc(firestoreDb, 'businesses', businessId, 'table_orders', orderId);
    const orderDoc = await getDoc(orderRef);
    if (!orderDoc.exists()) {
      throw new Error(`Order ${orderId} not found.`);
    }
    const currentData = orderDoc.data();
    if (currentData.pay_first && currentData.payment_status === 'UNPAID' && status !== 'CANCELLED') {
      throw new Error('Use the confirm-payment endpoint to process this order.');
    }

    const now = new Date();
    const updates: Record<string, any> = {
      status,
      updated_at: now.toISOString(),
    };

    if (status === 'READY' && !currentData.ready_at) {
      updates.ready_at = now.toISOString();
    }
    if (status === 'SERVED' && !currentData.served_at) {
      updates.served_at = now.toISOString();
    }
    // Auto-complete pay-first orders when served
    if (status === 'SERVED' && currentData.pay_first) {
      status = 'COMPLETED' as any;
      updates.status = 'COMPLETED';
      updates.completed_at = now.toISOString();
    }

    // If the whole order is marked READY or SERVED, keep line-items in sync
    const items = (currentData.items || []).map((it: any) => {
      if (status === 'READY' && it.status !== 'SERVED') {
        return { ...it, status: 'READY', ready_at: it.ready_at || now.toISOString() };
      }
      if (status === 'SERVED') {
        return { ...it, status: 'SERVED', served_at: it.served_at || now.toISOString() };
      }
      return it;
    });
    updates.items = items;

    await updateDoc(orderRef, updates);

    // Reset table session if a pay_first order was completed
    if (status === 'COMPLETED' && currentData.pay_first && currentData.table_id) {
        try {
            const tableRef = doc(firestoreDb, 'businesses', businessId, 'tables', currentData.table_id);
            await updateDoc(tableRef, {
                status: 'ACTIVE',
                current_session_id: null,
                host_token: null,
                last_scanned_at: null,
                updated_at: now.toISOString(),
            });
        } catch (e) {}
    }

    auditService.log({
      userId: user?.id || 'staff',
      email: user?.email || 'staff@serveflow.app',
      businessId,
      eventType: 'ORDER_STATUS_UPDATED',
      status: `STATUS_${status}`,
    });

    const updatedDoc = await getDoc(orderRef);
    const d = updatedDoc.data()!;
    return {
      id: updatedDoc.id,
      business_id: d.business_id,
      table_id: d.table_id,
      table_number: d.table_number,
      floor: d.floor ?? null,
      building: d.building ?? null,
      items: d.items || [],
      subtotal: d.subtotal || 0,
      tax_amount: d.tax_amount || 0,
      total_amount: d.total_amount || 0,
      currency: d.currency || 'Rs.',
      customer_name: d.customer_name || 'Guest',
      customer_phone: d.customer_phone || '',
      order_notes: d.order_notes || '',
      status: d.status || status,
      ready_at: d.ready_at ? new Date(d.ready_at) : null,
      served_at: d.served_at ? new Date(d.served_at) : null,
      created_at: d.created_at ? new Date(d.created_at) : now,
      updated_at: d.updated_at ? new Date(d.updated_at) : now,
    };
  }

  /**
   * Update individual item preparation status in an order
   * Used by Kitchen Station & Bar Station to mark individual dishes/drinks as ready to be served!
   */
  public async updateTableOrderItemStatus(
    businessId: string,
    orderId: string,
    itemIdentifier: { index?: number; itemKey?: string; itemId?: string },
    newStatus: OrderStatus,
    user?: { id: string; role?: string; email?: string }
  ): Promise<TableOrder> {
    const orderRef = doc(firestoreDb, 'businesses', businessId, 'table_orders', orderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
      throw new Error(`Order ${orderId} not found.`);
    }

    const currentData = orderDoc.data();
    const items: TableOrderItem[] = (currentData.items || []).map((it: any, i: number) => ({
      ...it,
      item_key: it.item_key || `${it.item_id || 'item'}_${i}`,
      station: it.station || this.determineItemStation(it),
      status: it.status || 'RECEIVED',
    }));

    let targetIdx = -1;
    if (typeof itemIdentifier.index === 'number' && itemIdentifier.index >= 0 && itemIdentifier.index < items.length) {
      targetIdx = itemIdentifier.index;
    } else if (itemIdentifier.itemKey) {
      targetIdx = items.findIndex((it) => it.item_key === itemIdentifier.itemKey);
    } else if (itemIdentifier.itemId) {
      targetIdx = items.findIndex((it) => it.item_id === itemIdentifier.itemId);
    }

    if (targetIdx === -1) {
      throw new Error(`Item not found in order ${orderId}`);
    }

    const now = new Date();
    const targetItem = items[targetIdx];
    targetItem.status = newStatus;
    if (newStatus === 'READY') {
      targetItem.ready_at = now.toISOString();
    }
    if (newStatus === 'SERVED') {
      targetItem.served_at = now.toISOString();
    }
    if (newStatus === 'CANCELLED') {
      targetItem.cancelled_at = now.toISOString();
    }

    // Determine overall order status and amounts based on active (non-cancelled) items
    const activeItems = items.filter((it) => it.status !== 'CANCELLED');
    const itemsMenuTotal = activeItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
    const taxConfig = await this.getTaxConfig(businessId);
    const {
      subtotal: newSubtotal,
      taxAmount: newTax,
      computedTaxes,
      totalAmount: preDiscountTotal,
    } = this.calculateOrderTaxBreakdown(itemsMenuTotal, taxConfig);
    const promoDiscount = this.resolveOrderPromoDiscount(preDiscountTotal, currentData, taxConfig);
    const newTotal = Math.max(0, Math.round((preDiscountTotal - promoDiscount) * 100) / 100);

    let nextOrderStatus: OrderStatus = currentData.status;
    if (activeItems.length === 0) {
      nextOrderStatus = 'CANCELLED';
    } else {
      const allServed = activeItems.length > 0 && activeItems.every((it) => it.status === 'SERVED');
      const allReadyOrServed = activeItems.length > 0 && activeItems.every((it) => it.status === 'READY' || it.status === 'SERVED');
      const anyReady = activeItems.some((it) => it.status === 'READY');
      const anyPreparing = activeItems.some((it) => it.status === 'PREPARING');

      if (allServed) {
        nextOrderStatus = 'SERVED';
      } else if (allReadyOrServed) {
        nextOrderStatus = 'READY';
      } else if (anyReady || anyPreparing) {
        nextOrderStatus = 'PREPARING';
      } else {
        nextOrderStatus = 'RECEIVED';
      }
    }

    const updates: Record<string, any> = {
      items,
      status: nextOrderStatus,
      subtotal: newSubtotal,
      tax_amount: newTax,
      taxes: computedTaxes,
      promo_discount: promoDiscount,
      total_amount: newTotal,
      updated_at: now.toISOString(),
    };
    if (nextOrderStatus === 'READY' && !currentData.ready_at) {
      updates.ready_at = now.toISOString();
    }
    if (nextOrderStatus === 'SERVED' && !currentData.served_at) {
      updates.served_at = now.toISOString();
    }

    await updateDoc(orderRef, updates);

    // If order was cancelled completely, check if table can be marked AVAILABLE
    if (nextOrderStatus === 'CANCELLED' && currentData.table_id) {
      try {
        const tableRef = doc(firestoreDb, 'businesses', businessId, 'tables', currentData.table_id);
        await updateDoc(tableRef, { status: 'AVAILABLE', updated_at: now.toISOString() });
      } catch (e) {
        console.warn('Table status update on order cancellation note:', e);
      }
    }

    auditService.log({
      userId: user?.id || 'staff',
      email: user?.email || 'staff@serveflow.app',
      businessId,
      eventType: 'ORDER_ITEM_STATUS_UPDATED',
      status: `ITEM_${targetItem.name}_${newStatus}`,
    });

    const updatedDoc = await getDoc(orderRef);
    const d = updatedDoc.data()!;
    return {
      id: updatedDoc.id,
      business_id: d.business_id,
      table_id: d.table_id,
      table_number: d.table_number,
      floor: d.floor ?? null,
      building: d.building ?? null,
      items: d.items || [],
      subtotal: d.subtotal || 0,
      tax_amount: d.tax_amount || 0,
      taxes: d.taxes || [],
      total_amount: d.total_amount || 0,
      currency: d.currency || 'Rs.',
      customer_name: d.customer_name || 'Guest',
      customer_phone: d.customer_phone || '',
      order_notes: d.order_notes || '',
      status: d.status || 'RECEIVED',
          pay_first: Boolean(d.pay_first),
          payment_confirmed_at: d.payment_confirmed_at || null,
          payment_confirmed_by: d.payment_confirmed_by || null,
          sale_id: d.sale_id || null,
          payment_rejected_reason: d.payment_rejected_reason || null,
      ready_at: d.ready_at ? new Date(d.ready_at) : null,
      served_at: d.served_at ? new Date(d.served_at) : null,
      created_at: d.created_at ? new Date(d.created_at) : new Date(),
      updated_at: d.updated_at ? new Date(d.updated_at) : new Date(),
    };
  }

  /**
   * Seed default tables for a business
   */
  public async seedDefaultTables(businessId: string): Promise<RestaurantTable[]> {
    const defaults: Array<Omit<RestaurantTable, 'id' | 'business_id' | 'created_at' | 'updated_at' | 'qr_code_url' | 'last_scanned_at' | 'current_session_id'>> = [
      { table_number: 'Table 1', floor: 'Ground Floor', building: 'Main Hall', capacity: 4, status: 'ACTIVE' },
      { table_number: 'Table 2', floor: 'Ground Floor', building: 'Main Hall', capacity: 2, status: 'ACTIVE' },
      { table_number: 'Table 3', floor: 'Ground Floor', building: 'Main Hall', capacity: 6, status: 'OCCUPIED' },
      { table_number: 'Table 4 (VIP)', floor: '1st Floor', building: 'Terrace & Lounge', capacity: 8, status: 'ACTIVE' },
      { table_number: 'Table 5', floor: '1st Floor', building: 'Terrace & Lounge', capacity: 4, status: 'ACTIVE' },
      { table_number: 'Table 6 (Patio)', floor: 'Ground Floor', building: 'Garden Courtyard', capacity: 4, status: 'ACTIVE' },
      { table_number: 'Table 7 (Poolside)', floor: null, building: 'Poolside Cabana', capacity: 6, status: 'ACTIVE' },
      { table_number: 'Table 8', floor: null, building: null, capacity: 2, status: 'INACTIVE' },
    ];

    const results: RestaurantTable[] = [];
    const now = new Date();

    for (let i = 0; i < defaults.length; i++) {
      const d = defaults[i];
      const tableId = `tbl-${slugify(d.table_number)}-${i + 1}`;
      const t: RestaurantTable = {
        id: tableId,
        business_id: businessId,
        table_number: d.table_number,
        floor: d.floor,
        building: d.building,
        capacity: d.capacity,
        status: d.status,
        qr_code_url: `/menu?businessId=${encodeURIComponent(businessId)}&tableId=${encodeURIComponent(tableId)}&tableNumber=${encodeURIComponent(d.table_number)}`,
        last_scanned_at: null,
        current_session_id: null,
        created_at: now,
        updated_at: now,
      };

      const payload = {
        ...t,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        last_scanned_at: null,
      };

      try {
        await setDoc(doc(firestoreDb, 'businesses', businessId, 'tables', t.id), payload);
      } catch (e) {
        // Ignored
      }
      results.push(t);
    }

    return results;
  }

  /**
   * Calculate order subtotal, tax breakdown, and pre-discount grand total from menu item sum
   * Supports both Exclusive of VAT% and Inclusive of VAT% modes.
   */
  public calculateOrderTaxBreakdown(
    itemsMenuTotal: number,
    taxConfig?: BusinessTaxConfig | null
  ): {
    subtotal: number;
    taxAmount: number;
    computedTaxes: any[];
    totalAmount: number;
    isInclusive: boolean;
  } {
    const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    const rawTotal = Math.max(0, round2(itemsMenuTotal));
    const taxEnabled = taxConfig ? taxConfig.tax_enabled !== false : true;
    const isInclusive = Boolean(
      taxConfig?.tax_inclusive ??
        (Array.isArray(taxConfig?.rates) && taxConfig!.rates.some((r) => r.enabled && r.is_inclusive))
    );

    const enabledRates: Array<{ id?: string; name: string; rate_percent: number }> = [];
    if (taxEnabled) {
      if (taxConfig && Array.isArray(taxConfig.rates) && taxConfig.rates.length > 0) {
        taxConfig.rates.forEach((r) => {
          if (!r.enabled) return;
          const pct = Number(r.rate_percent) || 0;
          if (pct > 0) {
            enabledRates.push({ id: r.id, name: r.name, rate_percent: pct });
          }
        });
      } else if (!taxConfig) {
        enabledRates.push({ id: 'vat', name: 'VAT', rate_percent: 13 });
      }
    }

    const totalRatePercent = enabledRates.reduce((acc, r) => acc + r.rate_percent, 0);

    if (!taxEnabled || totalRatePercent <= 0) {
      return {
        subtotal: rawTotal,
        taxAmount: 0,
        computedTaxes: [],
        totalAmount: rawTotal,
        isInclusive,
      };
    }

    if (isInclusive) {
      const totalAmount = rawTotal;
      const subtotal = round2(totalAmount / (1 + totalRatePercent / 100));
      const targetTax = round2(totalAmount - subtotal);
      const computedTaxes = enabledRates.map((r) => ({
        id: r.id,
        name: r.name,
        rate_percent: r.rate_percent,
        amount: round2((subtotal * r.rate_percent) / 100),
        is_inclusive: true,
      }));
      const sumTaxes = round2(computedTaxes.reduce((s, t) => s + t.amount, 0));
      const diff = round2(targetTax - sumTaxes);
      if (diff !== 0 && computedTaxes.length > 0) {
        computedTaxes[0].amount = round2(Math.max(0, computedTaxes[0].amount + diff));
      }
      return {
        subtotal,
        taxAmount: targetTax,
        computedTaxes,
        totalAmount,
        isInclusive: true,
      };
    } else {
      const subtotal = rawTotal;
      const computedTaxes = enabledRates.map((r) => ({
        id: r.id,
        name: r.name,
        rate_percent: r.rate_percent,
        amount: round2((subtotal * r.rate_percent) / 100),
        is_inclusive: false,
      }));
      const taxAmount = round2(computedTaxes.reduce((s, t) => s + t.amount, 0));
      const totalAmount = round2(subtotal + taxAmount);
      return {
        subtotal,
        taxAmount,
        computedTaxes,
        totalAmount,
        isInclusive: false,
      };
    }
  }

  /**
   * Resolve promo discount against pre-discount Grand Total (never combined with VAT)
   */
  public resolveOrderPromoDiscount(
    preDiscountTotal: number,
    orderData: { promo_code?: string | null; promo_discount?: number | null; promo_discount_percent?: number | null },
    taxConfig?: BusinessTaxConfig | null
  ): number {
    const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    const code = (orderData?.promo_code || '').trim().toUpperCase();
    let pct = Number(orderData?.promo_discount_percent) || 0;
    if (!pct && code) {
      if (
        taxConfig?.active_promo_enabled !== false &&
        taxConfig?.active_promo_code &&
        code === taxConfig.active_promo_code.trim().toUpperCase()
      ) {
        pct = Number(taxConfig.active_promo_percent) || 10;
      } else if (code === 'WELCOME10') {
        pct = 10;
      } else if (code === 'VIP20') {
        pct = 20;
      }
    }
    if (pct > 0) {
      return Math.min(preDiscountTotal, round2((preDiscountTotal * pct) / 100));
    }
    const flat = Math.max(0, round2(Number(orderData?.promo_discount) || 0));
    return Math.min(preDiscountTotal, flat);
  }

  /**
   * Get business tax configuration
   */
  public async getTaxConfig(businessId: string): Promise<BusinessTaxConfig> {
    try {
      const configRef = doc(firestoreDb, 'businesses', businessId, 'tax_settings', 'default');
      const snap = await getDoc(configRef);
      if (snap.exists()) {
        const d = snap.data();
        const isInclusive = Boolean(
          d.tax_inclusive ?? (Array.isArray(d.rates) && d.rates.some((r: any) => r.is_inclusive))
        );
        return {
          ...d,
          business_id: businessId,
          tax_enabled: d.tax_enabled ?? true,
          tax_inclusive: isInclusive,
          currency: d.currency || 'Rs.',
          currency_symbol: d.currency_symbol || 'Rs.',
          rates: d.rates || [
            {
              id: 'vat',
              name: 'VAT',
              rate_percent: 13,
              enabled: true,
              is_inclusive: isInclusive,
              description: 'Value Added Tax (13%)',
            },
            {
              id: 'service_charge',
              name: 'Service Charge',
              rate_percent: 10,
              enabled: false,
              is_inclusive: isInclusive,
              description: 'Hospitality Service Charge (10%)',
            },
          ],
          invoice_prefix: d.invoice_prefix || 'INV-',
          receipt_footer_note: d.receipt_footer_note || 'Thank you for your visit! Please dine with us again.',
          pan_vat_number: d.pan_vat_number || '',
          order_reset_interval: d.order_reset_interval || 'MANUAL',
          last_order_reset_date: d.last_order_reset_date || null,
          updated_at: d.updated_at || new Date().toISOString(),
        };
      }
    } catch (e) {
      console.warn('getTaxConfig note:', e);
    }

    // Default configuration for business
    return {
      business_id: businessId,
      tax_enabled: true,
      tax_inclusive: false,
      currency: 'Rs.',
      currency_symbol: 'Rs.',
      rates: [
        {
          id: 'vat',
          name: 'VAT',
          rate_percent: 13,
          enabled: true,
          is_inclusive: false,
          description: 'Value Added Tax (13%)',
        },
        {
          id: 'service_charge',
          name: 'Service Charge',
          rate_percent: 10,
          enabled: false,
          is_inclusive: false,
          description: 'Hospitality Service Charge (10%)',
        },
      ],
      invoice_prefix: 'INV-',
      receipt_footer_note: 'Thank you for your visit! Please dine with us again.',
      pan_vat_number: '',
      order_reset_interval: 'MANUAL',
      last_order_reset_date: null,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Update business tax configuration
   */
  public async updateTaxConfig(
    businessId: string,
    config: Partial<BusinessTaxConfig>,
    user?: any
  ): Promise<BusinessTaxConfig> {
    const existing = await this.getTaxConfig(businessId);
    const resolvedInclusive =
      config.tax_inclusive !== undefined
        ? Boolean(config.tax_inclusive)
        : Boolean(
            existing.tax_inclusive ??
              (Array.isArray(config.rates || existing.rates) &&
                (config.rates || existing.rates).some((r) => r.is_inclusive))
          );
    const syncedRates = (config.rates || existing.rates || []).map((r) => ({
      ...r,
      is_inclusive: resolvedInclusive,
    }));
    const updated: BusinessTaxConfig = {
      ...existing,
      ...config,
      tax_inclusive: resolvedInclusive,
      rates: syncedRates,
      business_id: businessId,
      updated_at: new Date().toISOString(),
    };

    const configRef = doc(firestoreDb, 'businesses', businessId, 'tax_settings', 'default');
    await setDoc(configRef, updated);

    // Recalculate active unsettled table orders so live bills reflect the updated tax mode/rates
    try {
      const ordersSnap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'table_orders'));
      const orderUpdates: Promise<any>[] = [];
      ordersSnap.forEach((oDoc) => {
        const od = oDoc.data();
        if (od.status !== 'COMPLETED' && od.status !== 'CANCELLED' && !od.settled && od.payment_status !== 'PAID') {
          const activeItems = (od.items || []).filter((it: any) => it.status !== 'CANCELLED');
          const itemsMenuTotal = activeItems.reduce(
            (sum: number, it: any) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
            0
          );
          const {
            subtotal: newSubtotal,
            taxAmount: newTax,
            computedTaxes,
            totalAmount: preDiscountTotal,
          } = this.calculateOrderTaxBreakdown(itemsMenuTotal, updated);
          const promoDiscount = this.resolveOrderPromoDiscount(preDiscountTotal, od, updated);
          const newTotal = Math.max(0, Math.round((preDiscountTotal - promoDiscount) * 100) / 100);
          orderUpdates.push(
            updateDoc(oDoc.ref, {
              subtotal: newSubtotal,
              tax_amount: newTax,
              taxes: computedTaxes,
              promo_discount: promoDiscount,
              total_amount: newTotal,
              updated_at: new Date().toISOString(),
            }).catch(() => {})
          );
        }
      });
      if (orderUpdates.length > 0) {
        await Promise.all(orderUpdates);
      }
    } catch (e) {
      // Non-fatal
    }

    auditService.log({
      userId: user?.id || 'admin',
      email: user?.email || 'admin@serveflow.app',
      businessId,
      eventType: 'TAX_CONFIG_UPDATED',
      status: updated.tax_enabled ? 'TAX_ENABLED' : 'TAX_DISABLED',
    });

    return updated;
  }

  /**
   * Standard General Ledger (GL) Chart of Accounts defaults for hospitality & restaurant operations
   */
  public getDefaultGLAccounts(businessId: string): GLAccountLink[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'gl-4010',
        business_id: businessId,
        account_number: '4010',
        account_name: 'Food Sales Revenue',
        category: 'REVENUE',
        mapping_key: 'FOOD_SALES',
        description: 'Gross revenue from kitchen dining dishes, breakfast, lunch, dinner and snacks',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'gl-4020',
        business_id: businessId,
        account_number: '4020',
        account_name: 'Beverage Sales Revenue',
        category: 'REVENUE',
        mapping_key: 'BEVERAGE_SALES',
        description: 'Gross revenue from bar drinks, non-alcoholic and beverage items',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'gl-4090',
        business_id: businessId,
        account_number: '4090',
        account_name: 'Sales Discounts & Rebates',
        category: 'EXPENSE',
        mapping_key: 'DISCOUNTS_ALLOWED',
        description: 'Contra-revenue account for promotional and guest billing discounts',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'gl-2110',
        business_id: businessId,
        account_number: '2110',
        account_name: 'Sales Tax / VAT Payable (13%)',
        category: 'TAX_LIABILITY',
        mapping_key: 'VAT_COLLECTED',
        description: 'Collected value added tax liability for tax authorities remittance',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'gl-2120',
        business_id: businessId,
        account_number: '2120',
        account_name: 'Hospitality Service Charge Payable',
        category: 'LIABILITY',
        mapping_key: 'SERVICE_CHARGE',
        description: '10% Hospitality service charge collected for staff pool distribution',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'gl-1010',
        business_id: businessId,
        account_number: '1010',
        account_name: 'POS Till Cash on Hand',
        category: 'ASSET',
        mapping_key: 'CASH_SETTLEMENT',
        description: 'Physical cash received in the cashier counter register drawer',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'gl-1020',
        business_id: businessId,
        account_number: '1020',
        account_name: 'Credit & Debit Card Clearing',
        category: 'ASSET',
        mapping_key: 'CARD_SETTLEMENT',
        description: 'Card machine swipe and chip transactions awaiting bank settlement',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'gl-1030',
        business_id: businessId,
        account_number: '1030',
        account_name: 'QR Digital Payment Clearing',
        category: 'ASSET',
        mapping_key: 'QR_SETTLEMENT',
        description: 'Dynamic QR code and digital wallet settlements',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'gl-1040',
        business_id: businessId,
        account_number: '1040',
        account_name: 'Online Payment Gateway Clearing',
        category: 'ASSET',
        mapping_key: 'ONLINE_SETTLEMENT',
        description: 'Online direct web orders and payment gateway disbursements',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'gl-1110',
        business_id: businessId,
        account_number: '1110',
        account_name: 'Guest Room Folio Receivable',
        category: 'ASSET',
        mapping_key: 'ROOM_CHARGE',
        description: 'Dining tickets transferred to hotel guest room check-in folio',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'gl-1120',
        business_id: businessId,
        account_number: '1120',
        account_name: 'Accounts Receivable (Credit Sales)',
        category: 'ASSET',
        mapping_key: 'CREDIT_SETTLEMENT',
        description: 'Credit sales pending collection from guests or corporate accounts',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ];
  }

  /**
   * Get all GL accounts for a business, auto-seeding defaults if empty
   */
  public async getGLAccounts(businessId: string): Promise<GLAccountLink[]> {
    try {
      const snap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'gl_accounts'));
      if (!snap.empty) {
        const accounts: GLAccountLink[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          accounts.push({
            id: docSnap.id,
            business_id: d.business_id || businessId,
            account_number: d.account_number || '',
            account_name: d.account_name || '',
            category: d.category || 'REVENUE',
            mapping_key: d.mapping_key || '',
            description: d.description || '',
            customer_name: d.customer_name ?? null,
            customer_address: d.customer_address ?? null,
            customer_phone: d.customer_phone ?? null,
            customer_extension: d.customer_extension ?? null,
            customer_office_name: d.customer_office_name ?? null,
            customer_designation: d.customer_designation ?? null,
            is_active: d.is_active !== false,
            created_at: d.created_at || new Date().toISOString(),
            updated_at: d.updated_at || new Date().toISOString(),
          });
        });

        // Sort by account_number ascending
        accounts.sort((a, b) => a.account_number.localeCompare(b.account_number, undefined, { numeric: true }));
        return accounts;
      }
    } catch (e: any) {
      console.warn('getGLAccounts firestore read note:', e.message);
    }

    // Seed defaults in background & return
    const defaults = this.getDefaultGLAccounts(businessId);
    Promise.all(
      defaults.map((acc) =>
        setDoc(doc(firestoreDb, 'businesses', businessId, 'gl_accounts', acc.id), acc).catch(() => {})
      )
    ).catch(() => {});

    return defaults;
  }

  /**
   * Create or save a new GL Account Link (Owner / Admin configurable)
   */
  public async createGLAccount(
    businessId: string,
    accountData: Partial<GLAccountLink>,
    user?: any
  ): Promise<GLAccountLink> {
    const accNumber = String(accountData.account_number || '').trim();
    const accName = String(accountData.account_name || '').trim();

    if (!accNumber || !accName) {
      throw new Error('Account Number and Account Name are required');
    }

    // Customer credit accounts must have a unique account number per business
    if ((accountData.mapping_key || '') === 'CREDIT_SETTLEMENT') {
      const existingSnap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'gl_accounts'));
      let duplicate = false;
      existingSnap.forEach((d) => {
        if (String(d.data().account_number || '').trim() === accNumber) duplicate = true;
      });
      if (duplicate) {
        throw new Error(`GL account number ${accNumber} already exists. Please use a different number.`);
      }
    }

    const cleanOrNull = (v: any): string | null => {
      const s = typeof v === 'string' ? v.trim() : '';
      return s ? s : null;
    };

    const now = new Date().toISOString();
    const id = accountData.id || `gl-${accNumber.replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}`;
    const newAccount: GLAccountLink = {
      id,
      business_id: businessId,
      account_number: accNumber,
      account_name: accName,
      category: accountData.category || 'REVENUE',
      mapping_key: accountData.mapping_key || '',
      description: accountData.description || '',
      customer_name: cleanOrNull(accountData.customer_name),
      customer_address: cleanOrNull(accountData.customer_address),
      customer_phone: cleanOrNull(accountData.customer_phone),
      customer_extension: cleanOrNull(accountData.customer_extension),
      customer_office_name: cleanOrNull(accountData.customer_office_name),
      customer_designation: cleanOrNull(accountData.customer_designation),
      is_active: accountData.is_active !== false,
      created_at: now,
      updated_at: now,
    };

    await setDoc(doc(firestoreDb, 'businesses', businessId, 'gl_accounts', id), newAccount);

    auditService.log({
      userId: user?.id || 'owner',
      email: user?.email || 'owner@serveflow.app',
      businessId,
      eventType: 'GL_ACCOUNT_CREATED',
      status: `ACC_${accNumber}_${accName}`,
    });

    return newAccount;
  }

  /**
   * Update an existing GL Account Link (Owner / Admin configurable)
   */
  public async updateGLAccount(
    businessId: string,
    accountId: string,
    updates: Partial<GLAccountLink>,
    user?: any
  ): Promise<GLAccountLink> {
    const ref = doc(firestoreDb, 'businesses', businessId, 'gl_accounts', accountId);
    const existingSnap = await getDoc(ref);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;

    // If the field was sent, blank => null; if not sent, keep what is stored
    const pickCustomerField = (key: string): string | null => {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        const v = (updates as any)[key];
        const s = typeof v === 'string' ? v.trim() : '';
        return s ? s : null;
      }
      return (existingData as any)?.[key] ?? null;
    };

    const updatedAccount: GLAccountLink = {
      id: accountId,
      business_id: businessId,
      account_number: updates.account_number ?? existingData?.account_number ?? '',
      account_name: updates.account_name ?? existingData?.account_name ?? '',
      category: updates.category ?? existingData?.category ?? 'REVENUE',
      mapping_key: updates.mapping_key ?? existingData?.mapping_key ?? '',
      description: updates.description ?? existingData?.description ?? '',
      customer_name: pickCustomerField('customer_name'),
      customer_address: pickCustomerField('customer_address'),
      customer_phone: pickCustomerField('customer_phone'),
      customer_extension: pickCustomerField('customer_extension'),
      customer_office_name: pickCustomerField('customer_office_name'),
      customer_designation: pickCustomerField('customer_designation'),
      is_active: updates.is_active !== undefined ? updates.is_active : (existingData?.is_active ?? true),
      created_at: existingData?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await setDoc(ref, updatedAccount);

    auditService.log({
      userId: user?.id || 'owner',
      email: user?.email || 'owner@serveflow.app',
      businessId,
      eventType: 'GL_ACCOUNT_UPDATED',
      status: `ACC_${updatedAccount.account_number}_${updatedAccount.account_name}`,
    });

    return updatedAccount;
  }

  /**
   * Delete a GL Account Link (Owner / Admin configurable)
   */
  public async deleteGLAccount(
    businessId: string,
    accountId: string,
    user?: any
  ): Promise<void> {
    const ref = doc(firestoreDb, 'businesses', businessId, 'gl_accounts', accountId);
    await deleteDoc(ref);

    auditService.log({
      userId: user?.id || 'owner',
      email: user?.email || 'owner@serveflow.app',
      businessId,
      eventType: 'GL_ACCOUNT_DELETED',
      status: `ACC_ID_${accountId}`,
    });
  }

  /**
   * Reset GL Accounts to hospitality standard defaults
   */
  public async resetDefaultGLAccounts(
    businessId: string,
    user?: any
  ): Promise<GLAccountLink[]> {
    // Clear existing
    try {
      const snap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'gl_accounts'));
      const delPromises: Promise<any>[] = [];
      snap.forEach((d) => delPromises.push(deleteDoc(d.ref)));
      await Promise.all(delPromises);
    } catch (e: any) {
      console.warn('resetDefaultGLAccounts clear error:', e.message);
    }

    const defaults = this.getDefaultGLAccounts(businessId);
    await Promise.all(
      defaults.map((acc) =>
        setDoc(doc(firestoreDb, 'businesses', businessId, 'gl_accounts', acc.id), acc)
      )
    );

    auditService.log({
      userId: user?.id || 'owner',
      email: user?.email || 'owner@serveflow.app',
      businessId,
      eventType: 'GL_ACCOUNTS_RESET_DEFAULT',
      status: `RESET_COUNT_${defaults.length}`,
    });

    return defaults;
  }

  /**
   * Get sales records with optional date / range / payment filtering
   */
  public async getSales(
    businessId: string,
    filters?: {
      date?: string; // YYYY-MM-DD
      startDate?: string;
      endDate?: string;
      paymentMethod?: string;
      limit?: number;
    }
  ): Promise<SaleRecord[]> {
    try {
      const snap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'sales'));
      let sales: SaleRecord[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const createdIso = d.created_at || new Date().toISOString();
        const dateStr = d.date_string || (createdIso ? new Date(createdIso).toISOString().split('T')[0] : '');
        sales.push({
          id: docSnap.id,
          invoice_number: d.invoice_number || docSnap.id,
          order_number: d.order_number || (d.order_id ? d.order_id.slice(0, 8).toUpperCase() : undefined),
          business_id: d.business_id || businessId,
          order_id: d.order_id,
          table_id: d.table_id,
          table_number: d.table_number,
          customer_name: d.customer_name || 'Guest',
          customer_phone: d.customer_phone || '',
          sale_type: d.sale_type || 'DINE_IN',
          items: d.items || [],
          subtotal: Number(d.subtotal) || 0,
          discount_percent: Number(d.discount_percent) || 0,
          discount_amount: Number(d.discount_amount) || 0,
          promo_code: d.promo_code || undefined,
          promo_discount: Number(d.promo_discount) || 0,
          taxes: d.taxes || [],
          total_tax: Number(d.total_tax) || 0,
          service_charge: Number(d.service_charge) || 0,
          total_amount: Number(d.total_amount) || 0,
          currency: d.currency || 'Rs.',
          payment_method: d.payment_method || 'CASH',
          credit_gl_account_id: d.credit_gl_account_id || undefined,
          credit_gl_account_number: d.credit_gl_account_number || undefined,
          credit_gl_account_name: d.credit_gl_account_name || undefined,
          payment_status: d.payment_status || 'PAID',
          cashier_name: d.cashier_name || 'Staff',
          cashier_id: d.cashier_id,
          notes: d.notes || '',
          created_at: createdIso,
          date_string: dateStr,
        });
      });

      // Filter by exact date
      if (filters?.date) {
        sales = sales.filter((s) => s.date_string === filters.date);
      }
      // Filter by range
      if (filters?.startDate) {
        sales = sales.filter((s) => s.date_string >= filters.startDate!);
      }
      if (filters?.endDate) {
        sales = sales.filter((s) => s.date_string <= filters.endDate!);
      }
      // Filter by payment method
      if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
        sales = sales.filter((s) => s.payment_method === filters.paymentMethod);
      }

      // Sort newest first
      sales.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (filters?.limit && filters.limit > 0) {
        sales = sales.slice(0, filters.limit);
      }

      return sales;
    } catch (e: any) {
      console.warn('getSales fallback error:', e.message);
      return [];
    }
  }

  /**
   * Create a new sale record (from POS or settled table order)
   */
  public async getNextSequenceNumber(businessId: string, type: 'invoice' | 'order', providedVal?: string, defaultPrefix = '', taxConfig?: any): Promise<string> {
    const counterRef = doc(firestoreDb, 'businesses', businessId, 'counters', type);
    return await runTransaction(firestoreDb, async (transaction) => {
        const docSnap = await transaction.get(counterRef);
        let nextVal = '';
        
        let shouldReset = false;
        const now = new Date();
        const currentDateStr = now.toISOString().split('T')[0];
        const lastReset = docSnap.exists() ? docSnap.data().last_reset_date : null;
        
        if (type === 'order' && taxConfig && taxConfig.order_reset_interval && taxConfig.order_reset_interval !== 'MANUAL') {
            if (!lastReset) {
                shouldReset = true;
            } else {
                const lastDate = new Date(lastReset);
                if (taxConfig.order_reset_interval === 'DAILY' && currentDateStr !== lastReset) shouldReset = true;
                if (taxConfig.order_reset_interval === 'WEEKLY' && (now.getTime() - lastDate.getTime()) > 7*24*60*60*1000) shouldReset = true;
                if (taxConfig.order_reset_interval === 'MONTHLY' && (now.getMonth() !== lastDate.getMonth() || now.getFullYear() !== lastDate.getFullYear())) shouldReset = true;
                if (taxConfig.order_reset_interval === 'YEARLY' && now.getFullYear() !== lastDate.getFullYear()) shouldReset = true;
            }
        }

        if (providedVal) {
            nextVal = providedVal;
        } else {
            if (docSnap.exists() && docSnap.data().current && !shouldReset) {
                nextVal = incrementSequence(docSnap.data().current);
            } else {
                if (type === 'order') {
                const pref = (defaultPrefix && defaultPrefix !== 'A') ? defaultPrefix : 'ORD-0';
                nextVal = pref === 'ORD-0' ? 'ORD-01' : (pref.endsWith('-') ? `${pref}01` : (pref.endsWith('0') ? `${pref}1` : `${pref}-01`));
            } else {
                nextVal = defaultPrefix + '1';
            } 
            }
        }

        transaction.set(counterRef, { 
            current: nextVal,
            ...((shouldReset || !lastReset) ? { last_reset_date: currentDateStr } : {})
        }, { merge: true });
        return nextVal;
    });
  }

  public async createSale(
    businessId: string,
    saleData: Partial<SaleRecord>,
    user?: any,
    options?: { skipOrderCompletion?: boolean }
  ): Promise<SaleRecord> {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timestamp = now.getTime();
    const shortRandom = Math.floor(1000 + Math.random() * 9000);
    const id = saleData.id || `sale-${timestamp}-${shortRandom}`;

    // Server-side validation for CREDIT sales
    let resolvedCreditGlName = saleData.credit_gl_account_name || null;
    let resolvedCreditGlNumber = saleData.credit_gl_account_number || null;
    let resolvedCreditCustomer: { name: string | null; phone: string | null } = { name: null, phone: null };
    if (saleData.payment_method === 'CREDIT') {
      if (!saleData.credit_gl_account_id) {
        // Fallback for legacy tests or endpoints that don't enforce it: Throw an Error as requested by prompt.
        // Wait, the prompt said "Attempt a CREDIT sale with no account... Each must be rejected with 400."
        // We will throw a standard Error which the route handler captures as 400 or 500.
        throw new Error('A valid customer credit GL account must be selected for CREDIT sales.');
      }
      
      const glRef = doc(firestoreDb, 'businesses', businessId, 'gl_accounts', saleData.credit_gl_account_id);
      const glSnap = await getDoc(glRef);
      if (!glSnap.exists()) {
        throw new Error('Selected customer credit GL account does not exist.');
      }
      
      const glData = glSnap.data();
      if (glData.is_active === false) {
        throw new Error('Selected customer credit GL account is inactive.');
      }
      if (glData.mapping_key !== 'CREDIT_SETTLEMENT') {
        throw new Error('Selected GL account is not mapped for Credit Settlement.');
      }
      
      resolvedCreditGlName = glData.account_name;
      resolvedCreditGlNumber = glData.account_number;
      resolvedCreditCustomer = {
        name: glData.customer_name || null,
        phone: glData.customer_phone || null,
      };
    }

    const taxConfig = await this.getTaxConfig(businessId);
    const prefix = taxConfig.invoice_prefix || 'INV-';
    const invoiceNumber = await this.getNextSequenceNumber(businessId, 'invoice', saleData.invoice_number, prefix);

    let orderNumber = saleData.order_number;
    if (!orderNumber) {
        if (saleData.order_id) {
            try {
                const oDoc = await getDoc(doc(firestoreDb, 'businesses', businessId, 'table_orders', saleData.order_id));
                if (oDoc.exists() && oDoc.data().order_number) {
                    orderNumber = oDoc.data().order_number;
                }
            } catch (e) {}
        }
        if (!orderNumber) {
            orderNumber = await this.getNextSequenceNumber(businessId, 'order', undefined, 'ORD-0', taxConfig);
        }
    } else {
        orderNumber = await this.getNextSequenceNumber(businessId, 'order', saleData.order_number, 'ORD-0', taxConfig);
    }

    const newSale: any = {
      id,
      invoice_number: invoiceNumber || null,
      order_number: orderNumber || null,
      business_id: businessId,
      order_id: saleData.order_id || null,
      table_id: saleData.table_id || null,
      table_number: saleData.table_number || null,
      customer_name: (() => {
        const typed = (saleData.customer_name || '').trim();
        const isDefault = !typed || /^(walk-in guest|guest)$/i.test(typed);
        if (saleData.payment_method === 'CREDIT' && isDefault && resolvedCreditCustomer.name) return resolvedCreditCustomer.name;
        return saleData.customer_name || 'Walk-in Guest';
      })(),
      customer_phone: saleData.customer_phone || (saleData.payment_method === 'CREDIT' ? (resolvedCreditCustomer.phone || '') : ''),
      sale_type: saleData.sale_type || 'DINE_IN',
      items: saleData.items || [],
      subtotal: Number(saleData.subtotal) || 0,
      discount_percent: Number(saleData.discount_percent) || 0,
      discount_amount: Number(saleData.discount_amount) || 0,
      promo_code: saleData.promo_code || null,
      promo_discount: Number(saleData.promo_discount) || 0,
      taxes: saleData.taxes || [],
      total_tax: Number(saleData.total_tax) || 0,
      service_charge: Number(saleData.service_charge) || 0,
      total_amount: Number(saleData.total_amount) || 0,
      currency: saleData.currency || taxConfig.currency || 'Rs.',
      payment_method: saleData.payment_method || 'CASH',
      credit_gl_account_id: saleData.payment_method === 'CREDIT' ? saleData.credit_gl_account_id : null,
      credit_gl_account_number: saleData.payment_method === 'CREDIT' ? resolvedCreditGlNumber : null,
      credit_gl_account_name: saleData.payment_method === 'CREDIT' ? resolvedCreditGlName : null,
      payment_status: saleData.payment_status || 'PAID',
      cashier_name: saleData.cashier_name || user?.email || 'Manager',
      cashier_id: saleData.cashier_id || user?.id || null,
      notes: saleData.notes || '',
      created_at: now.toISOString(),
      date_string: dateStr,
    };
    
    // Remove null keys so we don't save nulls to firestore unnecessarily
    Object.keys(newSale).forEach(key => newSale[key] === null && delete newSale[key]);
    

    await setDoc(doc(firestoreDb, 'businesses', businessId, 'sales', id), newSale);

    // If linked to a table order or table, complete all associated active orders and reset table
    if (!options?.skipOrderCompletion && (saleData.order_id || saleData.table_id || saleData.table_number)) {
      try {
        const ordersSnap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'table_orders'));
        const batchUpdates: Promise<any>[] = [];
        ordersSnap.forEach((oDoc) => {
          const od = oDoc.data();
          const matches = (saleData.order_id && oDoc.id === saleData.order_id) ||
                          (saleData.table_id && od.table_id === saleData.table_id) ||
                          (saleData.table_number && od.table_number === saleData.table_number);
          if (matches && od.status !== 'COMPLETED' && od.status !== 'CANCELLED') {
            batchUpdates.push(
              updateDoc(oDoc.ref, {
                status: 'COMPLETED',
                payment_status: 'PAID',
                invoice_id: id,
                bill_requested: false,
                settled: true,
                completed_at: now.toISOString(),
                updated_at: now.toISOString(),
              }).catch(() => {})
            );
          }
        });
        if (batchUpdates.length > 0) {
          await Promise.all(batchUpdates);
        }

        // Automatically resolve any associated BILL_REQUEST service requests so the card in Waiter Station disappears
        try {
          const srvSnap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'service_requests'));
          const srvUpdates: Promise<any>[] = [];
          srvSnap.forEach((sDoc) => {
            const sd = sDoc.data();
            const isRelated =
              (saleData.order_id && (sd.order_id === saleData.order_id || sDoc.id === `bill-${saleData.order_id}`)) ||
              (saleData.table_id && sd.table_id === saleData.table_id) ||
              (saleData.table_number && String(sd.table_number) === String(saleData.table_number));
            if (isRelated && (sd.type === 'BILL_REQUEST' || sd.status === 'PENDING')) {
              srvUpdates.push(
                updateDoc(sDoc.ref, {
                  status: 'RESOLVED',
                  resolved_at: now.toISOString(),
                  resolved_by: 'POS_CASHIER_SETTLED',
                  updated_at: now.toISOString(),
                }).catch(() => {})
              );
            }
          });
          if (srvUpdates.length > 0) {
            await Promise.all(srvUpdates);
          }
        } catch (e) {
          console.warn('Service requests resolution note:', e);
        }
      } catch (e) {}

      const tableResetPayload = {
        status: 'ACTIVE' as TableStatus,
        current_session_id: null,
        host_token: null,
        last_scanned_at: null,
        updated_at: now.toISOString(),
      };

      if (saleData.table_id) {
        try {
          await updateDoc(doc(firestoreDb, 'businesses', businessId, 'tables', saleData.table_id), tableResetPayload);
        } catch (e) {}
      } else if (saleData.table_number) {
        try {
          const q = query(
            collection(firestoreDb, 'businesses', businessId, 'tables'),
            where('table_number', '==', saleData.table_number)
          );
          const qSnap = await getDocs(q);
          qSnap.forEach(async (tDoc) => {
            try {
              await updateDoc(tDoc.ref, tableResetPayload);
            } catch {}
          });
        } catch (e) {}
      }
    }

    auditService.log({
      userId: user?.id || 'staff',
      email: user?.email || 'staff@serveflow.app',
      businessId,
      eventType: 'SALE_RECORD_CREATED',
      status: `INVOICE_${invoiceNumber}_TOTAL_${newSale.total_amount}`,
    });

    return newSale;
  }

  /**
   * Delete a single sale record
   */
  public async deleteSale(businessId: string, saleId: string, user?: any): Promise<void> {
    const saleRef = doc(firestoreDb, 'businesses', businessId, 'sales', saleId);
    await deleteDoc(saleRef);

    auditService.log({
      userId: user?.id || 'admin',
      email: user?.email || 'admin@serveflow.app',
      businessId,
      eventType: 'SALE_RECORD_DELETED',
      status: `DELETED_${saleId}`,
    });
  }

  /**
   * Delete one specific day's sales history
   */
  public async deleteSalesByDate(
    businessId: string,
    dateString: string,
    user?: any
  ): Promise<{ deletedCount: number }> {
    const snap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'sales'));
    let count = 0;
    const promises: Promise<any>[] = [];

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const saleDate = d.date_string || (d.created_at ? new Date(d.created_at).toISOString().split('T')[0] : '');
      if (saleDate === dateString) {
        count++;
        promises.push(deleteDoc(docSnap.ref));
      }
    });

    await Promise.all(promises);

    auditService.log({
      userId: user?.id || 'admin',
      email: user?.email || 'admin@serveflow.app',
      businessId,
      eventType: 'SALES_HISTORY_DELETED_BY_DATE',
      status: `DELETED_DATE_${dateString}_COUNT_${count}`,
    });

    return { deletedCount: count };
  }

  /**
   * Delete entire saved sales records
   */
  public async deleteAllSales(businessId: string, user?: any): Promise<{ deletedCount: number }> {
    const snap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'sales'));
    let count = 0;
    const promises: Promise<any>[] = [];

    snap.forEach((docSnap) => {
      count++;
      promises.push(deleteDoc(docSnap.ref));
    });

    await Promise.all(promises);

    auditService.log({
      userId: user?.id || 'admin',
      email: user?.email || 'admin@serveflow.app',
      businessId,
      eventType: 'ALL_SALES_HISTORY_CLEARED',
      status: `CLEARED_ALL_COUNT_${count}`,
    });

    return { deletedCount: count };
  }

  /**
   * Automatic daily maintenance:
   * 1. Deletes table_orders older than 24 hours (or past day's completed/cancelled orders)
   *    so Firebase doesn't accumulate excessive order payload items.
   * 2. Retains completed sales records for 30 days (ensuring History page monthly reports work smoothly),
   *    and purges sales older than 30 days to avoid long-term database bloat.
   */
  public async cleanupDailyOrdersAndOldSales(businessId?: string): Promise<{ deletedOrders: number; deletedSales: number }> {
    let businessIds: string[] = [];
    if (businessId) {
      businessIds = [businessId];
    } else {
      try {
        const bizSnap = await getDocs(collection(firestoreDb, 'businesses'));
        businessIds = bizSnap.docs.map((d) => d.id);
      } catch {
        const def = await db.getDefaultBusiness();
        if (def) businessIds = [def.id];
      }
    }

    if (businessIds.length === 0) {
      businessIds = ['maya-forest-resort'];
    }

    let totalDeletedOrders = 0;
    let totalDeletedSales = 0;

    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    for (const bId of businessIds) {
      // 1. Clean table_orders (older than 24h OR completed/cancelled older than 4h)
      try {
        const ordersSnap = await getDocs(collection(firestoreDb, 'businesses', bId, 'table_orders'));
        const orderDeletePromises: Promise<any>[] = [];

        ordersSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const createdAt = data.created_at ? new Date(data.created_at).getTime() : 0;
          const status = data.status;

          // If created more than 24h ago
          const isOlderThan24h = createdAt > 0 && createdAt < twentyFourHoursAgo;
          // Or if completed/cancelled more than 4 hours ago
          const isCompletedAndStale = (status === 'COMPLETED' || status === 'CANCELLED') && (createdAt < (now - 4 * 60 * 60 * 1000));

          if (isOlderThan24h || isCompletedAndStale) {
            totalDeletedOrders++;
            orderDeletePromises.push(deleteDoc(docSnap.ref));
          }
        });

        await Promise.all(orderDeletePromises);
      } catch (err: any) {
        console.warn(`[Cleanup] Failed to clean table_orders for business ${bId}:`, err.message);
      }

      // 2. Clean sales older than 30 days (rolling 30-day retention for monthly history)
      try {
        const salesSnap = await getDocs(collection(firestoreDb, 'businesses', bId, 'sales'));
        const salesDeletePromises: Promise<any>[] = [];

        salesSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const createdAt = data.created_at ? new Date(data.created_at).getTime() : 0;
          if (createdAt > 0 && createdAt < thirtyDaysAgo) {
            totalDeletedSales++;
            salesDeletePromises.push(deleteDoc(docSnap.ref));
          }
        });

        await Promise.all(salesDeletePromises);
      } catch (err: any) {
        console.warn(`[Cleanup] Failed to clean sales for business ${bId}:`, err.message);
      }
    }

    if (totalDeletedOrders > 0 || totalDeletedSales > 0) {
      auditService.log({
        userId: 'system-cron',
        email: 'system@serveflow.app',
        businessId: businessId || 'all',
        eventType: 'DAILY_STORAGE_CLEANUP',
        status: `DELETED_ORDERS_${totalDeletedOrders}_DELETED_SALES_${totalDeletedSales}`,
      });
      console.log(`[Storage Maintenance] Auto-deleted ${totalDeletedOrders} orders (>24h) and ${totalDeletedSales} sales (>30d) from Firebase.`);
    }

    return { deletedOrders: totalDeletedOrders, deletedSales: totalDeletedSales };
  }

  /**
   * Purge completed/settled table orders immediately on demand
   */
  public async purgeCompletedTableOrders(businessId: string): Promise<{ deletedCount: number }> {
    const ordersSnap = await getDocs(collection(firestoreDb, 'businesses', businessId, 'table_orders'));
    let deletedCount = 0;
    const promises: Promise<any>[] = [];

    ordersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status === 'COMPLETED' || data.status === 'CANCELLED') {
        deletedCount++;
        promises.push(deleteDoc(docSnap.ref));
      }
    });

    await Promise.all(promises);

    auditService.log({
      userId: 'staff',
      email: 'staff@serveflow.app',
      businessId,
      eventType: 'PURGE_COMPLETED_ORDERS',
      status: `PURGED_${deletedCount}`,
    });

    return { deletedCount };
  }

  /**
   * Clone menu categories and menu items from a source business to a target branch
   */
  public async cloneMenuCatalog(
    sourceBusinessId: string,
    targetBusinessId: string,
    user: { id: string; role?: string; email?: string }
  ): Promise<{ categoriesCloned: number; itemsCloned: number }> {
    try {
      // 1. Fetch categories from source
      const sourceCategories = await this.getCategories(sourceBusinessId, user);
      const categoryIdMap = new Map<string, string>(); // oldId -> newId

      for (const cat of sourceCategories) {
        const createdCat = await this.createCategory(targetBusinessId, { name: cat.name }, user);
        categoryIdMap.set(cat.id, createdCat.id);
      }

      // 2. Fetch items from source
      const sourceItems = await this.getMenuItems(sourceBusinessId, user);
      let itemsCloned = 0;

      for (const item of sourceItems) {
        const targetCategoryId = item.category_id ? categoryIdMap.get(item.category_id) : undefined;
        await this.createMenuItem(
          targetBusinessId,
          {
            name: item.name,
            category: item.category,
            category_id: targetCategoryId,
            price: item.price,
            currency: item.currency,
            description: item.description,
            image_url: item.image_url,
            food_type: item.food_type,
            status: item.status,
            is_available: item.is_available,
            preparation_time_mins: item.preparation_time_mins,
          },
          user
        );
        itemsCloned++;
      }

      return { categoriesCloned: sourceCategories.length, itemsCloned };
    } catch (err: any) {
      console.warn(`[CloneMenu] Notice cloning menu from ${sourceBusinessId} to ${targetBusinessId}:`, err.message);
      return { categoriesCloned: 0, itemsCloned: 0 };
    }
  }

  /**
   * Register a new franchise branch with automated table seeding & optional menu cloning
   */
  public async createFranchiseBranch(
    params: {
      name: string;
      parentBusinessId: string;
      branchCode?: string;
      businessType?: any;
      location?: string;
      phone?: string;
      tagline?: string;
      kitchenHours?: string;
      currency?: string;
      taxRate?: number;
      cloneMenuFrom?: string;
    },
    user: { id: string; role?: string; email?: string }
  ) {
    const role = this.normalizeRole(user.role);
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new Error('Only Business Owners and Administrators can provision new franchise branches.');
    }

    const branch = await db.createBranch({
      name: params.name.trim(),
      businessType: params.businessType,
      parentBusinessId: params.parentBusinessId,
      ownerUid: user.id,
      branchCode: params.branchCode?.trim() || undefined,
      location: params.location?.trim() || undefined,
      phone: params.phone?.trim() || undefined,
      tagline: params.tagline?.trim() || undefined,
      kitchenHours: params.kitchenHours?.trim() || undefined,
      currency: params.currency?.trim() || undefined,
      taxRate: typeof params.taxRate === 'number' ? params.taxRate : undefined,
    });

    // 1. Automatically seed default tables for this newly created branch
    await this.seedDefaultTables(branch.id);

    // 2. Clone menu items if requested
    let cloneStats = { categoriesCloned: 0, itemsCloned: 0 };
    if (params.cloneMenuFrom) {
      cloneStats = await this.cloneMenuCatalog(params.cloneMenuFrom, branch.id, user);
    }

    // 3. Initialize tax config for branch
    if (typeof params.taxRate === 'number' || params.currency) {
      await this.updateTaxConfig(
        branch.id,
        {
          tax_enabled: true,
          rates: [
            {
              id: 'vat-sales',
              name: 'Sales Tax / VAT',
              rate_percent: typeof params.taxRate === 'number' ? params.taxRate : 5,
              enabled: true,
            },
          ],
          currency: params.currency || 'Rs.',
          currency_symbol: params.currency || 'Rs.',
          invoice_prefix: `${params.branchCode ? params.branchCode + '-' : ''}INV-`,
        },
        user
      ).catch(() => {});
    }

    auditService.log({
      userId: user.id,
      email: user.email,
      businessId: branch.id,
      eventType: 'FRANCHISE_BRANCH_CREATED',
      status: `BRANCH_${branch.id}_PARENT_${params.parentBusinessId}`,
    });

    return {
      branch,
      cloneStats,
    };
  }

  public async confirmTableOrderPayment(
    orderId: string,
    businessId: string,
    paymentMethod: string,
    cashierName: string,
    notes?: string
  ): Promise<void> {
    const docRef = doc(firestoreDb, 'businesses', businessId, 'table_orders', orderId);
    
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Order not found');
    const order = snap.data();
    
    if (!order.pay_first) throw new Error('Not a pay-first order');
    if (order.status !== 'AWAITING_PAYMENT') throw new Error('Order is not awaiting payment');
    if (order.payment_status === 'PAID') throw new Error('Order is already paid');
    
    const activeItems = (order.items || []).filter((it: any) => it.status !== 'CANCELLED');
    const itemsMenuTotal = activeItems.reduce(
      (sum: number, it: any) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
      0
    );
    const taxConfig = await this.getTaxConfig(businessId);
    const {
      subtotal: calcSubtotal,
      taxAmount: calcTax,
      computedTaxes,
      totalAmount: preDiscountTotal,
    } = this.calculateOrderTaxBreakdown(itemsMenuTotal, taxConfig);
    const promoDiscount = this.resolveOrderPromoDiscount(preDiscountTotal, order, taxConfig);
    const finalTotal = Math.max(0, Math.round((preDiscountTotal - promoDiscount) * 100) / 100);
    const serviceCharge = Math.round(
      computedTaxes
        .filter((t: any) => (t.name || '').toLowerCase().includes('service'))
        .reduce((acc: number, t: any) => acc + (Number(t.amount) || 0), 0) * 100
    ) / 100;

    const salePayload = {
      order_id: orderId,
      order_number: order.order_number || undefined,
      table_id: order.table_id,
      table_number: order.table_number,
      customer_name: order.customer_name || 'Guest',
      customer_phone: order.customer_phone || '',
      sale_type: 'DINE_IN',
      items: activeItems,
      subtotal: calcSubtotal,
      discount_percent: 0,
      discount_amount: promoDiscount,
      promo_code: order.promo_code,
      promo_discount: promoDiscount,
      taxes: computedTaxes,
      total_tax: calcTax,
      service_charge: serviceCharge,
      total_amount: finalTotal,
      currency: order.currency || taxConfig.currency_symbol || 'Rs.',
      payment_method: paymentMethod as any,
      payment_status: 'PAID',
      cashier_name: cashierName,
      notes: notes || 'Pay-First order confirmed',
    };
    
    const createdSale = await this.createSale(businessId, salePayload as any, { id: 'system', role: 'SYSTEM' }, { skipOrderCompletion: true });
    
    await updateDoc(docRef, {
      status: 'RECEIVED',
      subtotal: calcSubtotal,
      tax_amount: calcTax,
      taxes: computedTaxes,
      promo_discount: promoDiscount,
      total_amount: finalTotal,
      payment_status: 'PAID',
      payment_confirmed_at: new Date().toISOString(),
      payment_confirmed_by: cashierName,
      sale_id: createdSale.id,
      updated_at: new Date().toISOString()
    });
  }

  public async rejectTableOrderPayment(
    orderId: string,
    businessId: string,
    reason: string,
    cashierName: string
  ): Promise<void> {
    const docRef = doc(firestoreDb, 'businesses', businessId, 'table_orders', orderId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Order not found');
    const order = snap.data();
    
    if (!order.pay_first) throw new Error('Not a pay-first order');
    if (order.status !== 'AWAITING_PAYMENT') throw new Error('Order is not awaiting payment');
    
    await updateDoc(docRef, {
      status: 'CANCELLED',
      payment_rejected_reason: reason || 'Payment rejected',
      payment_status: 'CANCELLED',
      updated_at: new Date().toISOString()
    });
  }

}


export const rbacService = new RBACService();

// Schedule automated daily cleanup (runs at boot and every 12 hours)
const initialCleanupTimer = setTimeout(() => {
  rbacService.cleanupDailyOrdersAndOldSales().catch((err) => {
    console.warn('[Storage Maintenance] Initial run note:', err.message);
  });
}, 15000);
if (initialCleanupTimer && typeof initialCleanupTimer.unref === 'function') {
  initialCleanupTimer.unref();
}

const intervalCleanupTimer = setInterval(() => {
  rbacService.cleanupDailyOrdersAndOldSales().catch((err) => {
    console.warn('[Storage Maintenance] Interval run note:', err.message);
  });
}, 12 * 60 * 60 * 1000);
if (intervalCleanupTimer && typeof intervalCleanupTimer.unref === 'function') {
  intervalCleanupTimer.unref();
}
