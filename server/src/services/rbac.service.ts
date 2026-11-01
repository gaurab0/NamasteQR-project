import crypto from 'crypto';
import bcrypt from 'bcryptjs';

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
} from '../types';
import { db } from './db.service';
import { prisma } from '../lib/prisma';
import { realtimeEmitter } from '../lib/socket';
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
  // MENUS COLLECTION (Restricted by RBAC)
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
      const dbItems = await prisma.menuItem.findMany({
        where: { business_id: businessId },
        orderBy: { order_index: 'asc' },
      });
      return dbItems.map((d: any) => ({
        id: d.id,
        business_id: d.business_id,
        name: d.name,
        category: d.category || 'General',
        category_id: d.category_id || undefined,
        price: Number(d.price),
        currency: d.currency || 'Rs.',
        description: d.description || '',
        image_url: d.image_url || '',
        food_type: (d.food_type as any) || 'non-veg',
        variants: (d.variants as any) || [],
        has_variants: d.has_variants || false,
        variant_group_name: d.variant_group_name || undefined,
        additional_categories: d.additional_categories || [],
        show_image: d.show_image,
        promo_badge: d.promo_badge || undefined,
        display_style: (d.display_style as any) || undefined,
        status: (d.status as any) || (d.is_available ? 'available' : 'unavailable'),
        is_available: d.is_available,
        order_index: d.order_index,
        preparation_time_mins: d.preparation_time_mins || 15,
        created_by: d.created_by || 'system',
        created_at: new Date(d.created_at),
        updated_at: new Date(d.updated_at),
      }));
    } catch (err: any) {
      console.warn('Prisma getMenuItems error:', err.message);
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
      const dbCats = await prisma.menuCategory.findMany({
        where: { business_id: businessId },
        orderBy: { order: 'asc' },
      });
      return dbCats.map((d: any) => ({
        id: d.id,
        business_id: d.business_id,
        name: d.name,
        created_at: new Date(d.created_at),
        updated_at: new Date(d.updated_at),
      }));
    } catch (err: any) {
      console.warn('Prisma getCategories error:', err.message);
      return [];
    }
  }

  /**
   * Creates a new menu category: Admin/Manager only
   */
  public async createCategory(
    businessId: string,
    data: { name: string; order?: number },
    user: { id: string; role?: string; email?: string }
  ): Promise<MenuCategory> {
    const access = this.evaluateAccess(user, 'menus', 'create');
    if (!access.granted) {
      throw new Error(access.reason || 'Permission denied: Manager role required to create categories.');
    }

    const trimmedName = data.name.trim();

    // Check if category with this name already exists for this business
    const existing = await prisma.menuCategory.findFirst({
      where: {
        business_id: businessId,
        name: { equals: trimmedName, mode: 'insensitive' },
      },
    });

    if (existing) {
      return {
        id: existing.id,
        business_id: existing.business_id,
        name: existing.name,
        created_at: new Date(existing.created_at),
        updated_at: new Date(existing.updated_at),
      };
    }

    const catId = generateCategoryDocId(trimmedName, businessId);
    const created = await prisma.menuCategory.create({
      data: {
        id: catId,
        business_id: businessId,
        name: trimmedName,
        order: data.order ?? 0,
      },
    });

    const newCategory: MenuCategory = {
      id: created.id,
      business_id: created.business_id,
      name: created.name,
      created_at: new Date(created.created_at),
      updated_at: new Date(created.updated_at),
    };

    realtimeEmitter.menuUpdated(businessId);
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

    const existing = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
    if (!existing || existing.business_id !== businessId) {
      throw new Error(`Category not found in venue '${businessId}'.`);
    }

    try {
      await prisma.menuCategory.update({
        where: { id: categoryId },
        data: { name: data.name.trim() },
      });
    } catch (e: any) {
      console.warn('Prisma updateCategory error:', e.message);
    }

    realtimeEmitter.menuUpdated(businessId);
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

    const existing = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
    if (!existing || existing.business_id !== businessId) {
      throw new Error(`Category not found in venue '${businessId}'.`);
    }

    try {
      await prisma.menuCategory.delete({
        where: { id: categoryId },
      });
    } catch (e: any) {
      console.warn('Prisma deleteCategory error:', e.message);
    }

    realtimeEmitter.menuUpdated(businessId);
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

    let itemStatus = itemData.status || (itemData.is_available === false ? 'unavailable' : 'available');
    let isAvailable = itemData.is_available !== false && itemStatus === 'available';
    if (itemData.is_available === false) {
      isAvailable = false;
      if (itemStatus === 'available') {
        itemStatus = 'unavailable';
      }
    } else if (itemStatus === 'out_of_stock' || itemStatus === 'unavailable') {
      isAvailable = false;
    }

    const docId = generateMenuDocId(itemData.name.trim(), businessId);

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
      is_available: isAvailable,
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

    // Save to Prisma PostgreSQL
    try {
      await prisma.menuItem.create({
        data: {
          id: newItem.id,
          business_id: businessId,
          name: newItem.name,
          category: newItem.category,
          category_id: newItem.category_id || null,
          additional_categories: newItem.additional_categories || [],
          price: newItem.price,
          currency: newItem.currency,
          description: newItem.description || '',
          image_url: newItem.image_url || '',
          food_type: newItem.food_type || 'non-veg',
          status: newItem.status,
          is_available: newItem.is_available,
          has_variants: newItem.has_variants,
          variants: (newItem.variants as any) || [],
          variant_group_name: (itemData as any).variant_group_name || (itemData.name ? undefined : null),
          display_style: newItem.display_style || 'auto',
          show_image: newItem.show_image ?? true,
          promo_badge: newItem.promo_badge || null,
          order_index: newItem.order_index ?? 0,
          preparation_time_mins: newItem.preparation_time_mins || 15,
          created_by: user.id,
        },
      });
    } catch (e: any) {
      console.warn('Prisma createMenuItem error:', e.message);
    }

    realtimeEmitter.menuUpdated(businessId);
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

    const existing = await prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.business_id !== businessId) {
      throw new Error(`Menu item not found in venue '${businessId}'.`);
    }

    try {
      const prismaData: any = {};
      if (updates.name !== undefined) prismaData.name = updates.name.trim();
      if (updates.category !== undefined) prismaData.category = updates.category.trim();
      if (updates.category_id !== undefined) prismaData.category_id = updates.category_id;
      if (updates.additional_categories !== undefined) prismaData.additional_categories = updates.additional_categories;
      if (updates.price !== undefined) prismaData.price = Number(updates.price);
      if (updates.currency !== undefined) prismaData.currency = updates.currency;
      if (updates.description !== undefined) prismaData.description = updates.description;
      if (updates.image_url !== undefined) prismaData.image_url = updates.image_url;
      if (updates.food_type !== undefined) prismaData.food_type = updates.food_type;
      if (updates.is_available !== undefined && updates.status !== undefined) {
        prismaData.is_available = updates.is_available && updates.status === 'available';
        prismaData.status = !prismaData.is_available && updates.status === 'available' ? 'unavailable' : updates.status;
      } else if (updates.status !== undefined) {
        prismaData.status = updates.status;
        prismaData.is_available = updates.status === 'available';
      } else if (updates.is_available !== undefined) {
        prismaData.is_available = updates.is_available;
        prismaData.status = updates.is_available ? 'available' : 'unavailable';
      }
      if (updates.has_variants !== undefined) prismaData.has_variants = updates.has_variants;
      if (updates.variants !== undefined) prismaData.variants = updates.variants;
      if (updates.variant_group_name !== undefined) prismaData.variant_group_name = updates.variant_group_name;
      if (updates.display_style !== undefined) prismaData.display_style = updates.display_style;
      if (updates.show_image !== undefined) prismaData.show_image = updates.show_image;
      if (updates.promo_badge !== undefined) prismaData.promo_badge = updates.promo_badge;
      if (updates.order_index !== undefined) prismaData.order_index = updates.order_index;
      if (updates.preparation_time_mins !== undefined) prismaData.preparation_time_mins = updates.preparation_time_mins;

      await prisma.menuItem.update({
        where: { id: itemId },
        data: prismaData,
      });
    } catch (e: any) {
      console.warn('Prisma updateMenuItem error:', e.message);
    }

    realtimeEmitter.menuUpdated(businessId);
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

    const existing = await prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.business_id !== businessId) {
      throw new Error(`Menu item not found in venue '${businessId}'.`);
    }

    try {
      await prisma.menuItem.delete({
        where: { id: itemId },
      });
    } catch (e: any) {
      console.warn('Prisma deleteMenuItem error:', e.message);
    }

    realtimeEmitter.menuUpdated(businessId);
  }

  // =========================================================================
  // CHECK-INS COLLECTION (Restricted by RBAC)
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
      const where: any = { business_id: businessId };
      if (filters?.status) where.status = filters.status;
      const records = await prisma.checkIn.findMany({
        where,
        orderBy: { created_at: 'desc' },
      });
      return records.map((d: any) => ({
        id: d.id,
        business_id: d.business_id,
        guest_name: d.guest_name,
        guest_phone: d.guest_phone || '',
        guest_email: d.guest_email || '',
        room_or_table_number: d.room_or_table_number,
        check_in_date: new Date(d.check_in_date),
        check_out_date: d.check_out_date ? new Date(d.check_out_date) : null,
        status: d.status as CheckInStatus,
        total_amount: Number(d.total_amount) || 0,
        deposit_paid: Number(d.deposit_paid) || 0,
        notes: d.notes || '',
        handled_by_user_id: d.handled_by_user_id || user.id,
        created_at: new Date(d.created_at),
        updated_at: new Date(d.updated_at),
      }));
    } catch (err: any) {
      console.warn('getCheckIns error:', err.message);
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

    try {
      await db.ensureBusiness(businessId);
      await prisma.checkIn.create({
        data: {
          id: newCheckIn.id,
          business_id: businessId,
          guest_name: newCheckIn.guest_name,
          guest_phone: newCheckIn.guest_phone,
          guest_email: newCheckIn.guest_email,
          room_or_table_number: newCheckIn.room_or_table_number,
          check_in_date: newCheckIn.check_in_date,
          check_out_date: null,
          status: newCheckIn.status,
          total_amount: newCheckIn.total_amount,
          deposit_paid: newCheckIn.deposit_paid,
          notes: newCheckIn.notes,
          handled_by_user_id: user.id,
        },
      });
    } catch (e: any) {
      console.warn('Prisma createCheckIn error:', e.message);
    }

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

    const existing = await prisma.checkIn.findUnique({ where: { id: checkInId } });
    if (!existing || existing.business_id !== businessId) {
      throw new Error(`Check-in record not found in venue '${businessId}'.`);
    }

    const prismaData: any = {};
    if (updates.guest_name !== undefined) prismaData.guest_name = updates.guest_name.trim();
    if (updates.guest_phone !== undefined) prismaData.guest_phone = updates.guest_phone;
    if (updates.guest_email !== undefined) prismaData.guest_email = updates.guest_email;
    if (updates.room_or_table_number !== undefined) prismaData.room_or_table_number = updates.room_or_table_number;
    if (updates.check_in_date !== undefined) prismaData.check_in_date = new Date(updates.check_in_date);
    if (updates.check_out_date !== undefined) prismaData.check_out_date = updates.check_out_date ? new Date(updates.check_out_date) : null;
    if (updates.status !== undefined) prismaData.status = updates.status;
    if (updates.total_amount !== undefined) prismaData.total_amount = Number(updates.total_amount);
    if (updates.deposit_paid !== undefined) prismaData.deposit_paid = Number(updates.deposit_paid);
    if (updates.notes !== undefined) prismaData.notes = updates.notes;
    if (updates.handled_by_user_id !== undefined) prismaData.handled_by_user_id = updates.handled_by_user_id;

    try {
      await prisma.checkIn.update({
        where: { id: checkInId },
        data: prismaData,
      });
    } catch (e: any) {
      console.warn('Prisma updateCheckIn error:', e.message);
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

    const existing = await prisma.checkIn.findUnique({ where: { id: checkInId } });
    if (!existing || existing.business_id !== businessId) {
      throw new Error(`Check-in record not found in venue '${businessId}'.`);
    }

    try {
      await prisma.checkIn.delete({
        where: { id: checkInId },
      });
    } catch (e: any) {
      console.warn('Prisma deleteCheckIn error:', e.message);
    }
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
    await db.ensureBusiness(businessId);
    for (let i = 0; i < categoryNames.length; i++) {
      const name = categoryNames[i];
      let cat = await prisma.menuCategory.findFirst({
        where: { business_id: businessId, name: { equals: name, mode: 'insensitive' } },
      });
      if (!cat) {
        const catId = generateCategoryDocId(name, businessId);
        cat = await prisma.menuCategory.create({
          data: {
            id: catId,
            business_id: businessId,
            name,
            order: i,
          },
        }).catch(() => null as any);
      }
      if (cat) {
        results.push({
          id: cat.id,
          business_id: cat.business_id,
          name: cat.name,
          created_at: new Date(cat.created_at),
          updated_at: new Date(cat.updated_at),
        });
      }
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
    await db.ensureBusiness(businessId);
    for (const d of defaults) {
      let existing = await prisma.menuItem.findFirst({
        where: { business_id: businessId, name: { equals: d.name, mode: 'insensitive' } },
      });
      if (existing) {
        results.push({
          id: existing.id,
          business_id: existing.business_id,
          name: existing.name,
          category: existing.category,
          price: Number(existing.price),
          currency: existing.currency,
          description: existing.description || '',
          image_url: existing.image_url || '',
          food_type: (existing.food_type as any) || 'veg',
          status: (existing.status as any) || 'available',
          is_available: existing.is_available,
          created_by: existing.created_by || userId,
          created_at: new Date(existing.created_at),
          updated_at: new Date(existing.updated_at),
        });
        continue;
      }

      const docId = generateMenuDocId(d.name, businessId);
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
      await prisma.menuItem.create({
        data: {
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
        },
      }).catch(() => {});
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
    await db.ensureBusiness(businessId);
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
      await prisma.checkIn.upsert({
        where: { id: docId },
        create: {
          id: docId,
          business_id: businessId,
          guest_name: d.guest_name,
          guest_phone: d.guest_phone,
          guest_email: d.guest_email,
          room_or_table_number: d.room_or_table_number,
          check_in_date: d.check_in_date,
          status: d.status,
          total_amount: d.total_amount,
          deposit_paid: d.deposit_paid,
          notes: d.notes,
          handled_by_user_id: userId,
        },
        update: {
          guest_name: d.guest_name,
          room_or_table_number: d.room_or_table_number,
        },
      }).catch(() => {});
      results.push(ci);
    }
    return results;
  }

  // =========================================================================
  // TABLES & DIGITAL ORDERING
  // =========================================================================

  /**
   * Fetch all tables for a business
   */
  public async getTables(
    businessId: string,
    user?: { id: string; role?: string; email?: string }
  ): Promise<RestaurantTable[]> {
    try {
      const dbTables = await prisma.restaurantTable.findMany({
        where: { business_id: businessId },
      });
      const tables: RestaurantTable[] = dbTables.map((d: any) => ({
        id: d.id,
        business_id: d.business_id,
        table_number: d.table_number,
        order_number: d.order_number || undefined,
        invoice_number: d.invoice_number || undefined,
        floor: d.floor ?? null,
        building: d.building ?? null,
        capacity: d.capacity || 4,
        status: (d.status as TableStatus) || 'ACTIVE',
        pay_first_enabled: Boolean(d.pay_first_enabled),
        qr_code_url: d.qr_code_url || '',
        last_scanned_at: d.last_scanned_at ? new Date(d.last_scanned_at) : null,
        current_session_id: d.current_session_id || null,
        host_token: d.host_token || null,
        created_at: new Date(d.created_at),
        updated_at: new Date(d.updated_at),
      }));

      tables.sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true, sensitivity: 'base' }));
      return tables;
    } catch (err: any) {
      console.warn('Prisma getTables error:', err.message);
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

    try {
      await db.ensureBusiness(businessId);
      await prisma.restaurantTable.upsert({
        where: { id: newTable.id },
        create: {
          id: newTable.id,
          business_id: businessId,
          table_number: newTable.table_number,
          floor: newTable.floor,
          building: newTable.building,
          capacity: newTable.capacity,
          status: newTable.status,
          pay_first_enabled: newTable.pay_first_enabled,
          qr_code_url: newTable.qr_code_url,
        },
        update: {
          table_number: newTable.table_number,
          floor: newTable.floor,
          building: newTable.building,
          capacity: newTable.capacity,
          status: newTable.status,
          pay_first_enabled: newTable.pay_first_enabled,
        },
      });
    } catch (e: any) {
      console.warn('Prisma createTable error:', e.message);
    }

    auditService.log({
      userId: user.id,
      email: user.email,
      businessId,
      eventType: 'TABLE_CREATED',
      status: 'ONLINE',
    });

    realtimeEmitter.tableUpdated(businessId, newTable);
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

    const existingTable = await prisma.restaurantTable.findUnique({ where: { id: tableId } });
    if (existingTable && existingTable.business_id !== businessId) {
      throw new Error(`Table not found in venue '${businessId}'.`);
    }

    try {
      await db.ensureBusiness(businessId);
      const tableUpdates: any = {};
      if (updates.table_number) {
        tableUpdates.table_number = updates.table_number.trim();
        tableUpdates.qr_code_url = `/menu?businessId=${encodeURIComponent(businessId)}&tableId=${encodeURIComponent(tableId)}&tableNumber=${encodeURIComponent(updates.table_number.trim())}`;
      }
      if (updates.floor !== undefined) tableUpdates.floor = updates.floor ? updates.floor.trim() : null;
      if (updates.building !== undefined) tableUpdates.building = updates.building ? updates.building.trim() : null;
      if (updates.capacity !== undefined) tableUpdates.capacity = Number(updates.capacity);
      if (updates.status !== undefined) tableUpdates.status = updates.status;
      if (updates.pay_first_enabled !== undefined) tableUpdates.pay_first_enabled = Boolean(updates.pay_first_enabled);

      await prisma.restaurantTable.upsert({
        where: { id: tableId },
        create: {
          id: tableId,
          business_id: businessId,
          table_number: updates.table_number ? updates.table_number.trim() : tableId,
          floor: updates.floor ? updates.floor.trim() : null,
          building: updates.building ? updates.building.trim() : null,
          capacity: updates.capacity ? Number(updates.capacity) : 4,
          status: updates.status || 'ACTIVE',
          pay_first_enabled: Boolean(updates.pay_first_enabled),
          qr_code_url: `/menu?businessId=${encodeURIComponent(businessId)}&tableId=${encodeURIComponent(tableId)}&tableNumber=${encodeURIComponent((updates.table_number || tableId).trim())}`,
        },
        update: tableUpdates,
      });
    } catch (e: any) {
      console.warn('Prisma updateTable error:', e.message);
    }

    auditService.log({
      userId: user.id,
      email: user.email,
      businessId,
      eventType: 'TABLE_UPDATED',
      status: 'ONLINE',
    });

    realtimeEmitter.tableUpdated(businessId, { id: tableId, ...updates });
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

    try {
      await prisma.restaurantTable.updateMany({
        where: { id: tableId, business_id: businessId },
        data: { status },
      });
    } catch (e: any) {
      console.warn('Prisma updateTableStatus error:', e.message);
    }

    realtimeEmitter.tableUpdated(businessId, { id: tableId, status });
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

    try {
      const resetData = {
        status: 'ACTIVE',
        current_session_id: null,
        host_token: null,
        last_scanned_at: null,
      };
      await prisma.restaurantTable.updateMany({
        where: {
          business_id: businessId,
          OR: [
            ...(tableId ? [{ id: tableId }] : []),
            ...(tableNumber ? [{ table_number: tableNumber }] : []),
          ],
        },
        data: resetData,
      });
      await prisma.tableOrder.updateMany({
        where: {
          business_id: businessId,
          OR: [
            ...(tableId ? [{ table_id: tableId }] : []),
            ...(tableNumber ? [{ table_number: tableNumber }] : []),
          ],
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        data: {
          status: 'COMPLETED',
          bill_requested: false,
          updated_at: now,
        },
      });
    } catch (e: any) {
      console.warn('Prisma resetTableToDefault error:', e.message);
    }

    auditService.log({
      userId: 'customer-bill',
      email: 'guest@namasteqr.com',
      businessId,
      eventType: 'TABLE_STATUS_RESET_ACTIVE',
      status: 'ONLINE',
    });

    realtimeEmitter.tableUpdated(businessId, { id: tableId, table_number: tableNumber, status: 'ACTIVE' });
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

    const existing = await prisma.restaurantTable.findUnique({ where: { id: tableId } });
    if (!existing || existing.business_id !== businessId) {
      throw new Error(`Table not found in venue '${businessId}'.`);
    }

    try {
      await prisma.restaurantTable.delete({
        where: { id: tableId },
      });
    } catch (e: any) {
      console.warn('Prisma deleteTable error:', e.message);
    }

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

    try {
      await prisma.restaurantTable.updateMany({
        where: { id: tableId, business_id: businessId },
        data: {
          status: 'ACTIVE',
          current_session_id: null,
          host_token: null,
          last_scanned_at: null,
        },
      });
      await prisma.tableOrder.updateMany({
        where: {
          business_id: businessId,
          table_id: tableId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        data: {
          status: 'COMPLETED',
          bill_requested: false,
          updated_at: now,
        },
      });
    } catch (e: any) {
      console.warn('Prisma resetTableSession error:', e.message);
    }

    let targetTable = await prisma.restaurantTable.findUnique({ where: { id: tableId } });
    if (!targetTable) {
      targetTable = await prisma.restaurantTable.findFirst({
        where: { business_id: businessId, table_number: tableId },
      });
    }

    if (!targetTable) {
      throw new Error(`Table ${tableId} not found`);
    }

    const actualTableId = targetTable.id;
    const actualTableNumber = targetTable.table_number;

    auditService.log({
      userId: user?.id || 'manager',
      email: user?.email || 'manager@namasteqr.com',
      businessId,
      eventType: 'TABLE_SESSION_CLEARED_BY_STAFF',
      status: 'ONLINE',
    });

    const resTable: RestaurantTable = {
      id: actualTableId,
      business_id: targetTable.business_id || businessId,
      table_number: targetTable.table_number || 'Table',
      floor: targetTable.floor ?? null,
      building: targetTable.building ?? null,
      capacity: targetTable.capacity || 4,
      status: 'ACTIVE',
      pay_first_enabled: Boolean(targetTable.pay_first_enabled),
      qr_code_url: targetTable.qr_code_url || '',
      last_scanned_at: null,
      current_session_id: null,
      host_token: null,
      created_at: new Date(targetTable.created_at),
      updated_at: now,
    };
    realtimeEmitter.tableUpdated(businessId, resTable);
    return resTable;
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
    await db.ensureBusiness(businessId);

    let existingTable = await prisma.restaurantTable.findUnique({ where: { id: tableId } });
    if (!existingTable && metadata?.tableNumber) {
      existingTable = await prisma.restaurantTable.findFirst({
        where: { business_id: businessId, table_number: metadata.tableNumber },
      });
    }

    const now = new Date();
    let tableData: RestaurantTable;
    let isHost = false;
    let hostToken: string | null = null;
    let sessionId: string;

    if (existingTable) {
      const existingSessionId = existingTable.current_session_id;
      const existingHostToken = existingTable.host_token;
      const lastScannedMs = existingTable.last_scanned_at ? new Date(existingTable.last_scanned_at).getTime() : 0;
      const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
      const isSessionLive = existingTable.status === 'OCCUPIED' && existingSessionId && (lastScannedMs > fourHoursAgo);

      // Check if there are actual active, unsettled orders on this table
      let hasActiveOrders = false;
      try {
        const activeOrders = await prisma.tableOrder.findMany({
          where: {
            business_id: businessId,
            OR: [
              { table_id: existingTable.id },
              { table_number: existingTable.table_number },
            ],
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
        });
        hasActiveOrders = activeOrders.length > 0;
      } catch (e) {}

      const isSessionRecent = (Date.now() - lastScannedMs) < (15 * 60 * 1000); // 15 mins
      if (isSessionLive && (hasActiveOrders || isSessionRecent)) {
        sessionId = existingSessionId;

        if (metadata?.existingHostToken && metadata.existingHostToken === existingHostToken) {
          isHost = true;
          hostToken = existingHostToken;
        } else {
          isHost = false;
          hostToken = null;
        }

        tableData = {
          id: existingTable.id,
          business_id: existingTable.business_id || businessId,
          table_number: existingTable.table_number || metadata?.tableNumber || 'Table',
          floor: existingTable.floor ?? null,
          building: existingTable.building ?? null,
          capacity: existingTable.capacity || 4,
          status: 'OCCUPIED',
          qr_code_url: existingTable.qr_code_url || '',
          last_scanned_at: existingTable.last_scanned_at ? new Date(existingTable.last_scanned_at) : now,
          current_session_id: sessionId,
          host_token: isHost ? hostToken : null,
          created_at: new Date(existingTable.created_at),
          updated_at: now,
        };
      } else {
        sessionId = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        hostToken = `host-${crypto.randomBytes(12).toString('hex')}`;
        isHost = true;

        // Archive any leftover uncompleted orders from previous session on this table
        try {
          await prisma.tableOrder.updateMany({
            where: {
              business_id: businessId,
              OR: [
                { table_id: existingTable.id },
                { table_number: existingTable.table_number },
              ],
              status: { notIn: ['COMPLETED', 'CANCELLED'] },
            },
            data: {
              status: 'COMPLETED',
              bill_requested: false,
              updated_at: now,
            },
          });
        } catch (e) {}

        tableData = {
          id: existingTable.id,
          business_id: existingTable.business_id || businessId,
          table_number: existingTable.table_number || metadata?.tableNumber || 'Table',
          floor: existingTable.floor ?? null,
          building: existingTable.building ?? null,
          capacity: existingTable.capacity || 4,
          status: 'OCCUPIED',
          qr_code_url: existingTable.qr_code_url || '',
          last_scanned_at: now,
          current_session_id: sessionId,
          host_token: hostToken,
          created_at: new Date(existingTable.created_at),
          updated_at: now,
        };
      }
    } else {
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
    }

    try {
      await prisma.restaurantTable.upsert({
        where: { id: tableData.id },
        create: {
          id: tableData.id,
          business_id: businessId,
          table_number: tableData.table_number,
          floor: tableData.floor,
          building: tableData.building,
          capacity: tableData.capacity,
          status: tableData.status,
          current_session_id: sessionId,
          host_token: hostToken,
          last_scanned_at: now,
          qr_code_url: tableData.qr_code_url,
        },
        update: {
          status: tableData.status,
          current_session_id: sessionId,
          host_token: hostToken,
          last_scanned_at: now,
        },
      });
    } catch (e: any) {
      console.warn('Prisma scanTableCheckIn upsert error:', e.message);
    }

    const biz = await db.findBusinessById(businessId);

    auditService.log({
      userId: `customer-${sessionId}`,
      email: isHost ? 'host@namasteqr.com' : 'guest-viewer@namasteqr.com',
      businessId,
      eventType: isHost ? 'QR_TABLE_SCANNED_HOST' : 'QR_TABLE_SCANNED_GUEST',
      status: 'ONLINE',
    });

    realtimeEmitter.tableUpdated(businessId, tableData);
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

    // 1. Check if there is an active unsettled order for this table/session in Prisma
    let existingDocSnap: any = null;
    let targetOrderId = orderData.existing_order_id;

    if (targetOrderId) {
      try {
        const snap = await prisma.tableOrder.findUnique({ where: { id: targetOrderId } });
        if (snap && !snap.bill_requested && snap.status !== 'COMPLETED' && snap.status !== 'CANCELLED') {
          existingDocSnap = { data: () => snap, id: snap.id };
        }
      } catch (e) {
        console.warn('Existing order ID lookup note:', e);
      }
    }

    // Fallback search: find active unsettled order for this table from the last 12 hours
    if (!existingDocSnap && (orderData.table_id || orderData.table_number)) {
      try {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        const candidates = await prisma.tableOrder.findMany({
          where: {
            business_id: businessId,
            OR: [
              ...(orderData.table_id ? [{ table_id: orderData.table_id }] : []),
              ...(orderData.table_number ? [{ table_number: orderData.table_number }] : []),
            ],
            bill_requested: false,
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            created_at: { gte: twelveHoursAgo },
          },
          orderBy: { created_at: 'desc' },
          take: 1,
        });
        if (candidates.length > 0) {
          const snap = candidates[0];
          existingDocSnap = { data: () => snap, id: snap.id };
          targetOrderId = snap.id;
        }
      } catch (e) {
        console.warn('Active table order search note:', e);
      }
    }

    let tableDocData: any = null;

    // Session Security Enforcement: Validate table session is active and not settled/expired
    if (orderData.table_id && orderData.table_id !== 'walk-in' && orderData.table_id !== 'takeout') {
      try {
        let tableSnap = await prisma.restaurantTable.findUnique({ where: { id: orderData.table_id } });
        if (!tableSnap && orderData.table_number) {
          tableSnap = await prisma.restaurantTable.findFirst({
            where: { business_id: businessId, table_number: orderData.table_number },
          });
        }

        if (tableSnap) {
          tableDocData = tableSnap;

          // If table has been reset to ACTIVE (settled / paid / cleared) and no explicit order id provided:
          if (tableSnap.status === 'ACTIVE' && !orderData.existing_order_id) {
            existingDocSnap = null;
            targetOrderId = undefined;
          }
          if (tableSnap.pay_first_enabled) {
            existingDocSnap = null;
            targetOrderId = undefined;
          } else if (existingDocSnap) {
            const exData = existingDocSnap.data();
            if (exData.session_id && tableSnap.current_session_id && exData.session_id !== tableSnap.current_session_id) {
              existingDocSnap = null;
              targetOrderId = undefined;
            }
          }

          // If table session is older than 4 hours without active orders:
          if (tableSnap.last_scanned_at && !existingDocSnap) {
            const lastScannedMs = new Date(tableSnap.last_scanned_at).getTime();
            const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
            if (lastScannedMs < fourHoursAgo) {
              throw new Error('Table QR session has expired (timeout). Please scan the live QR code on your table.');
            }
          }
          // Validate Host ordering authority: Only the Table Host who first scanned can place orders
          if (tableSnap.host_token) {
            if (!orderData.host_token || orderData.host_token !== tableSnap.host_token) {
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

    // Security Hardening: verify item prices against the database menu item records to prevent client pricing tampering
    const itemIds = orderData.items.map((it: any) => it.item_id || it.id).filter(Boolean);
    const itemNames = orderData.items.map((it: any) => it.name).filter(Boolean);

    let dbMenuItems: any[] = [];
    try {
      dbMenuItems = await prisma.menuItem.findMany({
        where: {
          business_id: businessId,
          OR: [
            ...(itemIds.length ? [{ id: { in: itemIds } }] : []),
            ...(itemNames.length ? [{ name: { in: itemNames } }] : []),
          ],
        },
      });
    } catch (e: any) {
      console.warn('DB menu items lookup for price verification note:', e.message);
    }

    const itemMapById = new Map<string, any>();
    const itemMapByName = new Map<string, any>();
    for (const m of dbMenuItems) {
      itemMapById.set(m.id, m);
      if (m.name) itemMapByName.set(m.name.toLowerCase().trim(), m);
    }

    // Format incoming new items with verified prices
    const newItems: TableOrderItem[] = orderData.items.map((item: any, idx: number) => {
      const dbItem = (item.item_id && itemMapById.get(item.item_id)) ||
                     (item.id && itemMapById.get(item.id)) ||
                     (item.name && itemMapByName.get(item.name.toLowerCase().trim()));

      // Backend security validation: Throw 400 error if item is marked out of stock or unavailable
      const hasDbVariants = dbItem && Array.isArray(dbItem.variants) && dbItem.variants.length > 0;
      const areAllDbVariantsOOS = hasDbVariants && dbItem.variants.every(
        (v: any) => v.is_available === false || v.status === 'out_of_stock' || v.status === 'unavailable'
      );

      const hasItemVariants = Array.isArray(item.variants) && item.variants.length > 0;
      const areAllItemVariantsOOS = hasItemVariants && item.variants.every(
        (v: any) => v.is_available === false || v.status === 'out_of_stock' || v.status === 'unavailable'
      );

      const isItemOOS =
        (dbItem && (dbItem.status === 'out_of_stock' || dbItem.status === 'unavailable' || dbItem.is_available === false || areAllDbVariantsOOS)) ||
        (item.status === 'out_of_stock' || item.status === 'unavailable' || item.is_available === false || areAllItemVariantsOOS);
      if (isItemOOS) {
        const itemName = dbItem?.name || item.name || 'Selected item';
        const err: any = new Error(`Item "${itemName}" is currently out of stock or unavailable.`);
        err.statusCode = 400;
        err.code = 'ITEM_OUT_OF_STOCK';
        throw err;
      }

      let verifiedPrice = Number(item.price) || 0;
      if (dbItem) {
        let matchedVariantPrice: number | null = null;
        const variantKey =
          item.variant_id ||
          item.variant_name ||
          (typeof item.variant === 'string' ? item.variant : item.variant?.id || item.variant?.name) ||
          (typeof item.selected_variant === 'string' ? item.selected_variant : item.selected_variant?.id || item.selected_variant?.name);
        if (variantKey && Array.isArray(dbItem.variants)) {
          const normalizedKey = String(variantKey).trim().toLowerCase();
          const v = (dbItem.variants as any[]).find(
            (vr: any) =>
              vr.id === variantKey ||
              String(vr.id || '').trim().toLowerCase() === normalizedKey ||
              String(vr.name || '').trim().toLowerCase() === normalizedKey
          );
          if (v) {
            if (v.is_available === false || v.status === 'out_of_stock' || v.status === 'unavailable') {
              const err: any = new Error(`Option "${v.name}" for "${dbItem.name || item.name}" is currently out of stock or unavailable.`);
              err.statusCode = 400;
              err.code = 'ITEM_OUT_OF_STOCK';
              throw err;
            }
            if (v.price != null) {
              matchedVariantPrice = Number(v.price);
            }
          }
        }
        if (matchedVariantPrice != null) {
          verifiedPrice = matchedVariantPrice;
        } else {
          verifiedPrice = Number(dbItem.price);
        }
      }

      const rawVariant = typeof item.selected_variant === 'object' ? item.selected_variant : typeof item.variant === 'object' ? item.variant : null;
      if (rawVariant && (rawVariant.is_available === false || rawVariant.status === 'out_of_stock' || rawVariant.status === 'unavailable')) {
        const err: any = new Error(`Option "${rawVariant.name || 'selected option'}" for "${dbItem?.name || item.name}" is currently out of stock or unavailable.`);
        err.statusCode = 400;
        err.code = 'ITEM_OUT_OF_STOCK';
        throw err;
      }

      verifiedPrice = Math.max(0, verifiedPrice || 0);

      return {
        ...item,
        price: verifiedPrice,
        item_key: item.item_key || `${item.item_id || 'dish'}_${now.getTime()}_${idx}`,
        station: item.station || this.determineItemStation(item),
        status: (tableDocData?.pay_first_enabled ? 'AWAITING_PAYMENT' : 'RECEIVED') as OrderStatus,
        ready_at: null,
        served_at: null,
        ordered_at: item.ordered_at || now.toISOString(),
      };
    });

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

      try {
        await prisma.tableOrder.upsert({
          where: { id: updatedOrder.id },
          create: {
            id: updatedOrder.id,
            business_id: businessId,
            table_id: updatedOrder.table_id || null,
            table_number: updatedOrder.table_number,
            order_number: updatedOrder.order_number,
            floor: updatedOrder.floor ?? null,
            building: updatedOrder.building ?? null,
            items: updatedOrder.items as any,
            subtotal: updatedOrder.subtotal,
            tax_amount: updatedOrder.tax_amount || 0,
            total_amount: updatedOrder.total_amount,
            currency: updatedOrder.currency || 'Rs.',
            customer_name: updatedOrder.customer_name || 'Guest',
            customer_phone: updatedOrder.customer_phone || '',
            order_notes: updatedOrder.order_notes || '',
            status: updatedOrder.status,
            pay_first: updatedOrder.pay_first || false,
            session_id: updatedOrder.session_id || null,
            taxes: (updatedOrder.taxes as any) || [],
            promo_code: updatedOrder.promo_code || null,
            promo_discount: updatedOrder.promo_discount || 0,
          },
          update: {
            items: updatedOrder.items as any,
            subtotal: updatedOrder.subtotal,
            tax_amount: updatedOrder.tax_amount || 0,
            total_amount: updatedOrder.total_amount,
            status: updatedOrder.status,
            ready_at: null,
            served_at: null,
            bill_requested: false,
            updated_at: now,
            order_notes: updatedOrder.order_notes || '',
            taxes: (updatedOrder.taxes as any) || [],
            promo_code: updatedOrder.promo_code || null,
            promo_discount: updatedOrder.promo_discount || 0,
          },
        });
      } catch (e: any) {
        console.warn('Prisma createTableOrder update error:', e.message);
      }

      // Keep table occupied
      if (updatedOrder.table_id) {
        try {
          await prisma.restaurantTable.updateMany({
            where: { id: updatedOrder.table_id },
            data: {
              status: 'OCCUPIED',
              current_session_id: updatedOrder.session_id || updatedOrder.id,
            },
          });
        } catch (e) {}
      }

      auditService.log({
        userId: `order-${updatedOrder.customer_name}`,
        email: 'guest@namasteqr.com',
        eventType: 'DIGITAL_ORDER_ITEMS_APPENDED',
        status: 'ONLINE',
      });

      realtimeEmitter.orderUpdated(businessId, updatedOrder);
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

    try {
      await db.ensureBusiness(businessId);
      if (order.table_id) {
        const tExists = await prisma.restaurantTable.findUnique({ where: { id: order.table_id } });
        if (!tExists) {
          await prisma.restaurantTable.create({
            data: {
              id: order.table_id,
              business_id: businessId,
              table_number: order.table_number || 'T-1',
              status: 'ACTIVE',
            },
          }).catch(() => {});
        }
      }
      await prisma.tableOrder.upsert({
        where: { id: order.id },
        create: {
          id: order.id,
          business_id: businessId,
          table_id: order.table_id || null,
          table_number: order.table_number,
          order_number: order.order_number,
          floor: order.floor ?? null,
          building: order.building ?? null,
          items: order.items as any,
          subtotal: order.subtotal,
          tax_amount: order.tax_amount || 0,
          total_amount: order.total_amount,
          currency: order.currency || 'Rs.',
          customer_name: order.customer_name || 'Guest',
          customer_phone: order.customer_phone || '',
          order_notes: order.order_notes || '',
          status: order.status,
          pay_first: order.pay_first || false,
          payment_status: order.payment_status || null,
          session_id: order.session_id || null,
          taxes: (order.taxes as any) || [],
        },
        update: {
          items: order.items as any,
          subtotal: order.subtotal,
          tax_amount: order.tax_amount || 0,
          total_amount: order.total_amount,
          status: order.status,
        },
      });
    } catch (e: any) {
      console.warn('Prisma createTableOrder insert error:', e.message);
    }

    // Make sure the table remains OCCUPIED
    if (order.table_id) {
      try {
        await prisma.restaurantTable.updateMany({
          where: { id: order.table_id },
          data: {
            status: 'OCCUPIED',
            current_session_id: order.session_id || order.id,
          },
        });
      } catch (e) {}
    }

    auditService.log({
      userId: `order-${order.customer_name}`,
      email: 'guest@namasteqr.com',
      eventType: 'DIGITAL_ORDER_PLACED',
      status: 'ONLINE',
    });

    realtimeEmitter.orderCreated(businessId, order);
    return order;
  }

  /**
   * Get table orders
   * Note: Automatically purges orders older than 24 hours to avoid data buildup
   */
  public async getTableOrders(
    businessId: string,
    user: { id: string; role?: string; email?: string },
    tableId?: string
  ): Promise<TableOrder[]> {
    try {
      const dbOrders = await prisma.tableOrder.findMany({
        where: {
          business_id: businessId,
          ...(tableId ? { table_id: tableId } : {}),
        },
        orderBy: { created_at: 'desc' },
      });
      return dbOrders.map((d: any) => ({
        id: d.id,
        business_id: d.business_id,
        table_id: d.table_id || '',
        table_number: d.table_number,
        order_number: d.order_number || undefined,
        floor: d.floor ?? null,
        building: d.building ?? null,
        items: (d.items as any) || [],
        subtotal: Number(d.subtotal) || 0,
        tax_amount: Number(d.tax_amount) || 0,
        total_amount: Number(d.total_amount) || 0,
        currency: d.currency || 'Rs.',
        customer_name: d.customer_name || 'Guest',
        customer_phone: d.customer_phone || '',
        order_notes: d.order_notes || '',
        status: (d.status as OrderStatus) || 'RECEIVED',
        pay_first: Boolean(d.pay_first),
        payment_confirmed_at: d.payment_confirmed_at ? new Date(d.payment_confirmed_at) : null,
        payment_confirmed_by: d.payment_confirmed_by || null,
        sale_id: d.sale_id || null,
        source: d.source || (d.sale_id ? 'POS_MANUAL' : 'QR'),
        pos_sale_id: d.sale_id || null,
        invoice_number: d.invoice_number || null,
        folio_delivered: Boolean(d.folio_delivered),
        folio_delivered_at: d.folio_delivered_at ? new Date(d.folio_delivered_at) : null,
        bill_acknowledged: Boolean(d.bill_acknowledged),
        payment_rejected_reason: d.payment_rejected_reason || null,
        session_id: d.session_id || null,
        bill_requested: Boolean(d.bill_requested),
        bill_requested_at: d.bill_requested_at ? new Date(d.bill_requested_at) : null,
        payment_method: d.payment_method || null,
        payment_status: d.payment_status || null,
        promo_code: d.promo_code || null,
        promo_discount: Number(d.promo_discount) || 0,
        taxes: (d.taxes as any) || [],
        ready_at: d.ready_at ? new Date(d.ready_at) : null,
        served_at: d.served_at ? new Date(d.served_at) : null,
        created_at: new Date(d.created_at),
        updated_at: new Date(d.updated_at),
      }));
    } catch (err: any) {
      console.warn('Prisma getTableOrders error:', err.message);
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
    const currentOrder = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    if (!currentOrder) {
      throw new Error(`Order ${orderId} not found.`);
    }
    if (currentOrder.business_id !== businessId) {
      throw new Error(`Order ${orderId} not found in venue '${businessId}'.`);
    }
    if (currentOrder.pay_first && currentOrder.payment_status === 'UNPAID' && status !== 'CANCELLED') {
      throw new Error('Use the confirm-payment endpoint to process this order.');
    }

    const now = new Date();
    let readyAt = currentOrder.ready_at;
    let servedAt = currentOrder.served_at;
    let nextStatus = status;

    if (status === 'READY' && !readyAt) {
      readyAt = now;
    }
    if (status === 'SERVED' && !servedAt) {
      servedAt = now;
    }
    // Auto-complete pay-first orders when served
    if (status === 'SERVED' && currentOrder.pay_first) {
      nextStatus = 'COMPLETED' as any;
    }

    // If the whole order is marked READY or SERVED, keep line-items in sync
    const items = ((currentOrder.items as any[]) || []).map((it: any) => {
      if (nextStatus === 'READY' && it.status !== 'SERVED') {
        return { ...it, status: 'READY', ready_at: it.ready_at || now.toISOString() };
      }
      if (nextStatus === 'SERVED') {
        return { ...it, status: 'SERVED', served_at: it.served_at || now.toISOString() };
      }
      return it;
    });

    const updated = await prisma.tableOrder.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        items: items as any,
        ready_at: readyAt,
        served_at: servedAt,
      },
    });

    // Reset table session if a pay_first order was completed
    if (nextStatus === 'COMPLETED' && currentOrder.pay_first && currentOrder.table_id) {
      try {
        await prisma.restaurantTable.updateMany({
          where: { id: currentOrder.table_id },
          data: {
            status: 'ACTIVE',
            current_session_id: null,
            host_token: null,
            last_scanned_at: null,
          },
        });
      } catch (e) {}
    }

    auditService.log({
      userId: user?.id || 'staff',
      email: user?.email || 'staff@namasteqr.com',
      businessId,
      eventType: 'ORDER_STATUS_UPDATED',
      status: `STATUS_${nextStatus}`,
    });

    const resOrder: TableOrder = {
      id: updated.id,
      business_id: updated.business_id,
      table_id: updated.table_id || '',
      table_number: updated.table_number,
      floor: updated.floor ?? null,
      building: updated.building ?? null,
      items: (updated.items as any) || [],
      subtotal: Number(updated.subtotal) || 0,
      tax_amount: Number(updated.tax_amount) || 0,
      total_amount: Number(updated.total_amount) || 0,
      currency: updated.currency || 'Rs.',
      customer_name: updated.customer_name || 'Guest',
      customer_phone: updated.customer_phone || '',
      order_notes: updated.order_notes || '',
      status: updated.status as OrderStatus,
      pay_first: Boolean(updated.pay_first),
      payment_status: (updated.payment_status as any) || null,
      payment_method: updated.payment_method || null,
      sale_id: updated.sale_id || null,
      source: updated.source || (updated.sale_id ? 'POS_MANUAL' : 'QR'),
      pos_sale_id: updated.sale_id || null,
      ready_at: updated.ready_at ? new Date(updated.ready_at) : null,
      served_at: updated.served_at ? new Date(updated.served_at) : null,
      created_at: new Date(updated.created_at),
      updated_at: new Date(updated.updated_at),
    };
    realtimeEmitter.orderUpdated(businessId, resOrder);
    return resOrder;
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
    const currentOrder = await prisma.tableOrder.findUnique({ where: { id: orderId } });

    if (!currentOrder) {
      throw new Error(`Order ${orderId} not found.`);
    }
    if (currentOrder.business_id !== businessId) {
      throw new Error(`Order ${orderId} not found in venue '${businessId}'.`);
    }

    const currentData: any = currentOrder;
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
        nextOrderStatus = currentData.pay_first ? ('COMPLETED' as any) : 'SERVED';
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
    if ((nextOrderStatus === 'SERVED' || nextOrderStatus === 'COMPLETED') && !currentData.served_at) {
      updates.served_at = now.toISOString();
    }

    try {
      await prisma.tableOrder.update({
        where: { id: orderId },
        data: {
          items: items as any,
          status: nextOrderStatus,
          subtotal: newSubtotal,
          tax_amount: newTax,
          total_amount: newTotal,
          ...(updates.ready_at ? { ready_at: new Date(updates.ready_at) } : {}),
          ...(updates.served_at ? { served_at: new Date(updates.served_at) } : {}),
        },
      });
    } catch (e: any) {
      console.warn('Prisma updateTableOrderItemStatus error:', e.message);
    }

    // Reset table session if a pay_first order was completed
    if (nextOrderStatus === ('COMPLETED' as any) && currentData.pay_first && currentData.table_id) {
      try {
        await prisma.restaurantTable.updateMany({
          where: { id: currentData.table_id },
          data: {
            status: 'ACTIVE',
            current_session_id: null,
            host_token: null,
            last_scanned_at: null,
          },
        });
      } catch (e) {}
    }

    // If order was cancelled completely, check if table can be marked AVAILABLE
    if (nextOrderStatus === 'CANCELLED' && currentData.table_id) {
      try {
        await prisma.restaurantTable.updateMany({
          where: { id: currentData.table_id },
          data: { status: 'AVAILABLE' },
        });
      } catch (e) {
        console.warn('Table status update on order cancellation note:', e);
      }
    }

    auditService.log({
      userId: user?.id || 'staff',
      email: user?.email || 'staff@namasteqr.com',
      businessId,
      eventType: 'ORDER_ITEM_STATUS_UPDATED',
      status: `ITEM_${targetItem.name}_${newStatus}`,
    });

    const updated = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    const d: any = updated || currentData;
    const resOrder: TableOrder = {
      id: d.id,
      business_id: d.business_id,
      table_id: d.table_id || '',
      table_number: d.table_number,
      floor: d.floor ?? null,
      building: d.building ?? null,
      items: (d.items as any) || [],
      subtotal: Number(d.subtotal) || 0,
      tax_amount: Number(d.tax_amount) || 0,
      taxes: (d.taxes as any) || [],
      total_amount: Number(d.total_amount) || 0,
      currency: d.currency || 'Rs.',
      customer_name: d.customer_name || 'Guest',
      customer_phone: d.customer_phone || '',
      order_notes: d.order_notes || '',
      status: (d.status as OrderStatus) || 'RECEIVED',
      pay_first: Boolean(d.pay_first),
      payment_confirmed_at: d.payment_confirmed_at ? new Date(d.payment_confirmed_at) : null,
      payment_confirmed_by: d.payment_confirmed_by || null,
      sale_id: d.sale_id || null,
      payment_rejected_reason: d.payment_rejected_reason || null,
      ready_at: d.ready_at ? new Date(d.ready_at) : null,
      served_at: d.served_at ? new Date(d.served_at) : null,
      created_at: new Date(d.created_at),
      updated_at: new Date(d.updated_at),
    };
    realtimeEmitter.orderUpdated(businessId, resOrder);
    return resOrder;
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
      const tableId = `tbl-${slugify(businessId)}-${slugify(d.table_number)}-${i + 1}`;
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

      try {
        await db.ensureBusiness(businessId);
        await prisma.restaurantTable.upsert({
          where: { id: t.id },
          create: {
            id: t.id,
            business_id: businessId,
            table_number: t.table_number,
            floor: t.floor || null,
            building: t.building || null,
            capacity: t.capacity || 4,
            status: t.status || 'ACTIVE',
            qr_code_url: t.qr_code_url || null,
            last_scanned_at: null,
            current_session_id: null,
            created_at: now,
            updated_at: now,
          },
          update: {
            table_number: t.table_number,
            floor: t.floor || null,
            building: t.building || null,
            capacity: t.capacity || 4,
            status: t.status || 'ACTIVE',
            updated_at: now,
          },
        });
      } catch (e: any) {
        console.warn('Prisma seedDefaultTables notice:', e.message);
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
      if (taxConfig?.active_promo_enabled === false) {
        pct = 0;
      } else if (
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
      const cfg = await prisma.taxConfig.findUnique({
        where: { business_id: businessId },
      });
      if (cfg) {
        const isInclusive = Boolean(
          cfg.tax_inclusive ?? (Array.isArray(cfg.rates) && (cfg.rates as any[]).some((r: any) => r.is_inclusive))
        );
        return {
          business_id: businessId,
          tax_enabled: cfg.tax_enabled,
          tax_inclusive: isInclusive,
          currency: cfg.currency || 'Rs.',
          currency_symbol: cfg.currency_symbol || 'Rs.',
          rates: (cfg.rates as any[]) || [
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
          invoice_prefix: cfg.invoice_prefix || 'INV-',
          receipt_footer_note: cfg.receipt_footer_note || 'Thank you for your visit! Please dine with us again.',
          pan_vat_number: cfg.pan_vat_number || '',
          pan_vat_prefix: cfg.pan_vat_prefix || undefined,
          invoice_display_name: cfg.invoice_display_name || undefined,
          invoice_subtitle: cfg.invoice_subtitle || undefined,
          invoice_document_title: cfg.invoice_document_title || undefined,
          invoice_address: cfg.invoice_address || undefined,
          active_promo_code: cfg.active_promo_code || undefined,
          active_promo_percent: cfg.active_promo_percent ? Number(cfg.active_promo_percent) : undefined,
          active_promo_description: cfg.active_promo_description || undefined,
          active_promo_enabled: cfg.active_promo_enabled,
          order_reset_interval: (cfg.order_reset_interval as any) || 'MANUAL',
          last_order_reset_date: cfg.last_order_reset_date || null,
          updated_at: cfg.updated_at ? cfg.updated_at.toISOString() : new Date().toISOString(),
        };
      }
    } catch (e: any) {
      console.warn('Prisma getTaxConfig note:', e.message);
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

    try {
      await db.ensureBusiness(businessId);
      await prisma.taxConfig.upsert({
        where: { business_id: businessId },
        create: {
          business_id: businessId,
          tax_enabled: updated.tax_enabled ?? true,
          tax_inclusive: updated.tax_inclusive ?? false,
          currency: updated.currency || 'Rs.',
          currency_symbol: updated.currency_symbol || 'Rs.',
          rates: updated.rates as any,
          invoice_prefix: updated.invoice_prefix || 'INV-',
          receipt_footer_note: updated.receipt_footer_note || null,
          pan_vat_number: updated.pan_vat_number || null,
          pan_vat_prefix: updated.pan_vat_prefix || null,
          invoice_display_name: updated.invoice_display_name || null,
          invoice_subtitle: updated.invoice_subtitle || null,
          invoice_document_title: updated.invoice_document_title || null,
          invoice_address: updated.invoice_address || null,
          active_promo_code: updated.active_promo_code || null,
          active_promo_percent: updated.active_promo_percent !== undefined ? updated.active_promo_percent : null,
          active_promo_description: updated.active_promo_description || null,
          active_promo_enabled: updated.active_promo_enabled ?? false,
          order_reset_interval: updated.order_reset_interval || 'MANUAL',
          last_order_reset_date: updated.last_order_reset_date || null,
        },
        update: {
          tax_enabled: updated.tax_enabled ?? true,
          tax_inclusive: updated.tax_inclusive ?? false,
          currency: updated.currency || 'Rs.',
          currency_symbol: updated.currency_symbol || 'Rs.',
          rates: updated.rates as any,
          invoice_prefix: updated.invoice_prefix || 'INV-',
          receipt_footer_note: updated.receipt_footer_note || null,
          pan_vat_number: updated.pan_vat_number || null,
          pan_vat_prefix: updated.pan_vat_prefix || null,
          invoice_display_name: updated.invoice_display_name || null,
          invoice_subtitle: updated.invoice_subtitle || null,
          invoice_document_title: updated.invoice_document_title || null,
          invoice_address: updated.invoice_address || null,
          active_promo_code: updated.active_promo_code || null,
          active_promo_percent: updated.active_promo_percent !== undefined ? updated.active_promo_percent : null,
          active_promo_description: updated.active_promo_description || null,
          active_promo_enabled: updated.active_promo_enabled ?? false,
          order_reset_interval: updated.order_reset_interval || 'MANUAL',
          last_order_reset_date: updated.last_order_reset_date || null,
        },
      });
    } catch (e: any) {
      console.warn('Prisma updateTaxConfig error:', e.message);
    }



    // Recalculate active unsettled table orders in Prisma so live bills reflect the updated tax mode/rates
    try {
      const activePrismaOrders = await prisma.tableOrder.findMany({
        where: {
          business_id: businessId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          payment_status: { not: 'PAID' },
        },
      });

      for (const od of activePrismaOrders) {
        const activeItems = ((od.items as any[]) || []).filter((it: any) => it.status !== 'CANCELLED');
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
        const promoDiscount = this.resolveOrderPromoDiscount(preDiscountTotal, od as any, updated);
        const newTotal = Math.max(0, Math.round((preDiscountTotal - promoDiscount) * 100) / 100);

        await prisma.tableOrder.update({
          where: { id: od.id },
          data: {
            subtotal: newSubtotal,
            tax_amount: newTax,
            taxes: computedTaxes as any,
            promo_discount: promoDiscount,
            total_amount: newTotal,
          },
        }).catch(() => {});

        realtimeEmitter.orderUpdated(businessId, {
          id: od.id,
          subtotal: newSubtotal,
          tax_amount: newTax,
          total_amount: newTotal,
        });
      }
    } catch (e: any) {
      console.warn('Prisma active orders recalculate note:', e.message);
    }



    realtimeEmitter.taxConfigUpdated(businessId, updated);

    auditService.log({
      userId: user?.id || 'admin',
      email: user?.email || 'admin@namasteqr.com',
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
      const dbAccounts = await prisma.gLAccount.findMany({
        where: { business_id: businessId },
      });
      if (dbAccounts && dbAccounts.length > 0) {
        const accounts: GLAccountLink[] = dbAccounts.map((d) => ({
          id: d.id,
          business_id: d.business_id,
          account_number: d.account_number,
          account_name: d.account_name,
          category: d.category as any,
          mapping_key: d.mapping_key || '',
          description: d.description || '',
          customer_name: d.customer_name ?? null,
          customer_address: d.customer_address ?? null,
          customer_phone: d.customer_phone ?? null,
          customer_extension: d.customer_extension ?? null,
          customer_office_name: d.customer_office_name ?? null,
          customer_designation: d.customer_designation ?? null,
          is_active: d.is_active,
          created_at: d.created_at.toISOString(),
          updated_at: d.updated_at.toISOString(),
        }));
        accounts.sort((a, b) => a.account_number.localeCompare(b.account_number, undefined, { numeric: true }));
        return accounts;
      }
    } catch (e: any) {
      console.warn('Prisma getGLAccounts note:', e.message);
    }

    // Seed defaults in background & return
    const defaults = this.getDefaultGLAccounts(businessId);
    (async () => {
      try {
        await db.ensureBusiness(businessId);
        for (const acc of defaults) {
          await prisma.gLAccount.upsert({
            where: {
              business_id_account_number: {
                business_id: businessId,
                account_number: acc.account_number,
              },
            },
            create: {
              id: acc.id,
              business_id: businessId,
              account_number: acc.account_number,
              account_name: acc.account_name,
              category: acc.category,
              mapping_key: acc.mapping_key,
              description: acc.description,
              is_active: acc.is_active,
            },
            update: {
              account_name: acc.account_name,
              category: acc.category,
              mapping_key: acc.mapping_key,
              description: acc.description,
              is_active: acc.is_active,
            },
          }).catch(() => {});
        }
      } catch (err: any) {}
    })().catch(() => {});

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
      try {
        const existingPrisma = await prisma.gLAccount.findFirst({
          where: {
            business_id: businessId,
            account_number: accNumber,
          },
        });
        if (existingPrisma) {
          throw new Error(`GL account number ${accNumber} already exists. Please use a different number.`);
        }
      } catch (err: any) {
        if (err.message && err.message.includes('already exists')) throw err;
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

    try {
      await db.ensureBusiness(businessId);
      await prisma.gLAccount.upsert({
        where: {
          business_id_account_number: {
            business_id: businessId,
            account_number: accNumber,
          },
        },
        create: {
          id,
          business_id: businessId,
          account_number: accNumber,
          account_name: accName,
          category: newAccount.category,
          mapping_key: newAccount.mapping_key,
          description: newAccount.description,
          customer_name: newAccount.customer_name,
          customer_address: newAccount.customer_address,
          customer_phone: newAccount.customer_phone,
          customer_extension: newAccount.customer_extension,
          customer_office_name: newAccount.customer_office_name,
          customer_designation: newAccount.customer_designation,
          is_active: newAccount.is_active,
        },
        update: {
          account_name: accName,
          category: newAccount.category,
          mapping_key: newAccount.mapping_key,
          description: newAccount.description,
          customer_name: newAccount.customer_name,
          customer_address: newAccount.customer_address,
          customer_phone: newAccount.customer_phone,
          customer_extension: newAccount.customer_extension,
          customer_office_name: newAccount.customer_office_name,
          customer_designation: newAccount.customer_designation,
          is_active: newAccount.is_active,
        },
      });
    } catch (e: any) {
      console.warn('Prisma createGLAccount error:', e.message);
    }

    auditService.log({
      userId: user?.id || 'owner',
      email: user?.email || 'owner@namasteqr.com',
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
    let existingData: any = null;
    try {
      const pExisting = await prisma.gLAccount.findFirst({
        where: { id: accountId, business_id: businessId },
      });
      if (pExisting) existingData = pExisting;
    } catch (e) {}



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
      created_at: existingData?.created_at ? (typeof existingData.created_at === 'string' ? existingData.created_at : existingData.created_at.toISOString()) : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await prisma.gLAccount.updateMany({
        where: { id: accountId, business_id: businessId },
        data: {
          account_number: updatedAccount.account_number,
          account_name: updatedAccount.account_name,
          category: updatedAccount.category,
          mapping_key: updatedAccount.mapping_key,
          description: updatedAccount.description,
          customer_name: updatedAccount.customer_name,
          customer_address: updatedAccount.customer_address,
          customer_phone: updatedAccount.customer_phone,
          customer_extension: updatedAccount.customer_extension,
          customer_office_name: updatedAccount.customer_office_name,
          customer_designation: updatedAccount.customer_designation,
          is_active: updatedAccount.is_active,
        },
      });
    } catch (e: any) {
      console.warn('Prisma updateGLAccount error:', e.message);
    }

    auditService.log({
      userId: user?.id || 'owner',
      email: user?.email || 'owner@namasteqr.com',
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
    try {
      await prisma.gLAccount.deleteMany({
        where: { id: accountId, business_id: businessId },
      });
    } catch (e: any) {
      console.warn('Prisma deleteGLAccount error:', e.message);
    }



    auditService.log({
      userId: user?.id || 'owner',
      email: user?.email || 'owner@namasteqr.com',
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
    try {
      await prisma.gLAccount.deleteMany({
        where: { business_id: businessId },
      });
    } catch (e: any) {
      console.warn('Prisma resetDefaultGLAccounts clear error:', e.message);
    }

    const defaults = this.getDefaultGLAccounts(businessId);
    try {
      await db.ensureBusiness(businessId);
      for (const acc of defaults) {
        await prisma.gLAccount.upsert({
          where: {
            business_id_account_number: {
              business_id: businessId,
              account_number: acc.account_number,
            },
          },
          create: {
            id: acc.id,
            business_id: businessId,
            account_number: acc.account_number,
            account_name: acc.account_name,
            category: acc.category,
            mapping_key: acc.mapping_key,
            description: acc.description,
            is_active: acc.is_active,
          },
          update: {
            account_name: acc.account_name,
            category: acc.category,
            mapping_key: acc.mapping_key,
            description: acc.description,
            is_active: acc.is_active,
          },
        }).catch(() => {});
      }
    } catch (err: any) {}

    auditService.log({
      userId: user?.id || 'owner',
      email: user?.email || 'owner@namasteqr.com',
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
      const where: any = { business_id: businessId };
      if (filters?.date) {
        where.date_string = filters.date.includes('T') ? filters.date.split('T')[0] : filters.date;
      } else if (filters?.startDate || filters?.endDate) {
        const startDay = filters.startDate ? (filters.startDate.includes('T') ? filters.startDate.split('T')[0] : filters.startDate) : undefined;
        const endDay = filters.endDate ? (filters.endDate.includes('T') ? filters.endDate.split('T')[0] : filters.endDate) : undefined;
        where.date_string = {};
        if (startDay) where.date_string.gte = startDay;
        if (endDay) where.date_string.lte = endDay;
      }
      if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
        where.payment_method = filters.paymentMethod;
      }

      const rows = await prisma.sale.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: filters?.limit && filters.limit > 0 ? filters.limit : undefined,
      });

      return rows.map((d) => ({
        id: d.id,
        invoice_number: d.invoice_number || d.id,
        order_number: d.order_number || undefined,
        business_id: d.business_id,
        order_id: d.order_id || undefined,
        table_id: d.table_id || undefined,
        table_number: d.table_number || undefined,
        customer_name: d.customer_name || 'Guest',
        customer_phone: d.customer_phone || '',
        sale_type: (d.sale_type as any) || 'DINE_IN',
        items: (d.items as any) || [],
        subtotal: Number(d.subtotal) || 0,
        discount_percent: Number(d.discount_percent) || 0,
        discount_amount: Number(d.discount_amount) || 0,
        promo_code: d.promo_code || undefined,
        promo_discount: Number(d.promo_discount) || 0,
        taxes: (d.taxes as any) || [],
        total_tax: Number(d.total_tax) || 0,
        service_charge: Number(d.service_charge) || 0,
        total_amount: Number(d.total_amount) || 0,
        currency: d.currency || 'Rs.',
        payment_method: (d.payment_method as any) || 'CASH',
        credit_gl_account_id: d.credit_gl_account_id || undefined,
        credit_gl_account_number: d.credit_gl_account_number || undefined,
        credit_gl_account_name: d.credit_gl_account_name || undefined,
        payment_status: (d.payment_status as any) || 'PAID',
        cashier_name: d.cashier_name || 'Staff',
        cashier_id: d.cashier_id || undefined,
        notes: d.notes || '',
        created_at: d.created_at.toISOString(),
        date_string: d.date_string,
      }));
    } catch (e: any) {
      console.warn('Prisma getSales error:', e.message);
      return [];
    }
  }

  /**
   * Create a new sale record (from POS or settled table order)
   */
  public async getNextSequenceNumber(businessId: string, type: 'invoice' | 'order', providedVal?: string, defaultPrefix = '', taxConfig?: any): Promise<string> {
    try {
      await db.ensureBusiness(businessId);
      const counterId = `${businessId}_${type}`;
      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];

      let lastReset: string | null = null;
      let currentVal: string | null = null;

      const existingCounter = await prisma.counter.findUnique({
        where: { business_id_type: { business_id: businessId, type } },
      });
      if (existingCounter) {
        currentVal = existingCounter.current;
        lastReset = existingCounter.last_reset_date;
      }

      let shouldReset = false;
      if (type === 'order' && taxConfig && taxConfig.order_reset_interval && taxConfig.order_reset_interval !== 'MANUAL') {
        if (!lastReset) {
          shouldReset = true;
        } else {
          const lastDate = new Date(lastReset);
          if (taxConfig.order_reset_interval === 'DAILY' && currentDateStr !== lastReset) shouldReset = true;
          if (taxConfig.order_reset_interval === 'WEEKLY' && (now.getTime() - lastDate.getTime()) > 7 * 24 * 60 * 60 * 1000) shouldReset = true;
          if (taxConfig.order_reset_interval === 'MONTHLY' && (now.getMonth() !== lastDate.getMonth() || now.getFullYear() !== lastDate.getFullYear())) shouldReset = true;
          if (taxConfig.order_reset_interval === 'YEARLY' && now.getFullYear() !== lastDate.getFullYear()) shouldReset = true;
        }
      }

      let nextVal = '';
      if (providedVal) {
        nextVal = providedVal;
      } else {
        if (currentVal && !shouldReset) {
          nextVal = incrementSequence(currentVal);
        } else {
          if (type === 'order') {
            const pref = (defaultPrefix && defaultPrefix !== 'A') ? defaultPrefix : 'ORD-0';
            nextVal = pref === 'ORD-0' ? 'ORD-01' : (pref.endsWith('-') ? `${pref}01` : (pref.endsWith('0') ? `${pref}1` : `${pref}-01`));
          } else {
            nextVal = defaultPrefix + '1';
          }
        }
      }

      await prisma.counter.upsert({
        where: { business_id_type: { business_id: businessId, type } },
        create: {
          id: counterId,
          business_id: businessId,
          type,
          current: nextVal,
          last_reset_date: (shouldReset || !lastReset) ? currentDateStr : lastReset,
        },
        update: {
          current: nextVal,
          ...((shouldReset || !lastReset) ? { last_reset_date: currentDateStr } : {}),
        },
      });

      return nextVal;
    } catch (e: any) {
      console.warn('Prisma getNextSequenceNumber error:', e.message);
      return providedVal || (type === 'order' ? 'ORD-01' : 'INV-1');
    }
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
        throw new Error('A valid customer credit GL account must be selected for CREDIT sales.');
      }

      let glData: any = null;
      try {
        const pGl = await prisma.gLAccount.findUnique({ where: { id: saleData.credit_gl_account_id } });
        if (pGl) glData = pGl;
      } catch (e) {}



      if (!glData) {
        throw new Error('Selected customer credit GL account does not exist.');
      }
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
          const pOrder = await prisma.tableOrder.findUnique({ where: { id: saleData.order_id } });
          if (pOrder && pOrder.order_number) {
            orderNumber = pOrder.order_number;
          }
        } catch (e) {}

      }
      if (!orderNumber) {
        orderNumber = await this.getNextSequenceNumber(businessId, 'order', undefined, 'ORD-0', taxConfig);
      }
    } else {
      orderNumber = await this.getNextSequenceNumber(businessId, 'order', saleData.order_number, 'ORD-0', taxConfig);
    }

    const isManualPosSale = !options?.skipOrderCompletion && !saleData.order_id;
    const posTableOrderId = isManualPosSale
      ? `order-pos-${timestamp}-${shortRandom}`
      : (saleData.order_id || null);

    const newSale: any = {
      id,
      invoice_number: invoiceNumber || null,
      order_number: orderNumber || null,
      business_id: businessId,
      order_id: posTableOrderId,
      table_id: saleData.table_id || null,
      table_number: saleData.table_number || (saleData.sale_type === 'TAKEAWAY' ? 'Takeaway' : saleData.sale_type === 'DELIVERY' ? 'Delivery' : saleData.sale_type === 'ROOM_SERVICE' ? 'Room Service' : 'Dine-In Restaurant'),
      customer_name: (() => {
        const typed = (saleData.customer_name || '').trim();
        const isDefault = !typed || /^(walk-in guest|guest)$/i.test(typed);
        if (saleData.payment_method === 'CREDIT' && isDefault && resolvedCreditCustomer.name) return resolvedCreditCustomer.name;
        return saleData.customer_name || 'Walk-in Guest';
      })(),
      customer_phone: saleData.customer_phone || (saleData.payment_method === 'CREDIT' ? (resolvedCreditCustomer.phone || '') : ''),
      sale_type: saleData.sale_type || 'DINE_IN',
      items: (saleData.items || []).filter((it: any) => it && (it.name || '').trim().length > 0),
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

    // Primary save to Prisma PostgreSQL
    try {
      await db.ensureBusiness(businessId);
      await prisma.sale.upsert({
        where: { id },
        create: {
          id,
          invoice_number: invoiceNumber || id,
          order_number: orderNumber || null,
          business_id: businessId,
          order_id: saleData.order_id || null,
          table_id: saleData.table_id || null,
          table_number: saleData.table_number || (saleData.sale_type === 'TAKEAWAY' ? 'Takeaway' : saleData.sale_type === 'DELIVERY' ? 'Delivery' : saleData.sale_type === 'ROOM_SERVICE' ? 'Room Service' : 'Dine-In Restaurant'),
          customer_name: newSale.customer_name,
          customer_phone: newSale.customer_phone || null,
          sale_type: newSale.sale_type,
          items: newSale.items as any,
          subtotal: newSale.subtotal,
          discount_percent: newSale.discount_percent,
          discount_amount: newSale.discount_amount,
          promo_code: newSale.promo_code || null,
          promo_discount: newSale.promo_discount,
          taxes: newSale.taxes as any,
          total_tax: newSale.total_tax,
          service_charge: newSale.service_charge,
          total_amount: newSale.total_amount,
          currency: newSale.currency,
          payment_method: newSale.payment_method,
          credit_gl_account_id: newSale.credit_gl_account_id || null,
          credit_gl_account_number: newSale.credit_gl_account_number || null,
          credit_gl_account_name: newSale.credit_gl_account_name || null,
          payment_status: newSale.payment_status,
          cashier_name: newSale.cashier_name || null,
          cashier_id: newSale.cashier_id || null,
          notes: newSale.notes || null,
          date_string: dateStr,
          created_at: now,
        },
        update: {
          invoice_number: invoiceNumber || id,
          order_number: orderNumber || null,
          total_amount: newSale.total_amount,
          payment_status: newSale.payment_status,
        },
      });
    } catch (e: any) {
      console.warn('Prisma createSale error:', e.message);
    }



    // =========================================================================
    // WORKFLOW 1: MANUAL POS SALE ("New POS Sale" / "Create Counter POS Sale")
    // =========================================================================
    // Cashier manually created & settled bill immediately.
    // Automatically dispatch a linked TableOrder (status: RECEIVED, pay_first: true)
    // to Kitchen & Bar (KOT/KDS/BOT/BDS) and notify Waiter Station.
    if (!options?.skipOrderCompletion && !saleData.order_id) {
      const orderTimestamp = Date.now();
      const orderRandom = Math.floor(1000 + Math.random() * 9000);
      const tableOrderId = newSale.order_id || `order-pos-${orderTimestamp}-${orderRandom}`;

      const orderItems: TableOrderItem[] = (saleData.items || []).map((it: any, idx: number) => {
        const itemKey = it.item_key || `${it.id || it.item_id || 'dish'}_pos_${orderTimestamp}_${idx}`;
        const station = it.station || this.determineItemStation(it);
        return {
          item_id: it.item_id || it.id || `dish-${idx}`,
          item_key: itemKey,
          name: it.name,
          price: Number(it.unit_price ?? it.price) || 0,
          currency: newSale.currency || 'Rs.',
          quantity: Number(it.quantity) || 1,
          special_instructions: it.special_instructions || it.notes || undefined,
          variant_id: it.variant_id || undefined,
          variant_name: it.variant_name || undefined,
          food_type: it.food_type || undefined,
          category: it.category || undefined,
          station: station,
          status: 'RECEIVED',
          ready_at: null,
          served_at: null,
          ordered_at: now.toISOString(),
        };
      });

      let finalTableNumber = (saleData.table_number || '').trim();
      if (!finalTableNumber && saleData.table_id) {
        try {
          const tbl = await prisma.restaurantTable.findUnique({ where: { id: saleData.table_id } });
          if (tbl?.table_number) finalTableNumber = tbl.table_number;
        } catch (e) {}
      }
      if (!finalTableNumber) {
        finalTableNumber = saleData.sale_type === 'TAKEAWAY' || !saleData.table_id ? 'Counter' : 'Dine-In';
      }

      const tableOrderRecord: any = {
        id: tableOrderId,
        business_id: businessId,
        table_id: saleData.table_id || null,
        table_number: finalTableNumber,
        order_number: newSale.order_number || `ORD-${orderRandom}`,
        invoice_number: newSale.invoice_number || null,
        items: orderItems,
        subtotal: newSale.subtotal,
        tax_amount: newSale.total_tax || 0,
        total_amount: newSale.total_amount,
        currency: newSale.currency || 'Rs.',
        customer_name: newSale.customer_name || 'Walk-in Guest',
        customer_phone: newSale.customer_phone || null,
        order_notes: newSale.notes || null,
        status: 'RECEIVED',
        pay_first: true,
        payment_status: 'PAID',
        payment_method: newSale.payment_method || 'Cash',
        payment_confirmed_at: now,
        payment_confirmed_by: user?.email || 'POS_CASHIER',
        sale_id: newSale.id,
        source: 'POS_MANUAL',
        taxes: newSale.taxes || null,
        created_at: now,
        updated_at: now,
      };

      try {
        await prisma.tableOrder.create({
          data: tableOrderRecord,
        });
      } catch (e: any) {
        console.warn('Prisma createTableOrder for manual POS sale error:', e.message);
      }

      // If linked to a dining table, maintain OCCUPIED status
      if (saleData.table_id) {
        try {
          await prisma.restaurantTable.updateMany({
            where: { id: saleData.table_id, business_id: businessId },
            data: {
              status: 'OCCUPIED',
              current_session_id: tableOrderId,
            },
          });
          realtimeEmitter.tableUpdated(businessId, {
            id: saleData.table_id,
            table_number: finalTableNumber,
            status: 'OCCUPIED',
          });
        } catch (e) {}
      }

      // Realtime notification to KDS screens, Bar screens, and Waiter stations
      realtimeEmitter.orderCreated(businessId, {
        ...tableOrderRecord,
        pos_sale_id: newSale.id,
      });
      realtimeEmitter.orderUpdated(businessId, {
        ...tableOrderRecord,
        pos_sale_id: newSale.id,
      });
    }

    // =========================================================================
    // WORKFLOW 2: QR-SCANNED ORDER / ACTIVE TABLE BILL SETTLEMENT
    // =========================================================================
    // Only runs when settling an existing order (saleData.order_id exists)
    else if (!options?.skipOrderCompletion && (saleData.order_id || saleData.table_id || saleData.table_number)) {
      let matchingOrders: any[] = [];
      try {
        const orderWhere: any = {
          business_id: businessId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        };
        if (saleData.order_id) {
          orderWhere.id = saleData.order_id;
        } else if (saleData.table_id) {
          orderWhere.table_id = saleData.table_id;
        } else if (saleData.table_number) {
          orderWhere.table_number = saleData.table_number;
        }

        matchingOrders = await prisma.tableOrder.findMany({
          where: orderWhere,
        });

        await prisma.tableOrder.updateMany({
          where: orderWhere,
          data: {
            status: 'COMPLETED',
            payment_status: 'PAID',
            payment_method: newSale.payment_method || saleData.payment_method || 'Cash',
            sale_id: newSale.id,
            bill_requested: false,
          },
        });
      } catch (e: any) {
        console.warn('Prisma order completion note:', e.message);
      }

      // Automatically resolve any associated BILL_REQUEST service requests so the card in Waiter Station disappears
      try {
        await prisma.serviceRequest.updateMany({
          where: {
            business_id: businessId,
            OR: [
              saleData.order_id ? { order_id: saleData.order_id } : undefined,
              saleData.table_id ? { table_id: saleData.table_id } : undefined,
              saleData.table_number ? { table_number: saleData.table_number } : undefined,
            ].filter(Boolean) as any,
            type: 'BILL_REQUEST',
            status: 'PENDING',
          },
          data: {
            status: 'RESOLVED',
            resolved_at: now,
            resolved_by: 'POS_CASHIER_SETTLED',
          },
        });
      } catch (e) {}

      // Reset Table in Prisma
      try {
        if (saleData.table_id) {
          await prisma.restaurantTable.updateMany({
            where: { id: saleData.table_id, business_id: businessId },
            data: {
              status: 'ACTIVE',
              current_session_id: null,
              host_token: null,
              last_scanned_at: null,
            },
          });
        } else if (saleData.table_number) {
          await prisma.restaurantTable.updateMany({
            where: { table_number: saleData.table_number, business_id: businessId },
            data: {
              status: 'ACTIVE',
              current_session_id: null,
              host_token: null,
              last_scanned_at: null,
            },
          });
        }
      } catch (e) {}

      realtimeEmitter.tableUpdated(businessId, {
        id: saleData.table_id || '',
        table_number: saleData.table_number || '',
        status: 'ACTIVE',
      });

      const emittedOrderIds = new Set<string>();
      if (matchingOrders && matchingOrders.length > 0) {
        for (const ord of matchingOrders) {
          emittedOrderIds.add(ord.id);
          realtimeEmitter.orderUpdated(businessId, {
            id: ord.id,
            table_id: ord.table_id || saleData.table_id || '',
            table_number: ord.table_number || saleData.table_number || '',
            status: 'COMPLETED',
            payment_status: 'PAID',
            payment_method: newSale.payment_method || saleData.payment_method || ord.payment_method || 'Cash',
            total_amount: ord.total_amount ?? newSale.total_amount,
            subtotal: ord.subtotal ?? newSale.subtotal,
            currency: ord.currency || newSale.currency || 'Rs.',
            sale_id: newSale.id,
            settled: true,
          });
        }
      }
      if (saleData.order_id && !emittedOrderIds.has(saleData.order_id)) {
        realtimeEmitter.orderUpdated(businessId, {
          id: saleData.order_id,
          table_id: saleData.table_id || '',
          table_number: saleData.table_number || '',
          status: 'COMPLETED',
          payment_status: 'PAID',
          payment_method: newSale.payment_method || saleData.payment_method || 'Cash',
          total_amount: newSale.total_amount,
          subtotal: newSale.subtotal,
          currency: newSale.currency || 'Rs.',
          sale_id: newSale.id,
          settled: true,
        });
      }
    }

    auditService.log({
      userId: user?.id || 'staff',
      email: user?.email || 'staff@namasteqr.com',
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
    try {
      await prisma.sale.deleteMany({
        where: { id: saleId, business_id: businessId },
      });
    } catch (e: any) {
      console.warn('Prisma deleteSale error:', e.message);
    }



    auditService.log({
      userId: user?.id || 'admin',
      email: user?.email || 'admin@namasteqr.com',
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
    let prismaCount = 0;
    try {
      const delRes = await prisma.sale.deleteMany({
        where: { business_id: businessId, date_string: dateString },
      });
      prismaCount = delRes.count;
    } catch (e: any) {
      console.warn('Prisma deleteSalesByDate error:', e.message);
    }

    auditService.log({
      userId: user?.id || 'admin',
      email: user?.email || 'admin@namasteqr.com',
      businessId,
      eventType: 'SALES_HISTORY_DELETED_BY_DATE',
      status: `DELETED_DATE_${dateString}_COUNT_${prismaCount}`,
    });

    return { deletedCount: prismaCount };
  }

  /**
   * Delete entire saved sales records
   */
  public async deleteAllSales(businessId: string, user?: any): Promise<{ deletedCount: number }> {
    let prismaCount = 0;
    try {
      const delRes = await prisma.sale.deleteMany({
        where: { business_id: businessId },
      });
      prismaCount = delRes.count;
    } catch (e: any) {
      console.warn('Prisma deleteAllSales error:', e.message);
    }

    auditService.log({
      userId: user?.id || 'admin',
      email: user?.email || 'admin@namasteqr.com',
      businessId,
      eventType: 'ALL_SALES_HISTORY_CLEARED',
      status: `CLEARED_ALL_COUNT_${prismaCount}`,
    });

    return { deletedCount: prismaCount };
  }

  /**
   * Automatic daily maintenance:
   * 1. Deletes table_orders older than 24 hours (or past day's completed/cancelled orders)
   *    so the database doesn't accumulate excessive order payload items.
   * 2. Retains completed sales records for 30 days (ensuring History page monthly reports work smoothly),
   *    and purges sales older than 30 days to avoid long-term database bloat.
   */
  public async cleanupDailyOrdersAndOldSales(businessId?: string): Promise<{ deletedOrders: number; deletedSales: number }> {
    let businessIds: string[] = [];
    if (businessId) {
      businessIds = [businessId];
    } else {
      try {
        const allBiz = await prisma.business.findMany({ select: { id: true } });
        businessIds = allBiz.map((b) => b.id);
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
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const fourHoursAgo = new Date(now - 4 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    for (const bId of businessIds) {
      // 1. Clean table_orders (older than 24h OR completed/cancelled older than 4h)
      try {
        const res = await prisma.tableOrder.deleteMany({
          where: {
            business_id: bId,
            OR: [
              { created_at: { lt: twentyFourHoursAgo } },
              {
                status: { in: ['COMPLETED', 'CANCELLED'] },
                created_at: { lt: fourHoursAgo },
              },
            ],
          },
        });
        totalDeletedOrders += res.count;
      } catch (err: any) {
        console.warn(`[Cleanup] Failed to clean table_orders for business ${bId}:`, err.message);
      }

      // 2. Clean sales older than 30 days
      try {
        const res = await prisma.sale.deleteMany({
          where: {
            business_id: bId,
            created_at: { lt: thirtyDaysAgo },
          },
        });
        totalDeletedSales += res.count;
      } catch (err: any) {
        console.warn(`[Cleanup] Failed to clean sales for business ${bId}:`, err.message);
      }
    }

    if (totalDeletedOrders > 0 || totalDeletedSales > 0) {
      auditService.log({
        userId: 'system-cron',
        email: 'system@namasteqr.com',
        businessId: businessId || 'all',
        eventType: 'DAILY_STORAGE_CLEANUP',
        status: `DELETED_ORDERS_${totalDeletedOrders}_DELETED_SALES_${totalDeletedSales}`,
      });
      console.log(`[Storage Maintenance] Auto-deleted ${totalDeletedOrders} orders (>24h) and ${totalDeletedSales} sales (>30d).`);
    }

    return { deletedOrders: totalDeletedOrders, deletedSales: totalDeletedSales };
  }

  /**
   * Purge completed/settled table orders immediately on demand
   */
  public async purgeCompletedTableOrders(businessId: string): Promise<{ deletedCount: number }> {
    let deletedCount = 0;
    try {
      const res = await prisma.tableOrder.deleteMany({
        where: {
          business_id: businessId,
          status: { in: ['COMPLETED', 'CANCELLED'] },
        },
      });
      deletedCount = res.count;
    } catch (e: any) {
      console.warn('Prisma purgeCompletedTableOrders error:', e.message);
    }

    auditService.log({
      userId: 'staff',
      email: 'staff@namasteqr.com',
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
      const sourceCategories = await prisma.menuCategory.findMany({
        where: { business_id: sourceBusinessId },
        orderBy: { order: 'asc' },
      });
      const categoryIdMap = new Map<string, string>(); // oldId -> newId

      for (const cat of sourceCategories) {
        try {
          let targetCat = await prisma.menuCategory.findFirst({
            where: {
              business_id: targetBusinessId,
              name: { equals: cat.name.trim(), mode: 'insensitive' },
            },
          });

          if (!targetCat) {
            const newCatId = generateCategoryDocId(cat.name.trim(), targetBusinessId);
            targetCat = await prisma.menuCategory.create({
              data: {
                id: newCatId,
                business_id: targetBusinessId,
                name: cat.name.trim(),
                order: cat.order ?? 0,
              },
            });
          }
          categoryIdMap.set(cat.id, targetCat.id);
        } catch (catErr: any) {
          console.warn(`[CloneMenu] Error cloning category "${cat.name}":`, catErr.message);
        }
      }

      // 2. Fetch items from source
      const sourceItems = await prisma.menuItem.findMany({
        where: { business_id: sourceBusinessId },
        orderBy: { order_index: 'asc' },
      });
      let itemsCloned = 0;

      for (const item of sourceItems) {
        try {
          const targetCategoryId = item.category_id ? categoryIdMap.get(item.category_id) || null : null;

          // Check if item already exists in target branch
          const existingItem = await prisma.menuItem.findFirst({
            where: {
              business_id: targetBusinessId,
              name: { equals: item.name.trim(), mode: 'insensitive' },
            },
          });

          if (existingItem) {
            if (targetCategoryId && existingItem.category_id !== targetCategoryId) {
              await prisma.menuItem.update({
                where: { id: existingItem.id },
                data: { category_id: targetCategoryId },
              });
            }
            continue;
          }

          const newDocId = generateMenuDocId(item.name.trim(), targetBusinessId);

          await prisma.menuItem.create({
            data: {
              id: newDocId,
              business_id: targetBusinessId,
              name: item.name.trim(),
              category: item.category.trim(),
              category_id: targetCategoryId,
              additional_categories: Array.isArray(item.additional_categories) ? item.additional_categories : [],
              price: item.price,
              currency: item.currency || 'Rs.',
              description: item.description || '',
              image_url: item.image_url || '',
              food_type: item.food_type || 'non-veg',
              status: item.status || 'available',
              is_available: item.is_available ?? true,
              has_variants: Boolean(item.has_variants),
              variants: (item.variants as any) || [],
              variant_group_name: item.variant_group_name || null,
              display_style: item.display_style || 'auto',
              show_image: item.show_image ?? true,
              promo_badge: item.promo_badge || null,
              order_index: item.order_index ?? 0,
              preparation_time_mins: item.preparation_time_mins || 15,
              created_by: user.id,
            },
          });
          itemsCloned++;
        } catch (itemErr: any) {
          console.warn(`[CloneMenu] Error cloning item "${item.name}":`, itemErr.message);
        }
      }

      // 3. Clone menu theme configuration and image display setting
      try {
        const sourceBiz = await prisma.business.findUnique({
          where: { id: sourceBusinessId },
          select: { menu_theme_config: true, show_menu_images: true },
        });
        if (sourceBiz) {
          await prisma.business.update({
            where: { id: targetBusinessId },
            data: {
              ...(sourceBiz.menu_theme_config ? { menu_theme_config: sourceBiz.menu_theme_config as any } : {}),
              show_menu_images: sourceBiz.show_menu_images ?? true,
            },
          });
        }
      } catch (themeErr: any) {
        console.warn('[CloneMenu] Error copying menu theme config:', themeErr.message);
      }

      realtimeEmitter.menuUpdated(targetBusinessId);
      return { categoriesCloned: categoryIdMap.size, itemsCloned };
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
    if (!isBusinessOwnerRole(role)) {
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
    const existingOrder = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    if (!existingOrder) throw new Error('Order not found');
    const order: any = existingOrder;
    if (order.business_id !== businessId) {
      throw new Error(`Order ${orderId} not found in venue '${businessId}'.`);
    }
    
    if (!order.pay_first) throw new Error('Not a pay-first order');
    if (order.status !== 'AWAITING_PAYMENT') throw new Error('Order is not awaiting payment');
    if (order.payment_status === 'PAID') throw new Error('Order is already paid');
    
    const activeItems = ((order.items as any[]) || []).filter((it: any) => it.status !== 'CANCELLED');
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
    
    const updatedItems = activeItems.map((it: any) => ({
      ...it,
      status: it.status === 'AWAITING_PAYMENT' ? 'RECEIVED' : (it.status || 'RECEIVED'),
    }));

    try {
      await db.ensureBusiness(businessId);
      if (order.table_id) {
        const tExists = await prisma.restaurantTable.findUnique({ where: { id: order.table_id } });
        if (!tExists) {
          await prisma.restaurantTable.create({
            data: {
              id: order.table_id,
              business_id: businessId,
              table_number: order.table_number || 'T-1',
              status: 'ACTIVE',
            },
          }).catch(() => {});
        }
      }
      await prisma.tableOrder.upsert({
        where: { id: orderId },
        create: {
          id: orderId,
          business_id: businessId,
          table_id: order.table_id || null,
          table_number: order.table_number || 'T-1',
          status: 'RECEIVED',
          subtotal: calcSubtotal,
          tax_amount: calcTax,
          taxes: computedTaxes as any,
          promo_discount: promoDiscount,
          total_amount: finalTotal,
          payment_status: 'PAID',
          payment_confirmed_at: new Date(),
          payment_confirmed_by: cashierName,
          sale_id: createdSale.id,
          items: updatedItems as any,
        },
        update: {
          status: 'RECEIVED',
          subtotal: calcSubtotal,
          tax_amount: calcTax,
          taxes: computedTaxes as any,
          promo_discount: promoDiscount,
          total_amount: finalTotal,
          payment_status: 'PAID',
          payment_confirmed_at: new Date(),
          payment_confirmed_by: cashierName,
          sale_id: createdSale.id,
          items: updatedItems as any,
        },
      });
    } catch (e: any) {
      console.warn('Prisma confirmTableOrderPayment error:', e.message);
    }

    const updatedPrismaOrder = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    realtimeEmitter.orderUpdated(businessId, {
      ...(existingOrder as any),
      ...(updatedPrismaOrder || {}),
      items: updatedItems,
      id: orderId,
      pay_first: true,
      status: 'RECEIVED' as const,
      payment_status: 'PAID' as const,
      payment_method: paymentMethod || (existingOrder as any).payment_method || 'CASH',
      payment_confirmed_by: cashierName,
      payment_confirmed_at: new Date(),
      sale_id: createdSale.id,
    });
  }

  public async rejectTableOrderPayment(
    orderId: string,
    businessId: string,
    reason: string,
    cashierName: string
  ): Promise<void> {
    const existingOrder = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    if (!existingOrder) throw new Error('Order not found');
    const order: any = existingOrder;
    if (order.business_id !== businessId) {
      throw new Error(`Order ${orderId} not found in venue '${businessId}'.`);
    }
    
    if (!order.pay_first) throw new Error('Not a pay-first order');
    if (order.status !== 'AWAITING_PAYMENT') throw new Error('Order is not awaiting payment');
    
    try {
      await prisma.tableOrder.updateMany({
        where: { id: orderId, business_id: businessId },
        data: {
          status: 'CANCELLED',
          payment_rejected_reason: reason || 'Payment rejected',
          payment_status: 'CANCELLED',
        },
      });
    } catch (e: any) {
      console.warn('Prisma rejectTableOrderPayment error:', e.message);
    }

    realtimeEmitter.orderUpdated(businessId, {
      ...(existingOrder as any),
      id: orderId,
      pay_first: true,
      status: 'CANCELLED' as const,
      payment_status: 'CANCELLED' as const,
      payment_rejected_reason: reason || 'Payment rejected',
    });
  }

  /**
   * Mark a table order's bill folio as delivered to the customer, and attend any associated service request.
   * Broadcasts to KDS, Waiter Station, and BillingPOS over Socket.io.
   */
  public async acknowledgeOrderBillFolio(
    businessId: string,
    orderId?: string,
    requestId?: string
  ): Promise<{ success?: boolean; error?: string; orderId?: string; requestId?: string; attended: boolean; order?: any }> {
    const now = new Date();
    let updatedOrderPayload: any = null;

    if (orderId) {
      try {
        await prisma.tableOrder.updateMany({
          where: { id: orderId, business_id: businessId },
          data: {
            bill_acknowledged: true,
            folio_delivered: true,
            folio_delivered_at: now,
            updated_at: now,
          },
        });

        const pOrder = await prisma.tableOrder.findUnique({ where: { id: orderId } });
        if (pOrder) {
          updatedOrderPayload = {
            id: pOrder.id,
            business_id: pOrder.business_id,
            table_id: pOrder.table_id || '',
            table_number: pOrder.table_number,
            order_number: pOrder.order_number || undefined,
            invoice_number: pOrder.invoice_number || undefined,
            floor: pOrder.floor,
            building: pOrder.building,
            items: pOrder.items as any,
            subtotal: Number(pOrder.subtotal),
            tax_amount: Number(pOrder.tax_amount),
            total_amount: Number(pOrder.total_amount),
            currency: pOrder.currency,
            customer_name: pOrder.customer_name || 'Guest',
            customer_phone: pOrder.customer_phone || '',
            order_notes: pOrder.order_notes || '',
            status: pOrder.status as any,
            pay_first: pOrder.pay_first,
            bill_requested: pOrder.bill_requested,
            bill_acknowledged: true,
            folio_delivered: true,
            folio_delivered_at: now,
            payment_method: pOrder.payment_method,
            payment_status: pOrder.payment_status,
            promo_code: pOrder.promo_code,
            promo_discount: Number(pOrder.promo_discount || 0),
            taxes: pOrder.taxes as any,
            ready_at: pOrder.ready_at,
            served_at: pOrder.served_at,
            created_at: pOrder.created_at,
            updated_at: now,
          };
        }
      } catch (e: any) {
        console.warn('Prisma acknowledgeOrderBillFolio notice:', e.message);
      }


    }

    const targetReqId = requestId || (orderId ? `bill-${orderId}` : undefined);
    if (targetReqId) {
      try {
        await prisma.serviceRequest.updateMany({
          where: { id: targetReqId, business_id: businessId },
          data: {
            status: 'ATTENDED',
            resolved_at: now,
          },
        });
      } catch (e: any) {}


    }

    if (updatedOrderPayload) {
      realtimeEmitter.orderUpdated(businessId, updatedOrderPayload);
    } else if (orderId) {
      realtimeEmitter.orderUpdated(businessId, {
        id: orderId,
        business_id: businessId,
        bill_acknowledged: true,
        folio_delivered: true,
        folio_delivered_at: now,
      });
    }

    return {
      success: true,
      orderId,
      requestId: targetReqId,
      attended: true,
      order: updatedOrderPayload,
    };
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
