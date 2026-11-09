import { Router, Request, Response } from 'express';
import {
  authenticate,
  optionalAuthenticate,
  AuthenticatedRequest,
  assertBusinessAccess,
  requireResourceAccess,
  requireOwnerOrManager,
} from '../middleware/auth.middleware';
import { customerDiningLimiter } from '../middleware/rateLimit.middleware';
import { rbacService } from '../services/rbac.service';
import { db } from '../services/db.service';
import { auditService } from '../services/audit.service';
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
import { erpService } from '../services/integrations/erpService';

const router = Router();

/**
 * Helper to resolve the targeted business ID from query, headers, body, or authenticated user
 * Enforces tenant isolation for authenticated staff/users to prevent IDOR vulnerabilities.
 */
async function getTargetBusinessId(req: AuthenticatedRequest): Promise<string> {
  const queryBiz = req.query.businessId as string;
  let targetBiz = '';
  if (queryBiz && typeof queryBiz === 'string' && queryBiz.trim()) {
    targetBiz = queryBiz.trim();
  } else {
    const headerBiz = req.headers['x-business-id'] as string;
    if (headerBiz && typeof headerBiz === 'string' && headerBiz.trim()) {
      targetBiz = headerBiz.trim();
    } else {
      const bodyBiz = req.body?.business_id || req.body?.businessId;
      if (bodyBiz && typeof bodyBiz === 'string' && bodyBiz.trim()) {
        targetBiz = bodyBiz.trim();
      } else if (req.user?.business?.id) {
        targetBiz = req.user.business.id;
      } else {
        targetBiz = 'maya-forest-resort';
      }
    }
  }

  if (req.user) {
    const isAuthorized = await assertBusinessAccess(req.user, targetBiz);
    if (!isAuthorized) {
      const err: any = new Error(`Access denied: You do not have permission to access or modify data for venue '${targetBiz}'.`);
      err.statusCode = 403;
      err.code = 'TENANT_ACCESS_DENIED';
      throw err;
    }
  }

  return targetBiz;
}

type AsyncBusinessHandler = (
  req: AuthenticatedRequest,
  res: Response,
  businessId: string
) => Promise<any>;

/**
 * Concise async route handler wrapper that automatically resolves and isolates the target
 * business ID, enforcing tenant authorization and mapping errors to consistent JSON responses.
 */
function asyncHandler(
  errorCode: string,
  fn: AsyncBusinessHandler
): (req: AuthenticatedRequest, res: Response) => Promise<any>;
function asyncHandler(
  errorCode: string,
  fallbackStatus: number,
  fn: AsyncBusinessHandler
): (req: AuthenticatedRequest, res: Response) => Promise<any>;
function asyncHandler(
  fn: AsyncBusinessHandler
): (req: AuthenticatedRequest, res: Response) => Promise<any>;
function asyncHandler(
  codeOrFn: string | AsyncBusinessHandler,
  statusOrFn?: number | AsyncBusinessHandler,
  maybeFn?: AsyncBusinessHandler
) {
  let defaultCode = 'INTERNAL_ERROR';
  let fallbackStatus = 500;
  let fn: AsyncBusinessHandler;

  if (typeof codeOrFn === 'function') {
    fn = codeOrFn;
  } else {
    defaultCode = codeOrFn;
    if (typeof statusOrFn === 'function') {
      fn = statusOrFn;
    } else {
      if (typeof statusOrFn === 'number') fallbackStatus = statusOrFn;
      fn = maybeFn!;
    }
  }

  return async (req: AuthenticatedRequest, res: Response) => {
    try {
      const businessId = await getTargetBusinessId(req);
      return await fn(req, res, businessId);
    } catch (err: any) {
      if (res.headersSent) {
        return;
      }
      const isDenied =
        err?.statusCode === 403 ||
        err?.message?.includes('Permission denied') ||
        err?.message?.includes('Access denied');
      const status = err?.statusCode || (isDenied ? 403 : fallbackStatus);
      const code = err?.code || (isDenied && defaultCode === 'INTERNAL_ERROR' ? 'RBAC_ACCESS_DENIED' : defaultCode);
      return res.status(status).json({
        success: false,
        error: { code, message: err?.message || String(err) || 'Internal error' },
      });
    }
  };
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

/**
 * DELETE /api/rbac/branches & /api/rbac/branch
 * Permanently deletes a franchise branch
 */
router.delete(['/branches/:branchId(*)', '/branch/:branchId(*)', '/branches', '/branch'], authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }

    const isOwnerOrAdmin = isOwnerSubject(user);
    if (!isOwnerOrAdmin) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only Business Owners and Admins can delete franchise branches.' }
      });
    }

    const branchId = req.params.branchId || (req.query.branchId as string) || (req.body?.branchId as string);
    if (!branchId || typeof branchId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Branch ID is required for deletion.' }
      });
    }

    const branch = await db.findBusinessById(branchId);
    if (!branch) {
      return res.status(404).json({
        success: false,
        error: { code: 'BRANCH_NOT_FOUND', message: 'Franchise branch not found.' }
      });
    }

    if (!branch.parent_business_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_DELETE_HQ', message: 'Primary HQ business location cannot be deleted.' }
      });
    }

    // Verify ownership
    const parentBusinessId = user.business?.id || 'maya-forest-resort';
    if (branch.owner_uid && branch.owner_uid !== user.id && branch.parent_business_id !== parentBusinessId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have permission to delete this franchise branch.' }
      });
    }

    const deleted = await db.deleteBranch(branchId);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: { code: 'BRANCH_DELETION_FAILED', message: 'Unable to delete branch.' }
      });
    }

    auditService.log({
      userId: user.id,
      email: user.email,
      businessId: branch.parent_business_id || parentBusinessId,
      eventType: 'FRANCHISE_BRANCH_DELETED',
      status: `BRANCH_${branchId}_DELETED_BY_${user.email}`,
    });

    return res.json({
      success: true,
      data: { id: branchId },
      message: `Franchise branch '${branch.name}' has been permanently deleted.`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'BRANCH_DELETION_FAILED', message: err.message }
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
router.get('/business-profile', optionalAuthenticate, asyncHandler('BUSINESS_PROFILE_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
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
      kds_print_mode: business.kds_print_mode || 'DISPLAY_ONLY',
      default_language: (business as any).default_language || 'en',
      has_comp_password: Boolean(business.comp_password || (business as any).comp_password_hash),
    }
  });
}));

/**
 * PUT /api/rbac/business-profile
 * Owner & Manager endpoint to update business name, tagline, location, and kitchen open timings
 */

/**
 * GET /api/rbac/business/comp-password
 * Owner/Manager endpoint to view universal complementary password
 */
router.get('/business/comp-password', authenticate, requireOwnerOrManager, asyncHandler('COMP_PASSWORD_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, targetBusinessId: string) => {
  const result = await rbacService.getBusinessCompPassword(targetBusinessId, req.user);
  return res.json({ success: true, data: result });
}));

/**
 * POST /api/rbac/business/comp-password
 * Owner/Manager endpoint to set/regenerate universal complementary password
 */
router.post('/business/comp-password', authenticate, requireOwnerOrManager, asyncHandler('COMP_PASSWORD_UPDATE_FAILED', async (req: AuthenticatedRequest, res: Response, targetBusinessId: string) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PASSWORD', message: 'Password is required' }
    });
  }
  const result = await rbacService.updateBusinessCompPassword(targetBusinessId, password.trim(), req.user);
  return res.json({ success: true, data: result });
}));

/**
 * POST /api/rbac/business/comp-password/verify
 * Public / Table QR endpoint to verify universal complementary password
 */
router.post('/business/comp-password/verify', customerDiningLimiter, asyncHandler('COMP_PASSWORD_VERIFY_FAILED', async (req: Request, res: Response) => {
  const { business_id, businessId, password } = req.body;
  const targetBusinessId = business_id || businessId || (await db.getDefaultBusiness())?.id;
  if (!targetBusinessId) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_BUSINESS', message: 'Business ID is required' }
    });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_PASSWORD', message: 'Password is required' }
    });
  }
  const result = await rbacService.verifyCompPassword(targetBusinessId, password.trim());
  return res.json({ success: true, ...result });
}));

router.put('/business-profile', authenticate, asyncHandler('BUSINESS_UPDATE_FAILED', async (req: AuthenticatedRequest, res: Response, targetBusinessId: string) => {
  const user = req.user!;
  const role = rbacService.normalizeRole(user.role);

  if (!canAccessResource(user, 'business_details', 'write')) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'RBAC_ACCESS_DENIED',
        message: `Permission denied: updating business configuration ${describeResourceRequirement('business_details', 'write')}.`
      }
    });
  }

  const { name, business_type, tagline, location, address, kitchen_hours, phone, show_menu_images, showMenuImages, menu_theme_config, date_format_nav, date_format_billing, kds_print_mode, kdsPrintMode, default_language, defaultLanguage } = req.body;
  
  if (name !== undefined && (!name || !name.trim())) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Business name cannot be empty.' }
    });
  }

  const targetPrintMode = kds_print_mode || kdsPrintMode;
  const ALLOWED_LANGUAGES = ['en', 'ne', 'zh-CN', 'hi', 'ko', 'ja', 'th', 'tl', 'si', 'ta'];
  let targetDefaultLanguage = default_language !== undefined ? default_language : defaultLanguage;
  if (targetDefaultLanguage !== undefined && targetDefaultLanguage !== null) {
    if (typeof targetDefaultLanguage !== 'string' || !ALLOWED_LANGUAGES.includes(targetDefaultLanguage.trim())) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_LANGUAGE',
          message: `Invalid default_language '${targetDefaultLanguage}'. Supported languages are: ${ALLOWED_LANGUAGES.join(', ')}`
        }
      });
    }
    targetDefaultLanguage = targetDefaultLanguage.trim();
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
    ...(targetPrintMode !== undefined ? { kds_print_mode: targetPrintMode } : {}),
    ...(targetDefaultLanguage !== undefined ? { default_language: targetDefaultLanguage } : {}),
  });

  if (!updated) {
    return res.status(404).json({
      success: false,
      error: { code: 'BUSINESS_NOT_FOUND', message: 'Business not found' }
    });
  }

  realtimeEmitter.businessProfileUpdated(targetBusinessId, updated);

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
      kds_print_mode: updated.kds_print_mode || 'DISPLAY_ONLY',
      default_language: updated.default_language || 'en',
    }
  });
}));

// ============================================================================
// CATEGORIES ENDPOINTS (Scoped strictly by business)
// ============================================================================

router.get('/categories', optionalAuthenticate, asyncHandler('CATEGORY_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const userContext = req.user || createGuestContext();
  const categories = await rbacService.getCategories(businessId, userContext);
  return res.json({ success: true, data: categories });
}));

router.post('/categories', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Category name is required' }
    });
  }
  const cat = await rbacService.createCategory(businessId, { name: name.trim() }, user);
  return res.status(201).json({ success: true, data: cat, message: 'Category created successfully' });
}));

router.put('/categories/:id', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Category name is required' }
    });
  }
  await rbacService.updateCategory(businessId, req.params.id, { name: name.trim() }, user);
  return res.json({ success: true, message: 'Category renamed successfully' });
}));

router.delete('/categories/:id', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  await rbacService.deleteCategory(businessId, req.params.id, user);
  return res.json({ success: true, message: 'Category deleted successfully' });
}));

// ============================================================================
// MENUS ENDPOINTS (Scoped strictly by business)
// ============================================================================

router.get('/menus', optionalAuthenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const userContext = req.user || createGuestContext();
  const items = await rbacService.getMenuItems(businessId, userContext);
  return res.json({ success: true, data: items });
}));

router.post('/menus', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
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
    station,
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
      station: (station || 'KITCHEN') as any,
      order_index: order_index !== undefined ? Number(order_index) : undefined,
      preparation_time_mins 
    },
    user
  );

  return res.status(201).json({ success: true, data: item, message: 'Menu item created successfully' });
}));

router.put('/menus/:id', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const itemId = req.params.id;
  await rbacService.updateMenuItem(businessId, itemId, req.body, user);
  return res.json({ success: true, message: 'Menu item updated successfully' });
}));

router.patch('/menus/:id/status', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const itemId = req.params.id;
  const { status, is_available } = req.body;
  await rbacService.updateMenuItem(businessId, itemId, { status, is_available }, user);
  return res.json({ success: true, message: 'Menu item availability status updated successfully' });
}));

router.delete('/menus/:id', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const itemId = req.params.id;
  await rbacService.deleteMenuItem(businessId, itemId, user);
  return res.json({ success: true, message: 'Menu item deleted successfully' });
}));

// ============================================================================
// CHECK-INS ENDPOINTS (Scoped strictly by business)
// ============================================================================

router.get('/check-ins', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const status = req.query.status as any;
  const records = await rbacService.getCheckIns(businessId, user, status ? { status } : undefined);
  return res.json({ success: true, data: records });
}));

router.post('/check-ins', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
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
}));

router.put('/check-ins/:id', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const checkInId = req.params.id;
  await rbacService.updateCheckIn(businessId, checkInId, req.body, user);
  return res.json({ success: true, message: 'Check-in record updated successfully' });
}));

router.delete('/check-ins/:id', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const checkInId = req.params.id;
  await rbacService.deleteCheckIn(businessId, checkInId, user);
  return res.json({ success: true, message: 'Check-in record removed by Manager' });
}));

// ============================================================================
// STAFF & TEAM MANAGEMENT ENDPOINTS (Scoped by business)
// ============================================================================

router.get('/staff', authenticate, asyncHandler('RBAC_ACCESS_DENIED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const team = await rbacService.getTeamMembers(businessId, user);
  return res.json({ success: true, data: team });
}));

router.post('/staff', authenticate, asyncHandler('STAFF_CREATION_FAILED', 400, async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
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
}));

router.patch('/staff/:id/role', authenticate, asyncHandler('ROLE_UPDATE_FAILED', 400, async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
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
}));

router.delete('/staff/:id', authenticate, asyncHandler('STAFF_DELETION_FAILED', 400, async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const targetUserId = req.params.id;
  await rbacService.removeStaffMember(businessId, targetUserId, user);
  return res.json({
    success: true,
    message: 'Staff account removed successfully'
  });
}));

// ============================================================================
// TABLES & DIGITAL ORDERING ENDPOINTS (Strictly Isolated by business)
// ============================================================================

router.get('/tables', optionalAuthenticate, asyncHandler('TABLES_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const tables = await rbacService.getTables(businessId, req.user);
  return res.json({ success: true, data: tables });
}));

router.post('/tables', authenticate, asyncHandler('TABLE_CREATION_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const { table_number, floor, building, capacity, status } = req.body;

  if (!table_number || !table_number.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Table number is required' }
    });
  }

  const table = await rbacService.createTable(
    businessId,
    { ...req.body, table_number: table_number.trim() },
    user
  );

  return res.status(201).json({ success: true, data: table, message: 'Table created successfully' });
}));

router.post('/tables/seed-defaults', authenticate, asyncHandler('TABLE_SEED_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const tables = await rbacService.seedDefaultTables(businessId);
  return res.json({ success: true, data: tables, message: 'Default tables initialized for business' });
}));

router.put('/tables/:id', authenticate, asyncHandler('TABLE_UPDATE_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const tableId = req.params.id;
  await rbacService.updateTable(businessId, tableId, req.body, user);
  return res.json({ success: true, message: 'Table updated successfully' });
}));

router.patch('/tables/:id/status', authenticate, asyncHandler('STATUS_UPDATE_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
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
}));

router.delete('/tables/:id', authenticate, asyncHandler('TABLE_DELETION_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const tableId = req.params.id;
  await rbacService.deleteTable(businessId, tableId, user);
  return res.json({ success: true, message: 'Table deleted successfully' });
}));

/**
 * Public Scan Check-In: Customer scans QR barcode on table
 * Distinguishes the first scanner as Table Host and subsequent scans as View-Only Guests.
 */
router.post('/tables/scan-checkin', customerDiningLimiter, async (req: Request, res: Response) => {
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
router.post('/tables/:id/reset-session', authenticate, asyncHandler('TABLE_SESSION_RESET_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const tableId = req.params.id;

  const updatedTable = await rbacService.resetTableSession(businessId, tableId, user);
  return res.json({
    success: true,
    data: updatedTable,
    message: `Table ${updatedTable.table_number || tableId} session has been cleared and made available.`
  });
}));

/**
 * Public/Guest Table Reset: Customer requests bill or pays, setting table back to ACTIVE default
 */
router.post('/tables/reset-status', customerDiningLimiter, async (req: Request, res: Response) => {
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
router.post('/orders', customerDiningLimiter, async (req: Request, res: Response) => {
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
      table_id: table_id || undefined,
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

    
    // Auto-dispatch KOT to 3rd-party accounting software (eSafal, Swastik, IMS) asynchronously
    erpService.dispatchKOTAsync({
      businessId,
      orderId: order.id,
      orderNumber: (order as any).order_number || order.id,
      tableNumber: table_number || (order as any).table_number || 'Table 1',
      floor: floor || (order as any).floor,
      building: building || (order as any).building,
      customerName: customer_name,
      customerPhone: customer_phone,
      totalAmount: Number(order.total_amount || 0),
      subtotal: Number(order.subtotal || 0),
      createdAt: new Date().toISOString(),
      items: (items || []).map((it: any) => ({
        itemId: it.id || it.item_id,
        erpItemCode: it.erp_item_code,
        name: it.name,
        quantity: Number(it.quantity || 1),
        rate: Number(it.price || it.rate || 0),
        station: it.station || 'KITCHEN',
        total: Number((it.price || it.rate || 0) * (it.quantity || 1)),
        notes: it.notes || it.special_instructions,
      })),
    });

    return res.status(201).json({
      success: true,
      data: order,
      message: `Order ${order.id} processed successfully!`
    });
  } catch (err: any) {
    const statusCode = err.statusCode || (err.message && (err.message.includes('out of stock') || err.message.includes('unavailable')) ? 400 : 500);
    return res.status(statusCode).json({
      success: false,
      error: { code: err.code || (statusCode === 400 ? 'ITEM_OUT_OF_STOCK' : 'ORDER_CREATION_FAILED'), message: err.message }
    });
  }
});

/**
 * Customer Digital Order Placement alias (/table-orders)
 */
router.post('/table-orders', customerDiningLimiter, async (req: Request, res: Response) => {
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
      table_id: table_id || undefined,
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
    const statusCode = err.statusCode || (err.message && (err.message.includes('out of stock') || err.message.includes('unavailable')) ? 400 : 500);
    return res.status(statusCode).json({
      success: false,
      error: { code: err.code || (statusCode === 400 ? 'ITEM_OUT_OF_STOCK' : 'ORDER_CREATION_FAILED'), message: err.message }
    });
  }
});

/**
 * Get active orders for business/kitchen
 */
router.get('/orders', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tableId = req.query.tableId as string | undefined;

    // Unauthenticated diners are strictly restricted to querying their own table's active orders
    if (!req.user) {
      if (!tableId || typeof tableId !== 'string' || tableId.trim().length === 0) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required to view all orders' }
        });
      }
      const businessId = (req.query.businessId as string) || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';
      const orders = await rbacService.getTableOrders(businessId, createSystemContext(), tableId);
      return res.json({ success: true, data: orders });
    }

    // Authenticated staff/manager: verify access to requested business
    const businessId = (req.query.businessId as string) || req.user?.business?.id || (await db.getDefaultBusiness())?.id || 'maya-forest-resort';
    const isAuthorized = await assertBusinessAccess(req.user, businessId);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_ACCESS_DENIED', message: `Access denied to orders for venue '${businessId}'.` }
      });
    }

    const orders = await rbacService.getTableOrders(businessId, req.user, tableId);
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
router.put('/orders/:orderId/status', authenticate, asyncHandler('ORDER_UPDATE_FAILED', async (req: AuthenticatedRequest, res: Response, targetBusinessId: string) => {
  const { orderId } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_STATUS', message: 'Status is required' }
    });
  }

  const updatedOrder = await rbacService.updateTableOrderStatus(
    targetBusinessId,
    orderId,
    status,
    req.user
  );

  return res.json({
    success: true,
    data: updatedOrder,
    message: `Order status updated to ${status}`
  });
}));

/**
 * Update individual item status (Kitchen station & Bar station dish/beverage readiness)
 */
router.put('/orders/:orderId/items/:itemIndex/status', authenticate, asyncHandler('ITEM_STATUS_UPDATE_FAILED', async (req: AuthenticatedRequest, res: Response, targetBusinessId: string) => {
  const { orderId, itemIndex } = req.params;
  const { status } = req.body;

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
    status,
    req.user
  );

  return res.json({
    success: true,
    data: updatedOrder,
    message: `Item #${itemIndex} status updated to ${status}`
  });
}));

/**
 * Update individual item status by key or id (Kitchen station & Bar station)
 */
router.patch('/orders/:orderId/items/status', authenticate, asyncHandler('ITEM_STATUS_UPDATE_FAILED', async (req: AuthenticatedRequest, res: Response, targetBusinessId: string) => {
  const { orderId } = req.params;
  const { itemIndex, itemKey, itemId, status } = req.body;

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
    status,
    req.user
  );

  return res.json({
    success: true,
    data: updatedOrder,
    message: `Item status updated to ${status}`
  });
}));

/**
 * POST /api/rbac/orders/cleanup
 * Manually or automatically trigger daily order purge (>24h) and 30-day sales retention
 */
router.post('/orders/cleanup', authenticate, requireOwnerOrManager, asyncHandler('CLEANUP_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const result = await rbacService.cleanupDailyOrdersAndOldSales(businessId);
  return res.json({
    success: true,
    data: result,
    message: `Cleanup completed: deleted ${result.deletedOrders} orders (>24h) and ${result.deletedSales} sales (>30d).`
  });
}));

/**
 * DELETE /api/rbac/orders/completed
 * Purge all completed and cancelled table tickets from database on demand
 */
router.delete('/orders/completed', authenticate, requireOwnerOrManager, asyncHandler('PURGE_COMPLETED_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const result = await rbacService.purgeCompletedTableOrders(businessId);
  return res.json({
    success: true,
    data: result,
    message: `Successfully cleared ${result.deletedCount} completed table order(s).`
  });
}));


// ============================================================================
// PAY-FIRST ORDER SETTLEMENT
// ============================================================================

router.post('/orders/:id/confirm-payment', authenticate, requireResourceAccess('billing', 'write'), asyncHandler('PAYMENT_CONFIRM_FAILED', 400, async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const orderId = req.params.id;
  const { payment_method, notes } = req.body;
  
  // Using cashier name as the user's name or email
  const cashierName = (user as any).name || user.email || 'Cashier';
  
  await rbacService.confirmTableOrderPayment(orderId, businessId, payment_method, cashierName, notes);
  
  return res.json({ success: true, message: 'Payment confirmed and order processed to Kitchen' });
}));

router.post('/orders/:id/reject-payment', authenticate, requireResourceAccess('billing', 'write'), asyncHandler('PAYMENT_REJECT_FAILED', 400, async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const orderId = req.params.id;
  const { reason } = req.body;
  
  const cashierName = (user as any).name || user.email || 'Cashier';
  
  await rbacService.rejectTableOrderPayment(orderId, businessId, reason, cashierName);
  
  return res.json({ success: true, message: 'Payment rejected and order cancelled' });
}));

router.post('/orders/:id/payment-method', customerDiningLimiter, optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    // This can be called unauthenticated by the guest via CustomerMenuPreviewPage/OrderSuccessModal
    const businessId = (req.query.businessId as string) || req.body.businessId || req.body.business_id;
    const orderId = req.params.id;
    const { payment_method, pin } = req.body;
    
    if (!businessId) throw new Error("businessId required");

    const existingOrder = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    if (!existingOrder) {
      return res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' } });
    }

    let isPinVerified = false;
    if (pin && (payment_method === 'CREDIT' || payment_method === 'DEDUCT_FROM_DEPOSIT')) {
      let targetTable: any = null;
      if (existingOrder.table_id) {
        targetTable = await prisma.restaurantTable.findUnique({ where: { id: existingOrder.table_id } });
      }
      if (!targetTable && existingOrder.table_number) {
        targetTable = await prisma.restaurantTable.findFirst({
          where: { business_id: businessId, table_number: existingOrder.table_number },
        });
      }
      const expectedPin = targetTable?.credit_pin?.trim();
      if (!expectedPin) {
        return res.status(400).json({ success: false, error: { message: 'No authorization PIN is configured for this table.' } });
      }
      if (pin.toString().trim() !== expectedPin) {
        return res.status(400).json({ success: false, error: { message: 'Incorrect 6-digit PIN. Please enter the correct PIN for this table.' } });
      }
      isPinVerified = true;
    } else if (!pin && (payment_method === 'CREDIT' || payment_method === 'DEDUCT_FROM_DEPOSIT')) {
      isPinVerified = Boolean(existingOrder.credit_pin_verified);
    } else {
      isPinVerified = false;
    }

    try {
      await prisma.tableOrder.updateMany({
        where: { id: orderId, business_id: businessId },
        data: {
          payment_method,
          credit_pin_verified: isPinVerified,
        },
      });
    } catch (e: any) {
      console.warn('Prisma payment-method update note:', e.message);
    }

    const updated = await prisma.tableOrder.findUnique({
      where: { id: orderId },
    });

    if (updated) {
      const fullOrder = {
        id: updated.id,
        business_id: updated.business_id,
        table_id: updated.table_id || '',
        table_number: updated.table_number,
        order_number: updated.order_number || undefined,
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
        status: updated.status,
        pay_first: Boolean(updated.pay_first),
        payment_confirmed_at: updated.payment_confirmed_at ? new Date(updated.payment_confirmed_at) : null,
        payment_confirmed_by: updated.payment_confirmed_by || null,
        sale_id: updated.sale_id || null,
        payment_rejected_reason: updated.payment_rejected_reason || null,
        session_id: updated.session_id || null,
        bill_requested: Boolean(updated.bill_requested),
        bill_requested_at: updated.bill_requested_at ? new Date(updated.bill_requested_at) : null,
        bill_acknowledged: Boolean(updated.bill_acknowledged),
        folio_delivered: Boolean(updated.folio_delivered),
        folio_delivered_at: updated.folio_delivered_at ? new Date(updated.folio_delivered_at) : null,
        payment_method: updated.payment_method || payment_method,
        credit_only: Boolean(updated.credit_only),
        credit_pin_verified: Boolean(updated.credit_pin_verified),
        pin_verified: Boolean(updated.credit_pin_verified),
        credit_gl_account_id: updated.credit_gl_account_id || null,
        credit_gl_account_number: updated.credit_gl_account_number || null,
        credit_gl_account_name: updated.credit_gl_account_name || null,
        payment_status: updated.payment_status || null,
        promo_code: updated.promo_code || null,
        promo_discount: Number(updated.promo_discount) || 0,
        taxes: (updated.taxes as any) || [],
        ready_at: updated.ready_at ? new Date(updated.ready_at) : null,
        served_at: updated.served_at ? new Date(updated.served_at) : null,
        created_at: new Date(updated.created_at),
        updated_at: new Date(updated.updated_at),
      };
      realtimeEmitter.orderUpdated(businessId, fullOrder);
      return res.json({ success: true, message: 'Payment method updated', order: fullOrder });
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

router.post('/orders/:id/verify-pin', customerDiningLimiter, optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const businessId = (req.query.businessId as string) || req.body.businessId || req.body.business_id;
    const orderId = req.params.id;
    const { pin, payment_method } = req.body;

    if (!businessId) throw new Error('businessId required');
    if (!pin || pin.toString().trim().length !== 6) {
      return res.status(400).json({ success: false, error: { message: 'A 6-digit PIN is required.' } });
    }

    const order = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ success: false, error: { message: 'Order not found.' } });

    let targetTable: any = null;
    if (order.table_id) {
      targetTable = await prisma.restaurantTable.findUnique({ where: { id: order.table_id } });
    }
    if (!targetTable && order.table_number) {
      targetTable = await prisma.restaurantTable.findFirst({
        where: { business_id: businessId, table_number: order.table_number },
      });
    }

    const expectedPin = targetTable?.credit_pin?.trim();
    if (!expectedPin) {
      return res.status(400).json({ success: false, error: { message: 'No authorization PIN is configured for this table. Please contact staff.' } });
    }
    if (pin.toString().trim() !== expectedPin) {
      return res.status(400).json({ success: false, error: { message: 'Incorrect 6-digit PIN. Please enter the correct PIN for this table.' } });
    }

    const method = payment_method || order.payment_method || 'CREDIT';
    await prisma.tableOrder.updateMany({
      where: { id: orderId, business_id: businessId },
      data: {
        payment_method: method,
        credit_pin_verified: true,
      },
    });

    const updated = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    if (updated) {
      const fullOrder = {
        id: updated.id,
        business_id: updated.business_id,
        table_id: updated.table_id || '',
        table_number: updated.table_number,
        order_number: updated.order_number || undefined,
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
        status: updated.status,
        pay_first: Boolean(updated.pay_first),
        credit_only: Boolean(updated.credit_only),
        credit_pin_verified: true,
        pin_verified: true,
        credit_gl_account_id: updated.credit_gl_account_id || null,
        credit_gl_account_number: updated.credit_gl_account_number || null,
        credit_gl_account_name: updated.credit_gl_account_name || null,
        payment_method: method,
        payment_status: updated.payment_status || null,
        session_id: updated.session_id || null,
        created_at: new Date(updated.created_at),
        updated_at: new Date(updated.updated_at),
      };
      realtimeEmitter.orderUpdated(businessId, fullOrder);
      return res.json({ success: true, verified: true, message: 'PIN verified successfully', order: fullOrder });
    }

    realtimeEmitter.orderUpdated(businessId, { id: orderId, payment_method: method, credit_pin_verified: true, pin_verified: true });
    return res.json({ success: true, verified: true, message: 'PIN verified successfully' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: { message: err.message } });
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

router.post('/orders/:id/request-bill', customerDiningLimiter, optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const businessId = (req.query.businessId as string) || (req.headers['x-business-id'] as string) || req.body.businessId || req.body.business_id;
    const orderId = req.params.id;
    const { payment_method, promo_code, promo_discount, total_amount, currency, notes } = req.body;

    if (!businessId) throw new Error('businessId required');

    const now = new Date();
    const existingOrder = await prisma.tableOrder.findUnique({ where: { id: orderId } });
    if (!existingOrder) throw new Error(`Order ${orderId} not found`);

    if (existingOrder.business_id !== businessId) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_MISMATCH', message: 'Order does not belong to specified business' }
      });
    }

    // For dine-in table orders without staff credentials: only the table host can request final bill
    if (!(req as any).user && existingOrder.table_id) {
      const tableSnap = await prisma.restaurantTable.findUnique({ where: { id: existingOrder.table_id } });
      if (tableSnap && tableSnap.host_token) {
        const providedToken = (req.headers['x-host-token'] as string) || req.body.host_token || (req.query.host_token as string);
        if (!providedToken || providedToken !== tableSnap.host_token) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'VIEW_ONLY_GUEST',
              message: 'Bill request authority reserved: Only the Table Host who first scanned the table QR code can request the final bill.'
            }
          });
        }
      }
    }

    // Server-side validation of pricing and totals to prevent client tampering
    const taxConfig = await rbacService.getTaxConfig(businessId);
    const existingItems = Array.isArray(existingOrder.items) ? (existingOrder.items as any[]) : [];
    const activeItems = existingItems.filter((item: any) => item.status !== 'CANCELLED');
    const itemsMenuTotal = activeItems.reduce(
      (sum: number, item: any) => {
        const qty = Number(item.quantity) || 1;
        const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || (item.is_comp ? qty : 0)));
        const billedQty = item.is_comp ? 0 : Math.max(0, qty - compQty);
        return sum + (Number(item.price) || 0) * billedQty;
      },
      0
    );
    const { subtotal, taxAmount, computedTaxes, totalAmount: preDiscountTotal } =
      rbacService.calculateOrderTaxBreakdown(itemsMenuTotal, taxConfig);

    const verifiedPromoCode = promo_code ? String(promo_code).trim() : (existingOrder.promo_code || null);
    const verifiedPromoDiscount = verifiedPromoCode
      ? rbacService.resolveOrderPromoDiscount(preDiscountTotal, { promo_code: verifiedPromoCode }, taxConfig)
      : (existingOrder.promo_discount ? Number(existingOrder.promo_discount) : 0);

    const verifiedTotalAmount = Math.max(0, Math.round((preDiscountTotal - verifiedPromoDiscount) * 100) / 100);

    const updatedOrder = await prisma.tableOrder.update({
      where: { id: orderId },
      data: {
        bill_requested: true,
        bill_requested_at: now,
        payment_method: payment_method || existingOrder.payment_method || undefined,
        promo_code: verifiedPromoCode,
        promo_discount: verifiedPromoDiscount,
        total_amount: verifiedTotalAmount,
        subtotal: subtotal,
        tax_amount: taxAmount,
        taxes: computedTaxes as any,
      },
    });

    const pingId = `bill-${orderId}`;
    const srv = await prisma.serviceRequest.upsert({
      where: { id: pingId },
      update: {
        status: 'PENDING',
        payment_method: payment_method || existingOrder.payment_method || 'CASH',
        total_amount: verifiedTotalAmount,
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
        total_amount: verifiedTotalAmount,
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
// CASHIER SHIFT SESSIONS & DRAWER FLOAT (Per-Cashier Multi-Register)
// ============================================================================

/**
 * GET /api/rbac/cashier-session/current
 * Fetch current cashier's register session for today (or all active sessions for manager/owner)
 */
router.get('/cashier-session/current', authenticate, requireResourceAccess('billing', 'read'), asyncHandler('CASHIER_SESSION_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const todayStr = new Date().toISOString().split('T')[0];
  const isManagerOrOwner = (user.role as string) === 'OWNER' || (user.role as string) === 'MANAGER' || (user.role as string) === 'RESTAURANT_OWNER' || (user.role as string) === 'HOTEL_OWNER' || (user as any).isOwner;
  const requestedCashierId = req.query.cashierId as string | undefined;

  const targetCashierId = (isManagerOrOwner && requestedCashierId) ? requestedCashierId : user.id;

  const session = await prisma.cashierRegisterSession.findFirst({
    where: {
      business_id: businessId,
      cashier_id: targetCashierId,
      date_string: todayStr,
    },
    orderBy: { opened_at: 'desc' },
  });

  return res.json({
    success: true,
    data: session,
  });
}));

/**
 * POST /api/rbac/cashier-session/open
 * Open a cashier's individual shift drawer with an opening float
 */
/**
 * GET /api/rbac/cashier-session/all
 * Fetch all cashier shift register sessions for today
 */
router.get('/cashier-session/all', authenticate, requireResourceAccess('billing', 'read'), asyncHandler('CASHIER_ALL_SESSIONS_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const sessions = await prisma.cashierRegisterSession.findMany({
    where: {
      business_id: businessId,
      date_string: todayStr,
    },
    orderBy: { opened_at: 'desc' },
  });

  return res.json({
    success: true,
    data: sessions,
  });
}));

router.post('/cashier-session/open', authenticate, requireResourceAccess('billing', 'write'), asyncHandler('CASHIER_SESSION_OPEN_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const todayStr = new Date().toISOString().split('T')[0];
  const { opening_float = 0, notes } = req.body;
  const cashierName = (user as any).name || user.email?.split('@')[0] || 'Cashier';

  const session = await prisma.cashierRegisterSession.upsert({
    where: {
      business_id_cashier_id_date_string: {
        business_id: businessId,
        cashier_id: user.id,
        date_string: todayStr,
      },
    },
    create: {
      business_id: businessId,
      cashier_id: user.id,
      cashier_name: cashierName,
      date_string: todayStr,
      status: 'OPEN',
      opening_float: Number(opening_float) || 0,
      notes: notes || null,
      opened_at: new Date(),
    },
    update: {
      status: 'OPEN',
      opening_float: Number(opening_float) || 0,
      notes: notes || null,
      closed_at: null,
    },
  });

  realtimeEmitter.cashierSessionUpdated(businessId, session);

  return res.json({
    success: true,
    data: session,
    message: `Shift register opened with Rs. ${session.opening_float} drawer float`,
  });
}));

/**
 * POST /api/rbac/cashier-session/close
 * Close a cashier's individual shift drawer
 */
router.post('/cashier-session/close', authenticate, requireResourceAccess('billing', 'write'), asyncHandler('CASHIER_SESSION_CLOSE_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const user = req.user!;
  const todayStr = new Date().toISOString().split('T')[0];
  const { closing_cash, notes } = req.body;

  const session = await prisma.cashierRegisterSession.findFirst({
    where: {
      business_id: businessId,
      cashier_id: user.id,
      date_string: todayStr,
      status: 'OPEN',
    },
  });

  if (!session) {
    return res.status(404).json({ success: false, error: 'No active open shift session found for today' });
  }

  const updated = await prisma.cashierRegisterSession.update({
    where: { id: session.id },
    data: {
      status: 'CLOSED',
      closing_cash: closing_cash !== undefined ? Number(closing_cash) : null,
      notes: notes || session.notes,
      closed_at: new Date(),
    },
  });

  realtimeEmitter.cashierSessionUpdated(businessId, updated);

  return res.json({
    success: true,
    data: updated,
    message: 'Shift register closed successfully',
  });
}));

// ============================================================================
// BILLING, POS SALES & TAX CONFIGURATION
// ============================================================================

/**
 * GET /api/rbac/tax-config
 * Get tax configuration for a business
 */
router.get('/tax-config', optionalAuthenticate, asyncHandler('TAX_CONFIG_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const config = await rbacService.getTaxConfig(businessId);
  return res.json({ success: true, data: config });
}));

/**
 * PUT /api/rbac/tax-config
 * Update tax configuration for a business
 */
router.put('/tax-config', authenticate, requireResourceAccess(['settings', 'billing'], 'write'), asyncHandler('TAX_CONFIG_UPDATE_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const config = await rbacService.updateTaxConfig(businessId, req.body, req.user);
  return res.json({
    success: true,
    data: config,
    message: 'Tax configuration saved successfully'
  });
}));


// ============================================================================
// 3RD-PARTY ACCOUNTING & ERP INTEGRATION (eSafal, Swastik, IMS, Webhooks)
// ============================================================================

/**
 * GET /api/rbac/erp-integration
 * Fetch configured accounting software settings (with masked API key)
 */
router.get('/erp-integration', authenticate, requireResourceAccess(['settings', 'billing'], 'read'), asyncHandler('ERP_CONFIG_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const config = await erpService.getIntegrationConfig(businessId);
  const safeConfig = config ? {
    ...config,
    apiKey: config.apiKey ? '••••••••' + config.apiKey.slice(-4) : '',
  } : {
    provider: 'NONE',
    syncKot: true,
    syncSettlement: true,
    isActive: false,
  };
  return res.json({ success: true, data: safeConfig });
}));

/**
 * PUT /api/rbac/erp-integration
 * Save / Update accounting integration settings
 */
router.put('/erp-integration', authenticate, requireResourceAccess(['settings', 'billing'], 'write'), asyncHandler('ERP_CONFIG_SAVE_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const incoming = req.body || {};
  if (incoming.apiKey && incoming.apiKey.startsWith('••••••••')) {
    const existing = await erpService.getIntegrationConfig(businessId);
    incoming.apiKey = existing?.apiKey || '';
  }

  const updated = await erpService.saveIntegrationConfig(businessId, incoming);
  return res.json({
    success: true,
    data: {
      ...updated,
      apiKey: updated.apiKey ? '••••••••' + updated.apiKey.slice(-4) : '',
    },
    message: 'Accounting & ERP integration saved successfully',
  });
}));

/**
 * POST /api/rbac/erp-integration/test
 * Test connection to target accounting software live
 */
router.post('/erp-integration/test', authenticate, requireResourceAccess(['settings', 'billing'], 'write'), asyncHandler('ERP_TEST_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const incoming = req.body || {};
  if (incoming.apiKey && incoming.apiKey.startsWith('••••••••')) {
    const existing = await erpService.getIntegrationConfig(businessId);
    incoming.apiKey = existing?.apiKey || '';
  }

  const result = await erpService.testConnection(incoming);
  return res.json(result);
}));

// ============================================================================
// GL (GENERAL LEDGER) ACCOUNTS & ERP MAPPING (Owner Configurable)
// ============================================================================

/**
 * GET /api/rbac/gl-accounts
 * Fetch all configured GL account numbers, names, and mappings
 */
router.get('/gl-accounts', authenticate, requireResourceAccess(['settings', 'billing'], 'read'), asyncHandler('GL_ACCOUNTS_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const accounts = await rbacService.getGLAccounts(businessId);
  return res.json({ success: true, data: accounts });
}));

/**
 * POST /api/rbac/gl-accounts
 * Create a new GL Account link (Owner / Admin)
 */
router.post('/gl-accounts', authenticate, requireResourceAccess(['settings', 'billing'], 'write'), asyncHandler('GL_ACCOUNT_CREATE_FAILED', 400, async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const account = await rbacService.createGLAccount(businessId, req.body, req.user);
  return res.status(201).json({
    success: true,
    data: account,
    message: `GL Account ${account.account_number} created successfully`
  });
}));

/**
 * PUT /api/rbac/gl-accounts/:id
 * Update an existing GL Account link (Owner / Admin)
 */
router.put('/gl-accounts/:id', authenticate, requireResourceAccess(['settings', 'billing'], 'write'), asyncHandler('GL_ACCOUNT_UPDATE_FAILED', 400, async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const accountId = req.params.id;
  const updated = await rbacService.updateGLAccount(businessId, accountId, req.body, req.user);
  return res.json({
    success: true,
    data: updated,
    message: `GL Account ${updated.account_number} updated successfully`
  });
}));

/**
 * DELETE /api/rbac/gl-accounts/:id
 * Delete a GL Account link (Owner / Admin)
 */
router.delete('/gl-accounts/:id', authenticate, requireResourceAccess(['settings', 'billing'], 'write'), asyncHandler('GL_ACCOUNT_DELETE_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const accountId = req.params.id;
  await rbacService.deleteGLAccount(businessId, accountId, req.user);
  return res.json({
    success: true,
    message: 'GL Account removed successfully'
  });
}));

/**
 * POST /api/rbac/gl-accounts/reset-default
 * Restore standard hospitality chart of accounts
 */
router.post('/gl-accounts/reset-default', authenticate, requireResourceAccess(['settings', 'billing'], 'write'), asyncHandler('GL_ACCOUNTS_RESET_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const defaults = await rbacService.resetDefaultGLAccounts(businessId, req.user);
  return res.json({
    success: true,
    data: defaults,
    message: 'Restored standard hospitality General Ledger chart of accounts'
  });
}));

/**
 * GET /api/rbac/sales
 * Get sales records with date, range, and payment method filters
 */
router.get('/sales', authenticate, requireResourceAccess('billing', 'read'), asyncHandler('SALES_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const date = req.query.date as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const paymentMethod = req.query.paymentMethod as string | undefined;
  const isManagerOrOwner = (req.user?.role as string) === 'OWNER' || (req.user?.role as string) === 'MANAGER' || (req.user?.role as string) === 'RESTAURANT_OWNER' || (req.user?.role as string) === 'HOTEL_OWNER' || (req.user as any)?.isOwner;
  const cashierId = isManagerOrOwner ? (req.query.cashierId as string | undefined) : req.user?.id;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

  const sales = await rbacService.getSales(businessId, {
    date,
    startDate,
    endDate,
    paymentMethod,
    limit
  });

  return res.json({ success: true, data: sales });
}));

/**
 * GET /api/rbac/comp-records
 * Fetch complementary ledger records with optional date filters
 */
router.get('/comp-records', authenticate, requireResourceAccess('billing', 'read'),
  asyncHandler('COMP_RECORDS_FETCH_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
    const { start_date, end_date } = req.query as { start_date?: string; end_date?: string };
    const records = await rbacService.getCompRecords(businessId, { start_date, end_date });
    return res.json({ success: true, data: records });
  })
);

/**
 * POST /api/rbac/sales
 * Create a new POS / Table sale record
 */
router.post('/sales', authenticate, requireResourceAccess('billing', 'write'), asyncHandler('SALE_CREATION_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const saleData = req.body;
  const sale = await rbacService.createSale(businessId, saleData, req.user);

  
  // Sync official sale invoice to 3rd-party accounting software asynchronously
  setImmediate(async () => {
    try {
      await erpService.syncInvoice({
        businessId,
        orderId: sale.id,
        orderNumber: sale.invoice_number || sale.id,
        tableNumber: sale.table_number || 'POS Counter',
        customerName: sale.customer_name || 'Walk-in Guest',
        customerPhone: sale.customer_phone || '',
        customerPan: sale.customer_pan || (saleData as any).customer_pan || '',
        totalAmount: Number(sale.total_amount || 0),
        subtotal: Number(sale.subtotal || 0),
        taxAmount: Number(sale.total_tax || (sale as any).tax_amount || 0),
        paymentMethod: sale.payment_method || 'CASH',
        createdAt: new Date().toISOString(),
        items: ((saleData.items || []) as any[]).map((it: any) => ({
          itemId: it.id || it.item_id,
          erpItemCode: it.erp_item_code,
          name: it.name,
          quantity: Number(it.quantity || 1),
          rate: Number(it.price || it.rate || 0),
          total: Number((it.price || it.rate || 0) * (it.quantity || 1)),
        })),
      });
    } catch (e) {
      console.error('[ERP Invoice Sync] Failed:', e);
    }
  });

  return res.status(201).json({
    success: true,
    data: sale,
    message: 'Sale record registered successfully'
  });
}));

/**
 * DELETE /api/rbac/sales/:saleId
 * Delete a single sale record
 */
router.delete('/sales/:saleId', authenticate, requireResourceAccess('billing', 'write'), asyncHandler('SALE_DELETION_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
  const { saleId } = req.params;
  await rbacService.deleteSale(businessId, saleId, req.user);

  return res.json({
    success: true,
    message: `Sale record ${saleId} deleted successfully`
  });
}));

/**
 * DELETE /api/rbac/sales
 * Bulk delete:
 * - ?date=YYYY-MM-DD : Delete all sales records for a single day
 * - ?all=true : Delete all sales records
 */
router.delete('/sales', authenticate, requireOwnerOrManager, requireResourceAccess('billing', 'write'), asyncHandler('SALES_BATCH_DELETE_FAILED', async (req: AuthenticatedRequest, res: Response, businessId: string) => {
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
}));

/**
 * GET /api/rbac/businesses/:businessId/operations
 * Retrieve business operational preferences, current day status, and recent shift history
 */
router.get('/businesses/:businessId/operations', authenticate, requireOwnerOrManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const isAuthorized = await assertBusinessAccess(req.user, businessId);
    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
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
router.put('/businesses/:businessId/operations/config', authenticate, requireOwnerOrManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const isAuthorized = await assertBusinessAccess(req.user, businessId);
    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
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
router.post('/businesses/:businessId/operations/days', authenticate, requireOwnerOrManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const isAuthorized = await assertBusinessAccess(req.user, businessId);
    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
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
router.put('/businesses/:businessId/operations/days/:dayId', authenticate, requireOwnerOrManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { businessId, dayId } = req.params;
    const isAuthorized = await assertBusinessAccess(req.user, businessId);
    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const dayData = req.body;

    const existing = await prisma.operationalDay.findFirst({
      where: { id: dayId, business_id: businessId },
    }).catch(() => null);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Operational day record not found for this venue' });
    }

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
router.post('/service-requests', customerDiningLimiter, optionalAuthenticate, async (req: Request, res: Response) => {
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

    if (table_id || table_number) {
      await prisma.restaurantTable.updateMany({
        where: {
          business_id: businessId,
          OR: [
            ...(table_id ? [{ id: table_id }] : []),
            ...(table_number ? [{ table_number: String(table_number) }] : []),
          ],
        },
        data: {
          waiter_ping: {
            active: true,
            timestamp: new Date().toISOString(),
          },
        },
      }).catch(() => {});

      realtimeEmitter.tableUpdated(businessId, {
        id: table_id,
        table_number,
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
router.get('/service-requests', authenticate, requireResourceAccess('orders', 'read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = (req.query.businessId as string) || (req.query.business_id as string) || req.user?.business?.id;
    if (!businessId) return res.status(400).json({ success: false, error: 'businessId required' });

    const isAuthorized = await assertBusinessAccess(req.user, businessId);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_ACCESS_DENIED', message: `Access denied to service requests for venue '${businessId}'.` }
      });
    }

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

export function getTableNumberVariations(raw?: string | null): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const set = new Set<string>();
  set.add(trimmed);

  // Strip prefixes like "Table #", "Table ", "#"
  const strippedPrefix = trimmed.replace(/^((table\s*#?|#)\s*)+/i, '').trim();
  if (strippedPrefix) {
    set.add(strippedPrefix);
    set.add(`Table ${strippedPrefix}`);
    set.add(`Table #${strippedPrefix}`);
    set.add(`#${strippedPrefix}`);
  }

  // Strip parentheses suffix e.g. " (VIP)", "(VIP)", " (AC)"
  const withoutParens = trimmed.replace(/\s*\([^)]*\)\s*$/i, '').trim();
  if (withoutParens && withoutParens !== trimmed) {
    set.add(withoutParens);
    const strippedParensPrefix = withoutParens.replace(/^((table\s*#?|#)\s*)+/i, '').trim();
    if (strippedParensPrefix) {
      set.add(strippedParensPrefix);
      set.add(`Table ${strippedParensPrefix}`);
      set.add(`Table #${strippedParensPrefix}`);
      set.add(`#${strippedParensPrefix}`);
    }
  }

  // If strippedPrefix also had parens:
  if (strippedPrefix) {
    const strippedBoth = strippedPrefix.replace(/\s*\([^)]*\)\s*$/i, '').trim();
    if (strippedBoth && strippedBoth !== strippedPrefix) {
      set.add(strippedBoth);
      set.add(`Table ${strippedBoth}`);
      set.add(`Table #${strippedBoth}`);
      set.add(`#${strippedBoth}`);
    }
  }

  return Array.from(set).filter(Boolean);
}

/**
 * POST /api/rbac/tables/:tableId/acknowledge-ping
 * Acknowledge / dismiss active waiter ping on a table
 */
router.post('/tables/:tableId/acknowledge-ping', customerDiningLimiter, optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const { tableId: paramTableId } = req.params;
    let businessId =
      (req.query.businessId as string) ||
      (req.headers['x-business-id'] as string) ||
      req.body.businessId ||
      req.body.business_id ||
      (req as any).user?.business?.id ||
      (req as any).user?.businessId;
    let tableId = paramTableId && paramTableId !== 'undefined' && paramTableId !== 'null' && paramTableId !== 'active'
      ? paramTableId
      : undefined;
    const tableNumber = (req.query.tableNumber as string) || req.body.tableNumber || req.body.table_number;

    if (!tableId && req.body.tableId && req.body.tableId !== 'undefined' && req.body.tableId !== 'null') {
      tableId = req.body.tableId;
    }

    // Auto-discover businessId from tableId if not passed explicitly
    if (!businessId && tableId) {
      const foundTable = await prisma.restaurantTable.findUnique({ where: { id: tableId } }).catch(() => null);
      if (foundTable?.business_id) {
        businessId = foundTable.business_id;
      }
    }

    const allTableNumberCandidates = [
      ...getTableNumberVariations(tableNumber),
      ...(tableId ? getTableNumberVariations(tableId) : []),
    ];

    const searchConditions: any[] = [];
    if (tableId) {
      searchConditions.push({ id: tableId, ...(businessId ? { business_id: businessId } : {}) });
      searchConditions.push({ id: tableId });
    }
    for (const num of allTableNumberCandidates) {
      searchConditions.push({ table_number: num, ...(businessId ? { business_id: businessId } : {}) });
      searchConditions.push({ table_number: num });

      // Descriptive suffix variations e.g. "Table 4 (VIP)" or "4 (VIP)"
      searchConditions.push({ table_number: { startsWith: `${num} (` }, ...(businessId ? { business_id: businessId } : {}) });
      searchConditions.push({ table_number: { startsWith: `${num} (` } });
      searchConditions.push({ table_number: { startsWith: `${num} -` }, ...(businessId ? { business_id: businessId } : {}) });
      searchConditions.push({ table_number: { startsWith: `${num} -` } });
    }
    if (req.body.tableId && req.body.tableId !== tableId) {
      searchConditions.push({ id: req.body.tableId, ...(businessId ? { business_id: businessId } : {}) });
      searchConditions.push({ id: req.body.tableId });
    }

    let matchingTables = searchConditions.length > 0
      ? await prisma.restaurantTable.findMany({
          where: {
            OR: searchConditions,
          },
        })
      : [];

    // Filter to businessId if businessId is specified and we found multiple tables
    if (businessId && matchingTables.length > 1) {
      const bizSpecific = matchingTables.filter((t) => t.business_id === businessId);
      if (bizSpecific.length > 0) {
        matchingTables = bizSpecific;
      }
    }

    // Swapped argument fallback detection:
    // If no tables found, but tableId matches a business and businessId matches a table in that business:
    if (matchingTables.length === 0 && businessId) {
      const swappedCandidates = [
        businessId,
        ...getTableNumberVariations(businessId),
      ];
      const swappedConditions: any[] = [{ id: businessId }];
      for (const num of swappedCandidates) {
        swappedConditions.push({ table_number: num, ...(tableId ? { business_id: tableId } : {}) });
        swappedConditions.push({ table_number: { startsWith: `${num} (` }, ...(tableId ? { business_id: tableId } : {}) });
        swappedConditions.push({ table_number: { startsWith: `${num} -` }, ...(tableId ? { business_id: tableId } : {}) });
      }
      const swappedTables = await prisma.restaurantTable.findMany({
        where: {
          OR: swappedConditions,
        },
      });
      if (swappedTables.length > 0) {
        matchingTables = swappedTables;
        businessId = tableId; // tableId in route was actually the businessId
      }
    }

    if (matchingTables.length > 0) {
      const matchedIds = matchingTables.map((t) => t.id);
      await prisma.restaurantTable.updateMany({
        where: { id: { in: matchedIds } },
        data: { waiter_ping: { active: false } },
      }).catch(() => {});

      if (!businessId && matchingTables[0].business_id) {
        businessId = matchingTables[0].business_id;
      }
    } else if (tableId) {
      const fallbackConditions: any[] = [{ id: tableId }];
      for (const num of allTableNumberCandidates) {
        fallbackConditions.push({ table_number: num, ...(businessId ? { business_id: businessId } : {}) });
        fallbackConditions.push({ table_number: { startsWith: `${num} (` }, ...(businessId ? { business_id: businessId } : {}) });
        fallbackConditions.push({ table_number: { startsWith: `${num} -` }, ...(businessId ? { business_id: businessId } : {}) });
      }
      await prisma.restaurantTable.updateMany({
        where: {
          OR: fallbackConditions,
        },
        data: { waiter_ping: { active: false } },
      }).catch(() => {});
    }

    if (businessId) {
      const serviceRequestConditions: any[] = [];
      if (tableId) {
        serviceRequestConditions.push({ table_id: tableId });
      }
      for (const num of allTableNumberCandidates) {
        serviceRequestConditions.push({ table_number: num });
        serviceRequestConditions.push({ table_number: { startsWith: `${num} (` } });
        serviceRequestConditions.push({ table_number: { startsWith: `${num} -` } });
      }
      for (const t of matchingTables) {
        serviceRequestConditions.push({ table_id: t.id });
        serviceRequestConditions.push({ table_number: t.table_number });
      }

      if (serviceRequestConditions.length > 0) {
        const pendingReqs = await prisma.serviceRequest.findMany({
          where: {
            business_id: businessId,
            OR: serviceRequestConditions,
            type: { in: ['CALL_WAITER', 'WAITER_CALL'] },
            status: 'PENDING',
          },
          select: { id: true, table_id: true, table_number: true },
        }).catch(() => []);

        if (pendingReqs.length > 0) {
          const reqIds = pendingReqs.map((r) => r.id);
          const resolvedAt = new Date();
          await prisma.serviceRequest.updateMany({
            where: { id: { in: reqIds } },
            data: {
              status: 'ATTENDED',
              resolved_at: resolvedAt,
            },
          }).catch(() => {});

          for (const req of pendingReqs) {
            realtimeEmitter.serviceRequestUpdated(businessId, {
              id: req.id,
              table_id: req.table_id,
              table_number: req.table_number,
              status: 'ATTENDED',
              resolved_at: resolvedAt,
            });
          }
        }
      }

      if (matchingTables.length > 0) {
        for (const t of matchingTables) {
          realtimeEmitter.tableUpdated(businessId, {
            id: t.id,
            table_number: t.table_number,
            waiter_ping: { active: false },
          });
        }
      } else {
        realtimeEmitter.tableUpdated(businessId, {
          id: tableId,
          table_number: tableNumber || tableId,
          waiter_ping: { active: false },
        });
      }

      // Also broadcast general service request update
      realtimeEmitter.serviceRequestUpdated(businessId, {
        table_id: tableId,
        table_number: tableNumber || tableId,
        status: 'ATTENDED',
      });
    }

    return res.json({ success: true, message: 'Waiter ping acknowledged' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

