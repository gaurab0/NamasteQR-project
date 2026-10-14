import { Router, Request, Response } from 'express';
import { authenticate, optionalAuthenticate, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacService } from '../services/rbac.service';
import { db } from '../services/db.service';
import {
  createGuestContext,
  createSystemContext,
  canAccessResource,
  isOwnerSubject,
  getEffectiveTabs,
  describeResourceRequirement,
} from '../services/tabAccess';
import { prisma } from '../lib/prisma';
import { realtimeEmitter } from '../lib/socket';

const router = Router();

/**
 * Helper to resolve the targeted business ID from query, headers, body, or authenticated user
 */
function getTargetBusinessId(req: AuthenticatedRequest): string {
  const queryBiz = req.query.businessId as string;
  if (queryBiz && typeof queryBiz === 'string' && queryBiz.trim()) {
    return queryBiz.trim();
  }
  const headerBiz = req.headers['x-business-id'] as string;
  if (headerBiz && typeof headerBiz === 'string' && headerBiz.trim()) {
    return headerBiz.trim();
  }
  const bodyBiz = req.body?.business_id || req.body?.businessId;
  if (bodyBiz && typeof bodyBiz === 'string' && bodyBiz.trim()) {
    return bodyBiz.trim();
  }
  if (req.user?.business?.id) {
    return req.user.business.id;
  }
  return 'maya-forest-resort';
}

/**
 * GET /api/rbac/permissions
 * Retrieves the current user's effective role and permission capabilities
 */
router.get('/permissions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const role = rbacService.normalizeRole(user.role);
  const allowed_tabs = getEffectiveTabs(user);
  const is_business_owner = isOwnerSubject(user);

  return res.json({
    success: true,
    data: {
      userId: user.id,
      email: user.email,
      role,
      businessId: user.business.id,
      allowed_tabs,
      is_business_owner,
    }
  });
});

// ============================================================================
// BUSINESSES LIST & REGISTRATION (Multi-Tenant Management)
// ============================================================================

/**
 * GET /api/rbac/businesses
 * Returns all registered businesses with their real-time table & menu catalog statistics
 */
router.get('/businesses', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = await db.getAllBusinesses();
    const detailed = await Promise.all(
      list.map(async (b) => {
        try {
          const [tableList, menuList] = await Promise.all([
            rbacService.getTables(b.id),
            rbacService.getMenuItems(b.id, createSystemContext()).catch(() => [])
          ]);
          return {
            id: b.id,
            name: b.name,
            type: b.business_type,
            status: b.status,
            tagline: b.tagline || (b.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
            location: b.location || 'Main Dining & Service Area',
            kitchen_hours: b.kitchen_hours || '07:30 AM – 10:30 PM',
            phone: b.phone || '',
            tableCount: tableList.length,
            menuCount: menuList.length,
          };
        } catch {
          return {
            id: b.id,
            name: b.name,
            type: b.business_type,
            status: b.status,
            tagline: b.tagline,
            location: b.location,
            kitchen_hours: b.kitchen_hours,
            phone: b.phone,
            tableCount: 0,
            menuCount: 0,
          };
        }
      })
    );

    return res.json({ success: true, data: detailed });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'BUSINESSES_FETCH_FAILED', message: err.message }
    });
  }
});

/**
 * POST /api/rbac/businesses
 * Register a new business venue
 */
router.post('/businesses', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, business_type, tagline, location, kitchen_hours, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Business name is required' }
      });
    }

    const created = await db.createBusiness(name.trim(), business_type || 'RESTAURANT');
    if (tagline || location || kitchen_hours || phone) {
      await db.updateBusinessProfile(created.id, { tagline, location, kitchen_hours, phone });
    }

    // Initialize initial default tables for the newly registered business
    await rbacService.seedDefaultTables(created.id);

    return res.status(201).json({
      success: true,
      data: created,
      message: `Business '${name.trim()}' registered successfully`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'BUSINESS_CREATION_FAILED', message: err.message }
    });
  }
});

/**
 * GET /api/rbac/branches
 * Lists all branches owned by the user (the primary business + any franchise branches)
 */
router.get('/branches', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const parentBusinessId = user.business?.id || 'maya-forest-resort';
    const branches = await db.getBranchesForOwner(user.id, parentBusinessId);

    const detailed = await Promise.all(
      branches.map(async (b) => {
        try {
          const [tableList, menuList] = await Promise.all([
            rbacService.getTables(b.id).catch(() => []),
            rbacService.getMenuItems(b.id, user).catch(() => [])
          ]);
          return {
            id: b.id,
            name: b.name,
            type: b.business_type,
            status: b.status,
            tagline: b.tagline,
            location: b.location,
            kitchen_hours: b.kitchen_hours,
            phone: b.phone,
            parent_business_id: b.parent_business_id,
            owner_uid: b.owner_uid,
            branch_code: b.branch_code,
            currency: b.currency,
            tax_rate: b.tax_rate,
            tableCount: tableList.length,
            menuCount: menuList.length,
            isPrimary: b.id === parentBusinessId,
            created_at: b.created_at,
          };
        } catch {
          return {
            id: b.id,
            name: b.name,
            type: b.business_type,
            status: b.status,
            tagline: b.tagline,
            location: b.location,
            kitchen_hours: b.kitchen_hours,
            phone: b.phone,
            parent_business_id: b.parent_business_id,
            owner_uid: b.owner_uid,
            branch_code: b.branch_code,
            currency: b.currency,
            tax_rate: b.tax_rate,
            tableCount: 0,
            menuCount: 0,
            isPrimary: b.id === parentBusinessId,
            created_at: b.created_at,
          };
        }
      })
    );

    return res.json({ success: true, data: detailed });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'BRANCHES_FETCH_FAILED', message: err.message }
    });
  }
});

/**
 * POST /api/rbac/branches & /api/rbac/branch
 * Creates a new franchise branch under the owner's account
 */
router.post(['/branches', '/branch'], authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const isOwnerOrAdmin = isOwnerSubject(user);
    if (!isOwnerOrAdmin) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only Business Owners and Admins can create franchise branches.' }
      });
    }

    const {
      name,
      branch_code,
      branchCode,
      business_type,
      businessType,
      location,
      phone,
      tagline,
      kitchen_hours,
      kitchenHours,
      currency,
      tax_rate,
      taxRate,
      clone_menu_from,
      cloneMenuFrom,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Branch name is required.' }
      });
    }

    const parentBusinessId = user.business?.id || 'maya-forest-resort';

    const result = await rbacService.createFranchiseBranch(
      {
        name: name.trim(),
        parentBusinessId,
        branchCode: branch_code || branchCode,
        businessType: business_type || businessType || user.business?.type || 'RESTAURANT',
        location: location || '',
        phone: phone || '',
        tagline: tagline || '',
        kitchenHours: kitchen_hours || kitchenHours || '07:30 AM – 10:30 PM',
        currency: currency || 'Rs.',
        taxRate: typeof tax_rate === 'number' ? tax_rate : (typeof taxRate === 'number' ? taxRate : 5),
        cloneMenuFrom: clone_menu_from || cloneMenuFrom || undefined,
      },
      user
    );

    return res.status(201).json({
      success: true,
      data: {
        id: result.branch.id,
        name: result.branch.name,
        type: result.branch.business_type,
        status: result.branch.status,
        tagline: result.branch.tagline,
        location: result.branch.location,
        kitchen_hours: result.branch.kitchen_hours,
        phone: result.branch.phone,
        parent_business_id: result.branch.parent_business_id,
        owner_uid: result.branch.owner_uid,
        branch_code: result.branch.branch_code,
        currency: result.branch.currency,
        tax_rate: result.branch.tax_rate,
      },
      cloneStats: result.cloneStats,
      message: `Franchise branch '${result.branch.name}' created successfully.`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'BRANCH_CREATION_FAILED', message: err.message }
    });
  }
});

// ============================================================================
// BUSINESS PROFILE & SETTINGS (Public Guest Info & Owner Configuration)
// ============================================================================

/**
 * GET /api/rbac/business-profile
 * Retrieves the business display name, tagline, location & kitchen hours
 */
router.get('/business-profile', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    let business = await db.findBusinessById(businessId);
    if (!business) {
      business = await db.getDefaultBusiness();
    }

    if (!business) {
      return res.status(404).json({
        success: false,
        error: { code: 'BUSINESS_NOT_FOUND', message: 'Business profile could not be found' }
      });
    }

    return res.json({
      success: true,
      data: {
        id: business.id,
        name: business.name,
        type: business.business_type,
        status: business.status,
        tagline: business.tagline || (business.business_type === 'HOTEL' ? 'Luxury Hospitality & Premier Guest Stays' : 'Authentic Cuisine • Prepared Fresh to Order'),
        location: business.location !== undefined ? business.location : 'Main Dining & Service Area',
        address: business.address || '',
        kitchen_hours: business.kitchen_hours || '07:30 AM – 10:30 PM',
        phone: business.phone || '',
        show_menu_images: business.show_menu_images !== false,
        menu_theme_config: business.menu_theme_config,
      }
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'BUSINESS_PROFILE_FETCH_FAILED', message: err.message }
    });
  }
});

/**
 * PUT /api/rbac/business-profile
 * Owner & Manager endpoint to update business name, tagline, location, and kitchen open timings
 */
router.put('/business-profile', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const role = rbacService.normalizeRole(user.role);
    const targetBusinessId = getTargetBusinessId(req);

    if (!canAccessResource(user, 'business_details', 'write')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'RBAC_ACCESS_DENIED',
          message: `Permission denied: updating business configuration ${describeResourceRequirement('business_details', 'write')}.`
        }
      });
    }

    const { name, business_type, tagline, location, address, kitchen_hours, phone, show_menu_images, showMenuImages, menu_theme_config, date_format_nav, date_format_billing } = req.body;
    
    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Business name cannot be empty.' }
      });
    }

    const updated = await db.updateBusinessProfile(targetBusinessId, {
      name,
      business_type,
      tagline,
      location,
      address,
      kitchen_hours,
      phone,
      show_menu_images: show_menu_images !== undefined ? show_menu_images : showMenuImages,
      menu_theme_config,
      date_format_nav,
      date_format_billing,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { code: 'BUSINESS_NOT_FOUND', message: 'Business not found' }
      });
    }

    return res.json({
      success: true,
      message: 'Business profile & operational details updated successfully',
      data: {
        id: updated.id,
        name: updated.name,
        type: updated.business_type,
        status: updated.status,
        tagline: updated.tagline,
        location: updated.location,
        address: updated.address || '',
        kitchen_hours: updated.kitchen_hours,
        phone: updated.phone,
        show_menu_images: updated.show_menu_images !== false,
        menu_theme_config: updated.menu_theme_config,
      }
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'BUSINESS_UPDATE_FAILED', message: err.message }
    });
  }
});

// ============================================================================
// CATEGORIES ENDPOINTS (Scoped strictly by business)
// ============================================================================

router.get('/categories', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const userContext = req.user || createGuestContext();
    const categories = await rbacService.getCategories(businessId, userContext);
    return res.json({ success: true, data: categories });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'CATEGORY_FETCH_FAILED', message: err.message }
    });
  }
});

router.post('/categories', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Category name is required' }
      });
    }
    const cat = await rbacService.createCategory(businessId, { name: name.trim() }, user);
    return res.status(201).json({ success: true, data: cat, message: 'Category created successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

router.put('/categories/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Category name is required' }
      });
    }
    await rbacService.updateCategory(businessId, req.params.id, { name: name.trim() }, user);
    return res.json({ success: true, message: 'Category renamed successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

router.delete('/categories/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    await rbacService.deleteCategory(businessId, req.params.id, user);
    return res.json({ success: true, message: 'Category deleted successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

// ============================================================================
// MENUS ENDPOINTS (Scoped strictly by business)
// ============================================================================

router.get('/menus', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const userContext = req.user || createGuestContext();
    const items = await rbacService.getMenuItems(businessId, userContext);
    return res.json({ success: true, data: items });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

router.post('/menus', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const {
      name,
      category,
      category_id,
      additional_categories,
      price,
      currency,
      description,
      image_url,
      food_type,
      status,
      is_available,
      has_variants,
      variants,
      display_style,
      show_image,
      promo_badge,
      order_index,
      preparation_time_mins,
    } = req.body;
    
    if (!name || price === undefined) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Item name and price are required' }
      });
    }

    const item = await rbacService.createMenuItem(
      businessId,
      { 
        name, 
        category: category || 'General', 
        category_id,
        additional_categories,
        price: Number(price), 
        currency: currency || 'Rs.', 
        description, 
        image_url,
        food_type: food_type || 'non-veg',
        status: status || 'available',
        is_available: status === 'available' || is_available === true, 
        has_variants: Boolean(has_variants),
        variants: Array.isArray(variants) ? variants : undefined,
        display_style,
        show_image: show_image !== undefined ? Boolean(show_image) : undefined,
        promo_badge,
        order_index: order_index !== undefined ? Number(order_index) : undefined,
        preparation_time_mins 
      },
      user
    );

    return res.status(201).json({ success: true, data: item, message: 'Menu item created successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

router.put('/menus/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const itemId = req.params.id;
    await rbacService.updateMenuItem(businessId, itemId, req.body, user);
    return res.json({ success: true, message: 'Menu item updated successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

router.patch('/menus/:id/status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const itemId = req.params.id;
    const { status, is_available } = req.body;
    await rbacService.updateMenuItem(businessId, itemId, { status, is_available }, user);
    return res.json({ success: true, message: 'Menu item availability status updated successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

router.delete('/menus/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const itemId = req.params.id;
    await rbacService.deleteMenuItem(businessId, itemId, user);
    return res.json({ success: true, message: 'Menu item deleted successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

// ============================================================================
// CHECK-INS ENDPOINTS (Scoped strictly by business)
// ============================================================================

router.get('/check-ins', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const status = req.query.status as any;
    const records = await rbacService.getCheckIns(businessId, user, status ? { status } : undefined);
    return res.json({ success: true, data: records });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

router.post('/check-ins', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const { guest_name, guest_phone, guest_email, room_or_table_number, total_amount, deposit_paid, notes } = req.body;

    if (!guest_name || !room_or_table_number) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Guest name and room or table number are required' }
      });
    }

    const checkIn = await rbacService.createCheckIn(
      businessId,
      { guest_name, guest_phone, guest_email, room_or_table_number, total_amount, deposit_paid, notes },
      user
    );

    return res.status(201).json({ success: true, data: checkIn, message: 'Check-in processed successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

router.put('/check-ins/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const checkInId = req.params.id;
    await rbacService.updateCheckIn(businessId, checkInId, req.body, user);
    return res.json({ success: true, message: 'Check-in record updated successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

router.delete('/check-ins/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const checkInId = req.params.id;
    await rbacService.deleteCheckIn(businessId, checkInId, user);
    return res.json({ success: true, message: 'Check-in record removed by Manager' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

// ============================================================================
// STAFF & TEAM MANAGEMENT ENDPOINTS (Scoped by business)
// ============================================================================

router.get('/staff', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const team = await rbacService.getTeamMembers(businessId, user);
    return res.json({ success: true, data: team });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'RBAC_ACCESS_DENIED', message: err.message }
    });
  }
});

router.post('/staff', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const { email, password, role, allowed_tabs } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Email, initial password, and role are required.' }
      });
    }

    const newStaff = await rbacService.createStaffMember(
      businessId,
      { email, password, role, allowed_tabs },
      user
    );

    return res.status(201).json({
      success: true,
      data: newStaff,
      message: `Staff account provisioned for ${email} with role ${role}`
    });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 400).json({
      success: false,
      error: { code: 'STAFF_CREATION_FAILED', message: err.message }
    });
  }
});

router.patch('/staff/:id/role', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const targetUserId = req.params.id;
    const { role, allowed_tabs } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'New role must be specified.' }
      });
    }

    const updated = await rbacService.updateStaffRole(businessId, targetUserId, role, user, allowed_tabs);
    return res.json({
      success: true,
      data: updated,
      message: `Role successfully updated to ${role}`
    });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 400).json({
      success: false,
      error: { code: 'ROLE_UPDATE_FAILED', message: err.message }
    });
  }
});

router.delete('/staff/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const targetUserId = req.params.id;
    await rbacService.removeStaffMember(businessId, targetUserId, user);
    return res.json({
      success: true,
      message: 'Staff account removed successfully'
    });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 400).json({
      success: false,
      error: { code: 'STAFF_DELETION_FAILED', message: err.message }
    });
  }
});

// ============================================================================
// TABLES & DIGITAL ORDERING ENDPOINTS (Strictly Isolated by business)
// ============================================================================

router.get('/tables', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const tables = await rbacService.getTables(businessId, req.user);
    return res.json({ success: true, data: tables });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'TABLES_FETCH_FAILED', message: err.message }
    });
  }
});

router.post('/tables', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const { table_number, floor, building, capacity, status } = req.body;

    if (!table_number || !table_number.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Table number is required' }
      });
    }

    const table = await rbacService.createTable(
      businessId,
      { table_number: table_number.trim(), floor, building, capacity, status },
      user
    );

    return res.status(201).json({ success: true, data: table, message: 'Table created successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'TABLE_CREATION_FAILED', message: err.message }
    });
  }
});

router.post('/tables/seed-defaults', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const tables = await rbacService.seedDefaultTables(businessId);
    return res.json({ success: true, data: tables, message: 'Default tables initialized for business' });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'TABLE_SEED_FAILED', message: err.message }
    });
  }
});

router.put('/tables/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const tableId = req.params.id;
    await rbacService.updateTable(businessId, tableId, req.body, user);
    return res.json({ success: true, message: 'Table updated successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'TABLE_UPDATE_FAILED', message: err.message }
    });
  }
});

router.patch('/tables/:id/status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const tableId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Status is required' }
      });
    }

    await rbacService.updateTableStatus(businessId, tableId, status, user);
    return res.json({ success: true, message: `Table status updated to ${status}` });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'STATUS_UPDATE_FAILED', message: err.message }
    });
  }
});

router.delete('/tables/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const tableId = req.params.id;
    await rbacService.deleteTable(businessId, tableId, user);
    return res.json({ success: true, message: 'Table deleted successfully' });
  } catch (err: any) {
    return res.status(err.message.includes('Permission denied') ? 403 : 500).json({
      success: false,
      error: { code: 'TABLE_DELETION_FAILED', message: err.message }
    });
  }
});

/**
 * Public Scan Check-In: Customer scans QR barcode on table
 * Distinguishes the first scanner as Table Host and subsequent scans as View-Only Guests.
 */
router.post('/tables/scan-checkin', async (req: Request, res: Response) => {
  try {
    const { businessId, tableId, tableNumber, existingHostToken, hostToken } = req.body;
    const targetBusinessId = businessId || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';
    const targetTableId = tableId || `tbl-${tableNumber ? encodeURIComponent(tableNumber) : '1'}`;

    const result = await rbacService.scanTableCheckIn(targetBusinessId, targetTableId, { 
      tableNumber, 
      existingHostToken: existingHostToken || hostToken 
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SCAN_CHECKIN_FAILED', message: err.message }
    });
  }
});

/**
 * Manager/Staff Manual Session Reset: Manually clears dining session and resets table to ACTIVE
 */
router.post('/tables/:id/reset-session', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const tableId = req.params.id;

    const updatedTable = await rbacService.resetTableSession(businessId, tableId, user);
    return res.json({
      success: true,
      data: updatedTable,
      message: `Table ${updatedTable.table_number || tableId} session has been cleared and made available.`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'TABLE_SESSION_RESET_FAILED', message: err.message }
    });
  }
});

/**
 * Public/Guest Table Reset: Customer requests bill or pays, setting table back to ACTIVE default
 */
router.post('/tables/reset-status', async (req: Request, res: Response) => {
  try {
    const { businessId, tableId, tableNumber } = req.body;
    const targetBusinessId = businessId || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';
    await rbacService.resetTableToDefault(targetBusinessId, tableId, tableNumber);
    return res.json({ success: true, message: 'Table status reset to default ACTIVE successfully' });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'TABLE_RESET_FAILED', message: err.message }
    });
  }
});

/**
 * Customer Digital Order Placement (via Cart UI)
 */
router.post('/orders', async (req: Request, res: Response) => {
  try {
    const { businessId, table_id, table_number, floor, building, items, currency, customer_name, customer_phone, order_notes, existing_order_id, existingOrderId, host_token, hostToken } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'EMPTY_ORDER', message: 'Cart items cannot be empty.' }
      });
    }

    const targetBusinessId = businessId || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';
    const order = await rbacService.createTableOrder(targetBusinessId, {
      table_id: table_id || 'table-general',
      table_number: table_number || 'Table 1',
      floor: floor || null,
      building: building || null,
      items,
      currency: currency || 'Rs.',
      customer_name: customer_name || 'Guest',
      customer_phone: customer_phone || '',
      order_notes: order_notes || '',
      existing_order_id: existing_order_id || existingOrderId,
      host_token: host_token || hostToken,
    });

    return res.status(201).json({
      success: true,
      data: order,
      message: `Order ${order.id} processed successfully!`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'ORDER_CREATION_FAILED', message: err.message }
    });
  }
});

/**
 * Customer Digital Order Placement alias (/table-orders)
 */
router.post('/table-orders', async (req: Request, res: Response) => {
  try {
    const { business_id, businessId, table_id, table_number, floor, building, items, currency, customer_name, customer_phone, order_notes, general_notes, existing_order_id, existingOrderId, host_token, hostToken } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'EMPTY_ORDER', message: 'Cart items cannot be empty.' }
      });
    }

    const targetBusinessId = business_id || businessId || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';
    const order = await rbacService.createTableOrder(targetBusinessId, {
      table_id: table_id || 'table-general',
      table_number: table_number || 'Table 1',
      floor: floor || null,
      building: building || null,
      items,
      currency: currency || 'Rs.',
      customer_name: customer_name || 'Guest',
      customer_phone: customer_phone || '',
      order_notes: order_notes || general_notes || '',
      existing_order_id: existing_order_id || existingOrderId,
      host_token: host_token || hostToken,
    });

    return res.status(201).json({
      success: true,
      data: order,
      message: `Order ${order.id} processed successfully!`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'ORDER_CREATION_FAILED', message: err.message }
    });
  }
});

/**
 * Get active orders for business/kitchen
 */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const businessId = (req.query.businessId as string) || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';
    const tableId = req.query.tableId as string;
    const orders = await rbacService.getTableOrders(businessId, createSystemContext(), tableId);
    return res.json({ success: true, data: orders });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'ORDERS_FETCH_FAILED', message: err.message }
    });
  }
});

/**
 * Update order status (Kitchen/Bar/Waiter)
 */
router.put('/orders/:orderId/status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, businessId } = req.body;
    const targetBusinessId = businessId || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';

    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_STATUS', message: 'Status is required' }
      });
    }

    const updatedOrder = await rbacService.updateTableOrderStatus(
      targetBusinessId,
      orderId,
      status
    );

    return res.json({
      success: true,
      data: updatedOrder,
      message: `Order status updated to ${status}`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'ORDER_UPDATE_FAILED', message: err.message }
    });
  }
});

/**
 * Update individual item status (Kitchen station & Bar station dish/beverage readiness)
 */
router.put('/orders/:orderId/items/:itemIndex/status', async (req: Request, res: Response) => {
  try {
    const { orderId, itemIndex } = req.params;
    const { status, businessId } = req.body;
    const targetBusinessId = businessId || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';

    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_STATUS', message: 'Item status is required' }
      });
    }

    const updatedOrder = await rbacService.updateTableOrderItemStatus(
      targetBusinessId,
      orderId,
      { index: parseInt(itemIndex, 10) },
      status
    );

    return res.json({
      success: true,
      data: updatedOrder,
      message: `Item #${itemIndex} status updated to ${status}`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'ITEM_STATUS_UPDATE_FAILED', message: err.message }
    });
  }
});

/**
 * Update individual item status by key or id (Kitchen station & Bar station)
 */
router.patch('/orders/:orderId/items/status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { itemIndex, itemKey, itemId, status, businessId } = req.body;
    const targetBusinessId = businessId || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';

    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_STATUS', message: 'Item status is required' }
      });
    }

    const updatedOrder = await rbacService.updateTableOrderItemStatus(
      targetBusinessId,
      orderId,
      {
        index: typeof itemIndex === 'number' ? itemIndex : undefined,
        itemKey,
        itemId
      },
      status
    );

    return res.json({
      success: true,
      data: updatedOrder,
      message: `Item status updated to ${status}`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'ITEM_STATUS_UPDATE_FAILED', message: err.message }
    });
  }
});

/**
 * POST /api/rbac/orders/cleanup
 * Manually or automatically trigger daily order purge (>24h) and 30-day sales retention
 */
router.post('/orders/cleanup', async (req: Request, res: Response) => {
  try {
    const businessId = (req.query.businessId as string) || (req.body.businessId as string);
    const result = await rbacService.cleanupDailyOrdersAndOldSales(businessId);
    return res.json({
      success: true,
      data: result,
      message: `Cleanup completed: deleted ${result.deletedOrders} orders (>24h) and ${result.deletedSales} sales (>30d).`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'CLEANUP_FAILED', message: err.message }
    });
  }
});

/**
 * DELETE /api/rbac/orders/completed
 * Purge all completed and cancelled table tickets from database on demand
 */
router.delete('/orders/completed', async (req: Request, res: Response) => {
  try {
    const businessId = (req.query.businessId as string) || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';
    const result = await rbacService.purgeCompletedTableOrders(businessId);
    return res.json({
      success: true,
      data: result,
      message: `Successfully cleared ${result.deletedCount} completed table order(s).`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'PURGE_COMPLETED_FAILED', message: err.message }
    });
  }
});


// ============================================================================
// PAY-FIRST ORDER SETTLEMENT
// ============================================================================

router.post('/orders/:id/confirm-payment', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const orderId = req.params.id;
    const { payment_method, notes } = req.body;
    
    // Using cashier name as the user's name or email
    const cashierName = (user as any).name || user.email || 'Cashier';
    
    await rbacService.confirmTableOrderPayment(orderId, businessId, payment_method, cashierName, notes);
    
    return res.json({ success: true, message: 'Payment confirmed and order processed to Kitchen' });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'PAYMENT_CONFIRM_FAILED', message: err.message }
    });
  }
});

router.post('/orders/:id/reject-payment', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const businessId = getTargetBusinessId(req);
    const orderId = req.params.id;
    const { reason } = req.body;
    
    const cashierName = (user as any).name || user.email || 'Cashier';
    
    await rbacService.rejectTableOrderPayment(orderId, businessId, reason, cashierName);
    
    return res.json({ success: true, message: 'Payment rejected and order cancelled' });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'PAYMENT_REJECT_FAILED', message: err.message }
    });
  }
});

router.post('/orders/:id/payment-method', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    // This can be called unauthenticated by the guest via CustomerMenuPreviewPage/OrderSuccessModal
    const businessId = (req.query.businessId as string) || req.body.businessId || req.body.business_id;
    const orderId = req.params.id;
    const { payment_method } = req.body;
    
    if (!businessId) throw new Error("businessId required");
    
    try {
      await prisma.tableOrder.updateMany({
        where: { id: orderId, business_id: businessId },
        data: { payment_method },
      });
    } catch (e: any) {
      console.warn('Prisma payment-method update note:', e.message);
    }

    realtimeEmitter.orderUpdated(businessId, { id: orderId, payment_method });
    
    return res.json({ success: true, message: 'Payment method updated' });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'PAYMENT_METHOD_UPDATE_FAILED', message: err.message }
    });
  }
});

router.post(['/orders/:id/acknowledge-bill', '/orders/:id/folio-delivered'], optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const businessId = (req.query.businessId as string) || req.body.businessId || req.body.business_id;
    const orderId = req.params.id;
    const requestId = req.body.requestId || req.body.request_id;

    if (!businessId) throw new Error("businessId required");

    const result = await rbacService.acknowledgeOrderBillFolio(businessId, orderId, requestId);
    return res.json({ success: true, data: result, message: 'Folio delivery acknowledged' });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'BILL_ACKNOWLEDGE_FAILED', message: err.message }
    });
  }
});

router.post('/orders/:id/request-bill', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const businessId = (req.query.businessId as string) || req.body.businessId || req.body.business_id;
    const orderId = req.params.id;
    const { payment_method, promo_code, promo_discount, total_amount, currency, notes } = req.body;

    if (!businessId) throw new Error('businessId required');

    const now = new Date();
    const existingOrder = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    if (!existingOrder) throw new Error(`Order ${orderId} not found`);

    const updatedOrder = await prisma.tableOrder.update({
      where: { id: orderId },
      data: {
        bill_requested: true,
        bill_requested_at: now,
        payment_method: payment_method || existingOrder.payment_method || undefined,
        promo_code: promo_code || existingOrder.promo_code || undefined,
        promo_discount: promo_discount != null ? Number(promo_discount) : undefined,
        total_amount: total_amount != null ? Number(total_amount) : undefined,
      },
    });

    const pingId = `bill-${orderId}`;
    const srv = await prisma.serviceRequest.upsert({
      where: { id: pingId },
      update: {
        status: 'PENDING',
        payment_method: payment_method || existingOrder.payment_method || 'CASH',
        total_amount: total_amount != null ? Number(total_amount) : Number(existingOrder.total_amount),
        currency: currency || existingOrder.currency || 'Rs.',
      },
      create: {
        id: pingId,
        business_id: businessId,
        type: 'BILL_REQUEST',
        order_id: orderId,
        table_id: existingOrder.table_id || '',
        table_number: existingOrder.table_number || '',
        order_number: existingOrder.order_number,
        payment_method: payment_method || existingOrder.payment_method || 'CASH',
        total_amount: total_amount != null ? Number(total_amount) : Number(existingOrder.total_amount),
        currency: currency || existingOrder.currency || 'Rs.',
        status: 'PENDING',
        notes: notes || undefined,
      },
    });

    realtimeEmitter.orderUpdated(businessId, updatedOrder);
    realtimeEmitter.serviceRequestUpdated(businessId, srv);

    return res.json({ success: true, data: updatedOrder, message: 'Bill requested' });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'BILL_REQUEST_FAILED', message: err.message },
    });
  }
});

// ============================================================================
// BILLING, POS SALES & TAX CONFIGURATION
// ============================================================================

/**
 * GET /api/rbac/tax-config
 * Get tax configuration for a business
 */
router.get('/tax-config', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const config = await rbacService.getTaxConfig(businessId);
    return res.json({ success: true, data: config });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'TAX_CONFIG_FETCH_FAILED', message: err.message }
    });
  }
});

/**
 * PUT /api/rbac/tax-config
 * Update tax configuration for a business
 */
router.put('/tax-config', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const config = await rbacService.updateTaxConfig(businessId, req.body, req.user);
    return res.json({
      success: true,
      data: config,
      message: 'Tax configuration saved successfully'
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'TAX_CONFIG_UPDATE_FAILED', message: err.message }
    });
  }
});

// ============================================================================
// GL (GENERAL LEDGER) ACCOUNTS & ERP MAPPING (Owner Configurable)
// ============================================================================

/**
 * GET /api/rbac/gl-accounts
 * Fetch all configured GL account numbers, names, and mappings
 */
router.get('/gl-accounts', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const accounts = await rbacService.getGLAccounts(businessId);
    return res.json({ success: true, data: accounts });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'GL_ACCOUNTS_FETCH_FAILED', message: err.message }
    });
  }
});

/**
 * POST /api/rbac/gl-accounts
 * Create a new GL Account link (Owner / Admin)
 */
router.post('/gl-accounts', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const account = await rbacService.createGLAccount(businessId, req.body, req.user);
    return res.status(201).json({
      success: true,
      data: account,
      message: `GL Account ${account.account_number} created successfully`
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'GL_ACCOUNT_CREATE_FAILED', message: err.message }
    });
  }
});

/**
 * PUT /api/rbac/gl-accounts/:id
 * Update an existing GL Account link (Owner / Admin)
 */
router.put('/gl-accounts/:id', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const accountId = req.params.id;
    const updated = await rbacService.updateGLAccount(businessId, accountId, req.body, req.user);
    return res.json({
      success: true,
      data: updated,
      message: `GL Account ${updated.account_number} updated successfully`
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'GL_ACCOUNT_UPDATE_FAILED', message: err.message }
    });
  }
});

/**
 * DELETE /api/rbac/gl-accounts/:id
 * Delete a GL Account link (Owner / Admin)
 */
router.delete('/gl-accounts/:id', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const accountId = req.params.id;
    await rbacService.deleteGLAccount(businessId, accountId, req.user);
    return res.json({
      success: true,
      message: 'GL Account removed successfully'
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'GL_ACCOUNT_DELETE_FAILED', message: err.message }
    });
  }
});

/**
 * POST /api/rbac/gl-accounts/reset-default
 * Restore standard hospitality chart of accounts
 */
router.post('/gl-accounts/reset-default', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const defaults = await rbacService.resetDefaultGLAccounts(businessId, req.user);
    return res.json({
      success: true,
      data: defaults,
      message: 'Restored standard hospitality General Ledger chart of accounts'
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'GL_ACCOUNTS_RESET_FAILED', message: err.message }
    });
  }
});

/**
 * GET /api/rbac/sales
 * Get sales records with date, range, and payment method filters
 */
router.get('/sales', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const date = req.query.date as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const paymentMethod = req.query.paymentMethod as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const sales = await rbacService.getSales(businessId, {
      date,
      startDate,
      endDate,
      paymentMethod,
      limit
    });

    return res.json({ success: true, data: sales });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SALES_FETCH_FAILED', message: err.message }
    });
  }
});

/**
 * POST /api/rbac/sales
 * Create a new POS / Table sale record
 */
router.post('/sales', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const saleData = req.body;
    const sale = await rbacService.createSale(businessId, saleData, req.user);

    return res.status(201).json({
      success: true,
      data: sale,
      message: 'Sale record registered successfully'
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SALE_CREATION_FAILED', message: err.message }
    });
  }
});

/**
 * DELETE /api/rbac/sales/:saleId
 * Delete a single sale record
 */
router.delete('/sales/:saleId', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const { saleId } = req.params;
    await rbacService.deleteSale(businessId, saleId, req.user);

    return res.json({
      success: true,
      message: `Sale record ${saleId} deleted successfully`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SALE_DELETION_FAILED', message: err.message }
    });
  }
});

/**
 * DELETE /api/rbac/sales
 * Bulk delete:
 * - ?date=YYYY-MM-DD : Delete all sales records for a single day
 * - ?all=true : Delete all sales records
 */
router.delete('/sales', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = getTargetBusinessId(req);
    const date = req.query.date as string | undefined;
    const all = req.query.all === 'true';

    if (date) {
      const result = await rbacService.deleteSalesByDate(businessId, date, req.user);
      return res.json({
        success: true,
        data: result,
        message: `Deleted ${result.deletedCount} sale record(s) for ${date}`
      });
    }

    if (all) {
      const result = await rbacService.deleteAllSales(businessId, req.user);
      return res.json({
        success: true,
        data: result,
        message: `Cleared entire sales history (${result.deletedCount} records deleted)`
      });
    }

    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PARAMETERS', message: 'Specify either ?date=YYYY-MM-DD or ?all=true' }
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SALES_BATCH_DELETE_FAILED', message: err.message }
    });
  }
});

/**
 * GET /api/rbac/businesses/:businessId/operations
 * Retrieve business operational preferences, current day status, and recent shift history
 */
router.get('/businesses/:businessId/operations', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const biz = await prisma.business.findUnique({
      where: { id: businessId },
      select: { operations_config: true, current_operational_day: true },
    });

    const history = await prisma.operationalDay.findMany({
      where: { business_id: businessId },
      orderBy: { businessDate: 'desc' },
      take: 20,
    });

    return res.json({
      success: true,
      data: {
        operations_config: biz?.operations_config || null,
        current_operational_day: biz?.current_operational_day || null,
        history: history.map((h) => ({
          id: h.id,
          businessDate: h.businessDate,
          status: h.status,
          openedAt: h.openedAt?.toISOString(),
          closedAt: h.closedAt?.toISOString(),
          openedBy: h.openedBy,
          closedBy: h.closedBy,
          ...(h.data && typeof h.data === 'object' ? h.data : {}),
        })),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/rbac/businesses/:businessId/operations/config
 * Save automatic schedule & operational preferences
 */
router.put('/businesses/:businessId/operations/config', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const { config } = req.body;
    await db.ensureBusiness(businessId);
    await prisma.business.update({
      where: { id: businessId },
      data: { operations_config: config },
    });
    return res.json({ success: true, message: 'Operations config saved' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/rbac/businesses/:businessId/operations/days
 * Start or record a new business operational day
 */
router.post('/businesses/:businessId/operations/days', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const dayData = req.body;
    await db.ensureBusiness(businessId);

    const created = await prisma.operationalDay.create({
      data: {
        id: dayData.id || undefined,
        business_id: businessId,
        businessDate: dayData.businessDate,
        status: dayData.status || 'OPEN',
        openedAt: dayData.openedAt ? new Date(dayData.openedAt) : new Date(),
        openedBy: dayData.openedBy || null,
        data: dayData,
      },
    });

    const fullRecord = { ...dayData, id: created.id };
    await prisma.business.update({
      where: { id: businessId },
      data: { current_operational_day: fullRecord },
    });

    return res.json({ success: true, data: fullRecord });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/rbac/businesses/:businessId/operations/days/:dayId
 * Update an existing operational day (close, reopen, override date)
 */
router.put('/businesses/:businessId/operations/days/:dayId', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const { businessId, dayId } = req.params;
    const dayData = req.body;

    await prisma.operationalDay.update({
      where: { id: dayId },
      data: {
        status: dayData.status || undefined,
        closedAt: dayData.closedAt ? new Date(dayData.closedAt) : undefined,
        closedBy: dayData.closedBy || undefined,
        businessDate: dayData.businessDate || undefined,
        data: dayData,
      },
    }).catch(() => {});

    await prisma.business.update({
      where: { id: businessId },
      data: { current_operational_day: dayData },
    });

    return res.json({ success: true, data: dayData });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/rbac/service-requests
 * Create or submit a guest waiter call or service request
 */
router.post('/service-requests', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const { id, type, business_id, table_id, table_number, order_id, order_number, customer_name, total_amount, currency } = req.body;
    const businessId = business_id || (req.query.businessId as string);
    if (!businessId) return res.status(400).json({ success: false, error: 'business_id is required' });

    const reqId = id || `req-${Date.now()}`;
    await db.ensureBusiness(businessId);

    const srv = await prisma.serviceRequest.upsert({
      where: { id: reqId },
      update: {
        type: type || 'CALL_WAITER',
        order_id: order_id || null,
        order_number: order_number || null,
        status: 'PENDING',
        total_amount: total_amount != null ? Number(total_amount) : null,
      },
      create: {
        id: reqId,
        business_id: businessId,
        type: type || 'CALL_WAITER',
        table_id: table_id || '',
        table_number: String(table_number || 'Table'),
        order_id: order_id || null,
        order_number: order_number || null,
        total_amount: total_amount != null ? Number(total_amount) : null,
        currency: currency || 'Rs.',
        status: 'PENDING',
      },
    });

    if (table_id) {
      await prisma.restaurantTable.update({
        where: { id: table_id },
        data: {
          waiter_ping: {
            active: true,
            timestamp: new Date().toISOString(),
          },
        },
      }).catch(() => {});

      realtimeEmitter.tableUpdated(businessId, {
        id: table_id,
        waiter_ping: { active: true, timestamp: new Date().toISOString() },
      });
    }

    realtimeEmitter.serviceRequestUpdated(businessId, srv);

    return res.json({ success: true, data: srv });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/rbac/service-requests
 * Fetch all pending service requests for a business
 */
router.get('/service-requests', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const businessId = (req.query.businessId as string) || (req.query.business_id as string);
    if (!businessId) return res.status(400).json({ success: false, error: 'businessId required' });

    const requests = await prisma.serviceRequest.findMany({
      where: {
        business_id: businessId,
        status: { in: ['PENDING', 'ATTENDED'] },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return res.json({
      success: true,
      data: requests.map((r) => ({
        ...r,
        total_amount: r.total_amount ? Number(r.total_amount) : 0,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/rbac/tables/:tableId/acknowledge-ping
 * Acknowledge / dismiss active waiter ping on a table
 */
router.post('/tables/:tableId/acknowledge-ping', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const businessId = (req.query.businessId as string) || req.body.businessId || req.body.business_id;

    if (tableId) {
      await prisma.restaurantTable.update({
        where: { id: tableId },
        data: { waiter_ping: { active: false } },
      }).catch(() => {});

      if (businessId) {
        await prisma.serviceRequest.updateMany({
          where: {
            table_id: tableId,
            business_id: businessId,
            type: 'CALL_WAITER',
            status: 'PENDING',
          },
          data: {
            status: 'ATTENDED',
            resolved_at: new Date(),
          },
        }).catch(() => {});

        realtimeEmitter.tableUpdated(businessId, { id: tableId, waiter_ping: { active: false } });
      }
    }

    return res.json({ success: true, message: 'Waiter ping acknowledged' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

