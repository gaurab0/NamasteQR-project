import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { realtimeEmitter } from '../lib/socket';
import { authenticate, optionalAuthenticate, requireResourceAccess, AuthenticatedRequest, assertBusinessAccess } from '../middleware/auth.middleware';
import { db } from '../services/db.service';
import { MenuItem, MenuCategory, FoodType, MenuStatus, MenuItemVariant } from '../types/rbac.types';
import { generateMenuDocId, generateCategoryDocId } from '../utils/id.utils';
import {
  extractAndValidateMenuMatrix,
  validateGroupedPayload,
  normalizeImportKey,
} from '../../../src/utils/menuImportValidator';

const router = Router();

const DEFAULT_BIZ_ID = 'namaste-bistro';

/**
 * Robust helper to resolve the business ID from query, header, body, or authenticated user
 * Enforces tenant isolation for authenticated staff/users to prevent IDOR vulnerabilities.
 */
async function resolveBusinessId(req: AuthenticatedRequest): Promise<string> {
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
      }
    }
  }

  if (!targetBiz) {
    try {
      const defaultBiz = await db.getDefaultBusiness();
      if (defaultBiz?.id) targetBiz = defaultBiz.id;
    } catch (err) {
      // fallback
    }
  }
  if (!targetBiz) targetBiz = DEFAULT_BIZ_ID;

  if (req.user) {
    const isAuthorized = await assertBusinessAccess(req.user, targetBiz);
    if (!isAuthorized) {
      const err: any = new Error(`Access denied: You do not have permission to access or modify menus for venue '${targetBiz}'.`);
      err.statusCode = 403;
      err.code = 'TENANT_ACCESS_DENIED';
      throw err;
    }
  }

  return targetBiz;
}

// ============================================================================
// MENU CATEGORIES CRUD
// ============================================================================

/**
 * GET /api/menus/categories
 * Retrieves categories for the active business
 */
router.get('/categories', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = await resolveBusinessId(req);
    const dbCats = await prisma.menuCategory.findMany({
      where: { business_id: businessId },
      orderBy: { order: 'asc' },
    });

    const categories: MenuCategory[] = dbCats.map((c) => ({
      id: c.id,
      business_id: c.business_id,
      name: c.name,
      order: c.order,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    const biz = await prisma.business.findUnique({ where: { id: businessId } });
    const catOrder = (biz?.menu_theme_config as any)?.categoryOrder || [];

    categories.sort((a, b) => {
      if (Array.isArray(catOrder) && catOrder.length > 0) {
        const idxA = catOrder.indexOf(a.id) !== -1 ? catOrder.indexOf(a.id) : (catOrder.indexOf(a.name) !== -1 ? catOrder.indexOf(a.name) : 9999);
        const idxB = catOrder.indexOf(b.id) !== -1 ? catOrder.indexOf(b.id) : (catOrder.indexOf(b.name) !== -1 ? catOrder.indexOf(b.name) : 9999);
        if (idxA !== idxB) return idxA - idxB;
      }
      const ordA = typeof a.order === 'number' ? a.order : 9999;
      const ordB = typeof b.order === 'number' ? b.order : 9999;
      if (ordA !== ordB) return ordA - ordB;
      return a.name.localeCompare(b.name);
    });

    return res.json({
      success: true,
      data: categories,
    });
  } catch (err: any) {
    console.error('Error fetching categories:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_CATEGORIES_ERROR', message: err.message || 'Failed to fetch categories' },
    });
  }
});

/**
 * POST /api/menus/categories
 * Creates a new category
 */
router.post('/categories', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = await resolveBusinessId(req);
    const { name } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_NAME', message: 'Category name is required.' },
      });
    }

    let existingCat = await prisma.menuCategory.findFirst({
      where: {
        business_id: businessId,
        name: { equals: name.trim(), mode: 'insensitive' },
      },
    });

    let newCategory;
    if (existingCat) {
      newCategory = existingCat;
    } else {
      const catId = generateCategoryDocId(name.trim(), businessId);
      newCategory = await prisma.menuCategory.create({
        data: {
          id: catId,
          business_id: businessId,
          name: name.trim(),
        },
      });
    }

    return res.status(201).json({
      success: true,
      data: newCategory,
      message: 'Category created successfully',
    });
  } catch (err: any) {
    console.error('Error creating category:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'CREATE_CATEGORY_ERROR', message: err.message || 'Failed to create category' },
    });
  }
});

/**
 * PUT /api/menus/categories/reorder
 * Batch updates category display order
 */
router.put('/categories/reorder', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = await resolveBusinessId(req);
    const order = req.body.order || req.body.orderedIds;

    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ORDER', message: 'Order array of category IDs is required.' },
      });
    }

    await Promise.all(
      order.map((catId: string, idx: number) =>
        prisma.menuCategory
          .updateMany({
            where: { id: catId, business_id: businessId },
            data: { order: idx },
          })
          .catch(() => {})
      )
    );

    const biz = await prisma.business.findUnique({ where: { id: businessId } });
    if (biz) {
      const existingThemeConfig = (biz.menu_theme_config as any) || {};
      await prisma.business.update({
        where: { id: businessId },
        data: {
          menu_theme_config: {
            ...existingThemeConfig,
            categoryOrder: order,
          },
        },
      });
    }

    return res.json({
      success: true,
      message: 'Categories reordered successfully',
    });
  } catch (err: any) {
    console.error('Error reordering categories:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'REORDER_CATEGORIES_ERROR', message: err.message || 'Failed to reorder categories' },
    });
  }
});

/**
 * PUT /api/menus/categories/:id
 * Renames/updates a category
 */
router.put('/categories/:id', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const categoryId = req.params.id;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_NAME', message: 'Category name is required.' },
      });
    }

    const existing = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
      });
    }

    const isAuthorized = await assertBusinessAccess(req.user, existing.business_id);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_ACCESS_DENIED', message: `Access denied: You do not have permission to modify categories for venue '${existing.business_id}'.` },
      });
    }

    const updated = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: { name: name.trim() },
    });

    return res.json({
      success: true,
      data: updated,
      message: 'Category updated successfully',
    });
  } catch (err: any) {
    console.error('Error updating category:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'UPDATE_CATEGORY_ERROR', message: err.message || 'Failed to update category' },
    });
  }
});

/**
 * DELETE /api/menus/categories/:id
 * Deletes a category
 */
router.delete('/categories/:id', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const categoryId = req.params.id;
    const existing = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
      });
    }

    const isAuthorized = await assertBusinessAccess(req.user, existing.business_id);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_ACCESS_DENIED', message: `Access denied: You do not have permission to delete categories for venue '${existing.business_id}'.` },
      });
    }

    await prisma.menuCategory.delete({ where: { id: categoryId } });

    return res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (err: any) {
    console.error('Error deleting category:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'DELETE_CATEGORY_ERROR', message: err.message || 'Failed to delete category' },
    });
  }
});

// ============================================================================
// MENU ITEMS CRUD
// ============================================================================

/**
 * GET /api/menus
 * List all menu items for the business with optional filters
 */
router.get('/', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = await resolveBusinessId(req);
    const categoryFilter = req.query.category as string;
    const foodTypeFilter = req.query.food_type as string;
    const statusFilter = req.query.status as string;
    const searchQuery = (req.query.search as string)?.toLowerCase();

    const dbItems = await prisma.menuItem.findMany({
      where: { business_id: businessId },
      orderBy: { order_index: 'asc' },
    });

    const items: MenuItem[] = dbItems.map((d) => {
      const itemStatus: MenuStatus = (d.status as MenuStatus) || (d.is_available === false ? 'unavailable' : 'available');
      return {
        id: d.id,
        business_id: d.business_id,
        name: d.name,
        category: d.category || 'General',
        additional_categories: d.additional_categories || [],
        category_id: d.category_id || undefined,
        price: Number(d.price) || 0,
        currency: d.currency || 'Rs.',
        description: d.description || '',
        image_url: d.image_url || '',
        food_type: (d.food_type as FoodType) || 'none',
        status: itemStatus,
        is_available: itemStatus === 'available',
        is_packageable: (d as any).is_packageable !== false,
        packaging_type: (d as any).packaging_type || ((d as any).is_packageable === false ? 'dine_in_only' : 'packageable'),
        has_variants: Boolean(d.has_variants),
        variants: (d.variants as any) || [],
        variant_group_name: d.variant_group_name || undefined,
        display_style: (d.display_style as any) || 'auto',
        show_image: d.show_image,
        promo_badge: d.promo_badge || undefined,
        station: (d.station as any) || 'KITCHEN',
        erp_item_code: d.erp_item_code || undefined,
        order_index: d.order_index,
        preparation_time_mins: d.preparation_time_mins || 15,
        created_by: d.created_by || 'system',
        created_at: d.created_at,
        updated_at: d.updated_at,
      };
    });

    let filtered = items;

    if (categoryFilter && categoryFilter !== 'all' && categoryFilter !== 'All') {
      const filterLower = categoryFilter.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.category?.toLowerCase() === filterLower ||
          i.category_id === categoryFilter ||
          (Array.isArray(i.additional_categories) &&
            i.additional_categories.some((c) => c?.toLowerCase() === filterLower))
      );
    }

    if (foodTypeFilter && foodTypeFilter !== 'all') {
      filtered = filtered.filter((i) => i.food_type === foodTypeFilter);
    }

    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter((i) => i.status === statusFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter(
        (i) =>
          i.name?.toLowerCase().includes(searchQuery) ||
          i.description?.toLowerCase().includes(searchQuery) ||
          i.category?.toLowerCase().includes(searchQuery)
      );
    }

    filtered.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });

    return res.json({
      success: true,
      count: filtered.length,
      data: filtered,
    });
  } catch (err: any) {
    console.error('Error fetching menu items:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_MENU_ERROR', message: err.message || 'Failed to fetch menu items' },
    });
  }
});

/**
 * GET /api/menus/:id
 * Retrieve single menu item
 */
router.get('/:id', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = req.params.id;
    const d = await prisma.menuItem.findUnique({ where: { id: itemId } });

    if (!d) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Menu item with ID ${itemId} not found.` },
      });
    }

    const itemStatus: MenuStatus = (d.status as MenuStatus) || (d.is_available === false ? 'unavailable' : 'available');
    const item: MenuItem = {
      id: d.id,
      business_id: d.business_id,
      name: d.name,
      category: d.category || 'General',
      additional_categories: d.additional_categories || [],
      category_id: d.category_id || undefined,
      price: Number(d.price) || 0,
      currency: d.currency || 'Rs.',
      description: d.description || '',
      image_url: d.image_url || '',
      food_type: (d.food_type as FoodType) || 'none',
      status: itemStatus,
      is_available: itemStatus === 'available',
      has_variants: Boolean(d.has_variants),
      variants: (d.variants as any) || [],
      variant_group_name: d.variant_group_name || undefined,
      display_style: (d.display_style as any) || 'auto',
      show_image: d.show_image,
      promo_badge: d.promo_badge || undefined,
      station: (d.station as any) || 'KITCHEN',
      erp_item_code: d.erp_item_code || undefined,
      order_index: d.order_index,
      preparation_time_mins: d.preparation_time_mins || 15,
      created_by: d.created_by || 'system',
      created_at: d.created_at,
      updated_at: d.updated_at,
    };

    return res.json({
      success: true,
      data: item,
    });
  } catch (err: any) {
    console.error('Error getting menu item:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'GET_MENU_ITEM_ERROR', message: err.message || 'Failed to get menu item' },
    });
  }
});

/**
 * POST /api/menus
 * Create a new menu item
 */
router.post('/', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = await resolveBusinessId(req);
    const userId = req.user?.id || 'admin-user';
    const {
      name,
      category,
      additional_categories,
      category_id,
      price,
      currency,
      description,
      image_url,
      food_type,
      status,
      is_available,
      has_variants,
      variants,
      variant_group_name,
      display_style,
      show_image,
      promo_badge,
      order_index,
      preparation_time_mins,
      station,
      erp_item_code,
      is_packageable,
      packaging_type,
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_NAME', message: 'Item name is required.' },
      });
    }

    if (price === undefined || isNaN(Number(price)) || Number(price) < 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PRICE', message: 'A valid non-negative price is required.' },
      });
    }

    const itemStatus: MenuStatus = status || (is_available === false ? 'unavailable' : 'available');
    const docId = generateMenuDocId(name.trim(), businessId);
    const validAdditionalCats = Array.isArray(additional_categories)
      ? additional_categories.filter((c: any) => typeof c === 'string' && c.trim().length > 0).map((c: string) => c.trim())
      : [];

    const validFoodType: FoodType = (food_type === 'veg' || food_type === 'non-veg') ? food_type : 'none';
    const validVariants: MenuItemVariant[] = Array.isArray(variants)
      ? variants.map((v: any, idx: number) => {
          const variantObj: any = {
            id: v.id || `var_${Date.now()}_${idx}`,
            name: String(v.name || '').trim(),
            price: Number(v.price) || 0,
            is_available: v.is_available !== false,
          };
          if (v.image_url) variantObj.image_url = String(v.image_url).trim();
          if (v.description) variantObj.description = String(v.description).trim();
          if (v.food_type && ['veg', 'non-veg', 'egg', 'none'].includes(v.food_type)) variantObj.food_type = v.food_type;
          return variantObj;
        })
      : [];

    const created = await prisma.menuItem.create({
      data: {
        id: docId,
        business_id: businessId,
        name: name.trim(),
        category: (category && typeof category === 'string') ? category.trim() : 'General',
        additional_categories: validAdditionalCats,
        category_id: category_id || null,
        price: Number(price),
        currency: currency || 'Rs.',
        description: description || '',
        image_url: image_url || '',
        food_type: validFoodType,
        status: itemStatus,
        is_available: itemStatus === 'available',
        is_packageable: packaging_type ? packaging_type === 'packageable' : is_packageable !== false,
        packaging_type: packaging_type || (is_packageable === false ? 'dine_in_only' : 'packageable'),
        has_variants: Boolean(has_variants && validVariants.length > 0),
        variants: validVariants as any,
        variant_group_name: variant_group_name ? String(variant_group_name).trim() : null,
        display_style: display_style || 'auto',
        show_image: show_image !== undefined ? Boolean(show_image) : true,
        promo_badge: promo_badge ? String(promo_badge).trim() : null,
        order_index: order_index !== undefined ? Number(order_index) : 0,
        preparation_time_mins: Number(preparation_time_mins) || 15,
        station: station || 'KITCHEN',
        erp_item_code: erp_item_code ? String(erp_item_code).trim() : null,
        created_by: userId,
      },
    });

    return res.status(201).json({
      success: true,
      data: created,
      message: 'Menu item created successfully',
    });
  } catch (err: any) {
    console.error('Error creating menu item:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'CREATE_MENU_ITEM_ERROR', message: err.message || 'Failed to create menu item' },
    });
  }
});

/**
 * PUT /api/menus/:id
 * Full/partial update of menu item
 */
router.put('/:id', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = req.params.id;
    const existing = await prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'ITEM_NOT_FOUND', message: 'Menu item not found.' },
      });
    }

    const isAuthorized = await assertBusinessAccess(req.user, existing.business_id);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_ACCESS_DENIED', message: `Access denied: You do not have permission to modify menu items for venue '${existing.business_id}'.` },
      });
    }

    const {
      name,
      category,
      additional_categories,
      category_id,
      price,
      currency,
      description,
      image_url,
      food_type,
      status,
      is_available,
      has_variants,
      variants,
      variant_group_name,
      display_style,
      show_image,
      promo_badge,
      order_index,
      preparation_time_mins,
      station,
      erp_item_code,
      is_packageable,
      packaging_type,
    } = req.body;

    const updates: any = {};

    if (name !== undefined) updates.name = String(name).trim();
    if (category !== undefined) updates.category = String(category).trim();
    if (additional_categories !== undefined) {
      updates.additional_categories = Array.isArray(additional_categories)
        ? additional_categories.filter((c: any) => typeof c === 'string' && c.trim().length > 0).map((c: string) => c.trim())
        : [];
    }
    if (category_id !== undefined) updates.category_id = category_id || null;
    if (price !== undefined) updates.price = Number(price);
    if (currency !== undefined) updates.currency = String(currency);
    if (description !== undefined) updates.description = String(description);
    if (image_url !== undefined) updates.image_url = String(image_url);
    if (food_type !== undefined) {
      updates.food_type = (food_type === 'veg' || food_type === 'non-veg') ? food_type : 'none';
    }
    if (preparation_time_mins !== undefined) updates.preparation_time_mins = Number(preparation_time_mins);
    if (has_variants !== undefined) updates.has_variants = Boolean(has_variants);
    if (variants !== undefined) {
      updates.variants = Array.isArray(variants) ? variants : [];
    }
    if (variant_group_name !== undefined) {
      updates.variant_group_name = variant_group_name ? String(variant_group_name).trim() : null;
    }
    if (display_style !== undefined) updates.display_style = display_style;
    if (show_image !== undefined) updates.show_image = Boolean(show_image);
    if (promo_badge !== undefined) updates.promo_badge = promo_badge ? String(promo_badge).trim() : null;
    if (order_index !== undefined) updates.order_index = Number(order_index);
    if (station !== undefined) updates.station = station;
    if (erp_item_code !== undefined) updates.erp_item_code = erp_item_code ? String(erp_item_code).trim() : null;

    if (status !== undefined) {
      updates.status = status;
      updates.is_available = status === 'available';
    } else if (is_available !== undefined) {
      updates.is_available = Boolean(is_available);
      updates.status = is_available ? 'available' : 'unavailable';
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: updates,
    });

    return res.json({
      success: true,
      data: updated,
      message: 'Menu item updated successfully',
    });
  } catch (err: any) {
    console.error('Error updating menu item:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'UPDATE_MENU_ITEM_ERROR', message: err.message || 'Failed to update menu item' },
    });
  }
});

/**
 * POST /api/menus/availability/bulk-available
 * Bulk reset all unavailable or out-of-stock items and variants in the venue to available
 */
router.post('/availability/bulk-available', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = await resolveBusinessId(req);
    const isAuthorized = await assertBusinessAccess(req.user, businessId);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_ACCESS_DENIED', message: `Access denied for venue '${businessId}'.` },
      });
    }

    const allItems = await prisma.menuItem.findMany({
      where: { business_id: businessId },
    });

    let updatedCount = 0;
    const updates: Promise<any>[] = [];

    for (const item of allItems) {
      const isItemOff = !item.is_available || item.status !== 'available';
      let variantsModified = false;
      let nextVariants = item.variants;

      if (Array.isArray(item.variants) && item.variants.length > 0) {
        nextVariants = (item.variants as any[]).map((v) => {
          if (v.is_available === false || (v.status && v.status !== 'available')) {
            variantsModified = true;
            return { ...v, is_available: true, status: 'available' };
          }
          return v;
        });
      }

      if (isItemOff || variantsModified) {
        updatedCount++;
        updates.push(
          prisma.menuItem.update({
            where: { id: item.id },
            data: {
              is_available: true,
              status: 'available',
              variants: nextVariants as any,
            },
          })
        );
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    realtimeEmitter.menuUpdated(businessId);

    return res.json({
      success: true,
      message: `Reset ${updatedCount} item(s) to available`,
      count: updatedCount,
    });
  } catch (err: any) {
    console.error('Error in bulk-available endpoint:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'BULK_UPDATE_ERROR', message: err.message || 'Failed to bulk reset item availability' },
    });
  }
});

/**
 * PATCH /api/menus/:id/status
 * Quick toggle for item availability status (supports optional variant_id)
 */
router.patch('/:id/status', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = req.params.id;
    const existing = await prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'ITEM_NOT_FOUND', message: 'Menu item not found.' },
      });
    }

    const isAuthorized = await assertBusinessAccess(req.user, existing.business_id);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_ACCESS_DENIED', message: `Access denied: You do not have permission to modify menu items for venue '${existing.business_id}'.` },
      });
    }

    const { status, is_available, variant_id, variantId } = req.body;
    const targetVariantId = variant_id || variantId;

    if (targetVariantId && Array.isArray(existing.variants)) {
      const normStatus = status ? String(status).toLowerCase() : undefined;
      const isAvail = is_available !== undefined ? Boolean(is_available) : (normStatus === 'available' || normStatus === 'in_stock');
      const finalStatus = normStatus || (isAvail ? 'available' : 'unavailable');

      const updatedVariants = (existing.variants as any[]).map((v) => {
        if (v.id === targetVariantId) {
          return {
            ...v,
            is_available: isAvail,
            status: finalStatus,
          };
        }
        return v;
      });

      const allVariantsUnavailable = updatedVariants.every(
        (v) => v.is_available === false || v.status === 'out_of_stock' || v.status === 'unavailable'
      );

      const updateData: any = { variants: updatedVariants };
      if (allVariantsUnavailable) {
        updateData.is_available = false;
        updateData.status = 'unavailable';
      } else if (!existing.is_available && !allVariantsUnavailable) {
        updateData.is_available = true;
        updateData.status = 'available';
      }

      const updated = await prisma.menuItem.update({
        where: { id: itemId },
        data: updateData,
      });

      realtimeEmitter.menuUpdated(existing.business_id);

      return res.json({
        success: true,
        message: `Variant status updated to ${finalStatus}`,
        status: updated.status,
        is_available: updated.is_available,
        item: updated,
      });
    }

    const updates: any = {};
    if (status !== undefined && is_available !== undefined) {
      const normStatus = String(status).toLowerCase();
      const isAvail = Boolean(is_available) && normStatus !== 'out_of_stock' && normStatus !== 'unavailable';
      updates.is_available = isAvail;
      updates.status = isAvail ? 'available' : normStatus;
    } else if (status !== undefined) {
      const normStatus = String(status).toLowerCase();
      updates.status = normStatus;
      updates.is_available = normStatus === 'available' || normStatus === 'in_stock';
    } else if (is_available !== undefined) {
      updates.is_available = Boolean(is_available);
      updates.status = is_available ? 'available' : 'out_of_stock';
    } else {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_STATUS', message: 'Provide status or is_available flag.' },
      });
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: updates,
    });

    realtimeEmitter.menuUpdated(existing.business_id);

    return res.json({
      success: true,
      message: `Menu item status updated to ${updated.status}`,
      status: updated.status,
      is_available: updated.is_available,
    });
  } catch (err: any) {
    console.error('Error updating menu item status:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'UPDATE_STATUS_ERROR', message: err.message || 'Failed to update menu status' },
    });
  }
});

/**
 * DELETE /api/menus/:id
 * Delete menu item from database
 */

/**
 * POST /api/menus/bulk-import/validate
 * Pre-flight validation of raw Excel/CSV rows (and live DB merge conflict detection)
 */
router.post('/bulk-import/validate', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = await resolveBusinessId(req);
    const { rawRows, items, mode = 'merge', pricingMode = 'inclusive', taxRate = 13 } = req.body;
    const importMode = mode === 'replace' ? 'replace' : 'merge';

    const existingItemsRaw = await prisma.menuItem.findMany({
      where: { business_id: businessId },
      select: { id: true, name: true, erp_item_code: true, category: true, variants: true },
    });
    const existingItems = existingItemsRaw.map((d) => ({
      ...d,
      variants: Array.isArray(d.variants) ? (d.variants as any[]) : null,
    }));

    if (Array.isArray(rawRows)) {
      const result = extractAndValidateMenuMatrix(rawRows, {
        pricingMode: pricingMode === 'exclusive' ? 'exclusive' : 'inclusive',
        taxRate: Number(taxRate) || 0,
        importMode,
        existingItems,
      });
      return res.json({
        success: true,
        valid: result.errors.length === 0,
        errors: result.errors,
        warnings: result.warnings,
        summary: result.summary,
        parsedItems: result.items,
      });
    }

    if (Array.isArray(items)) {
      const result = validateGroupedPayload(items, existingItems, importMode);
      return res.json({
        success: true,
        valid: result.errors.length === 0,
        errors: result.errors,
        warnings: result.warnings,
        summary: result.summary,
      });
    }

    return res.status(400).json({
      success: false,
      error: { code: 'EMPTY_PAYLOAD', message: 'Provide rawRows or items to validate.' },
    });
  } catch (err: any) {
    console.error('Error during menu bulk import validation:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: err.code || 'VALIDATION_ERROR', message: err.message || 'Failed to validate menu spreadsheet' },
    });
  }
});

/**
 * POST /api/menus/bulk-import
 * Bulk import or update menu items from Excel / CSV
 * Supports:
 * - 'merge': Updates existing dishes by erp_item_code or name (preserves images & descriptions), creates new dishes
 * - 'replace': Wipes existing dishes and replaces them
 */
router.post('/bulk-import', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = await resolveBusinessId(req);
    const userId = req.user?.id || 'admin-user';
    const { rawRows, items, mode = 'merge', pricingMode = 'inclusive', taxRate = 13 } = req.body;
    const importMode = mode === 'replace' ? 'replace' : 'merge';

    // 1. Fetch existing items & categories FIRST (before any delete/replace) so validation is authoritative
    const existingItems = await prisma.menuItem.findMany({
      where: { business_id: businessId },
    });
    const existingRefs = existingItems.map((d) => ({
      id: d.id,
      name: d.name,
      erp_item_code: d.erp_item_code,
      category: d.category || 'General',
      variants: Array.isArray(d.variants) ? (d.variants as any[]) : null,
    }));

    let effectiveItems: any[] = [];
    let validationWarnings: any[] = [];
    let validationSummary: any = null;
    if (Array.isArray(rawRows)) {
      const validation = extractAndValidateMenuMatrix(rawRows, {
        pricingMode: pricingMode === 'exclusive' ? 'exclusive' : 'inclusive',
        taxRate: Number(taxRate) || 0,
        importMode,
        existingItems: existingRefs,
      });

      if (validation.errors.length > 0) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'IMPORT_VALIDATION_FAILED',
            message: `Found ${validation.errors.length} blocking error(s) in the uploaded Excel sheet.`,
          },
          validation: {
            errors: validation.errors,
            warnings: validation.warnings,
            summary: validation.summary,
          },
        });
      }

      if (validation.items.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'EMPTY_PAYLOAD', message: 'No valid items detected in the spreadsheet.' },
        });
      }
      effectiveItems = validation.items;
      validationWarnings = validation.warnings;
      validationSummary = validation.summary;
    } else {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'EMPTY_PAYLOAD', message: 'No items provided for import.' },
        });
      }

      const validation = validateGroupedPayload(items, existingRefs, importMode);
      if (validation.errors.length > 0) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'IMPORT_VALIDATION_FAILED',
            message: `Found ${validation.errors.length} blocking error(s) in the import payload.`,
          },
          validation: {
            errors: validation.errors,
            warnings: validation.warnings,
            summary: validation.summary,
          },
        });
      }
      effectiveItems = items;
      validationWarnings = validation.warnings;
      validationSummary = validation.summary;
    }

    const existingCategories = await prisma.menuCategory.findMany({
      where: { business_id: businessId },
    });
    const categoryMap = new Map<string, string>();
    existingCategories.forEach((cat) => {
      categoryMap.set(cat.name.trim().toLowerCase(), cat.id);
    });

    // Map existing items by normalized ERP code and lowercase whitespace-collapsed name
    const itemByErpCode = new Map<string, any>();
    const itemByName = new Map<string, any>();
    existingItems.forEach((it) => {
      if (it.erp_item_code) {
        itemByErpCode.set(normalizeImportKey(it.erp_item_code), it);
      }
      itemByName.set(normalizeImportKey(it.name), it);
    });

    // If replace mode is requested, remove existing items and wipe previous categories
    if (importMode === 'replace') {
      await prisma.menuItem.deleteMany({ where: { business_id: businessId } });
      await prisma.menuCategory.deleteMany({ where: { business_id: businessId } });
      categoryMap.clear();
      itemByErpCode.clear();
      itemByName.clear();

      // Clear existing custom categoryOrder in business menu_theme_config so new categories order cleanly
      const biz = await prisma.business.findUnique({ where: { id: businessId } });
      if (biz && biz.menu_theme_config) {
        const existingTheme = (biz.menu_theme_config as any) || {};
        if (existingTheme.categoryOrder) {
          const { categoryOrder, ...restTheme } = existingTheme;
          await prisma.business.update({
            where: { id: businessId },
            data: { menu_theme_config: restTheme },
          });
        }
      }
    }

    let createdCount = 0;
    let updatedCount = 0;
    const rateMultiplier = pricingMode === 'exclusive' ? (1 + (Number(taxRate) || 0) / 100) : 1;

    for (const raw of effectiveItems) {
      const rawName = String(raw.name || raw['Item Name'] || raw.ProductName || '').trim().replace(/\s+/g, ' ');
      if (!rawName) continue;

      const rawCode = raw.erp_item_code !== undefined && raw.erp_item_code !== null
        ? String(raw.erp_item_code).trim().replace(/\s+/g, ' ')
        : (raw.code ? String(raw.code).trim().replace(/\s+/g, ' ') : null);

      const rawCategory = String(raw.category || raw.Group || raw.Category || 'General').trim().replace(/\s+/g, ' ');
      const catKey = rawCategory.toLowerCase();

      // Ensure category exists (with plural/singular tolerance)
      let categoryId = categoryMap.get(catKey);
      if (!categoryId && catKey.endsWith('s')) {
        categoryId = categoryMap.get(catKey.slice(0, -1));
      }
      if (!categoryId && !catKey.endsWith('s')) {
        categoryId = categoryMap.get(catKey + 's');
      }
      if (!categoryId && rawCategory) {
        try {
          const newCat = await prisma.menuCategory.create({
            data: {
              business_id: businessId,
              name: rawCategory,
              order: categoryMap.size,
            },
          });
          categoryId = newCat.id;
          categoryMap.set(catKey, newCat.id);
        } catch (e) {
          // In case of concurrent insert
          const found = await prisma.menuCategory.findFirst({
            where: { business_id: businessId, name: rawCategory },
          });
          if (found) {
            categoryId = found.id;
            categoryMap.set(catKey, found.id);
          }
        }
      }

      // Calculate final menu price
      const rawPrice = Number(raw.price || raw.rate || raw.Rate || raw.BasePrice || 0);
      const finalPrice = Math.round(rawPrice * rateMultiplier * 100) / 100;

      // Routing station (respect explicit station; only infer from category when omitted)
      let station = 'KITCHEN';
      const rawStation = String(raw.station || '').toUpperCase().trim();
      if (rawStation) {
        if (rawStation.includes('BOTH')) station = 'BOTH';
        else if (rawStation.includes('BAR') && rawStation.includes('KITCHEN')) station = 'BOTH';
        else if (rawStation.includes('BAR')) station = 'BAR';
        else station = 'KITCHEN';
      } else if (catKey.includes('beverage') || catKey.includes('drink')) {
        station = 'BAR';
      }

      // Check if item already exists (by ERP Code first, then by normalized name)
      const existing = (rawCode ? itemByErpCode.get(normalizeImportKey(rawCode)) : null) || itemByName.get(normalizeImportKey(rawName));

      const validVariants = raw.has_variants && Array.isArray(raw.variants) && raw.variants.length > 0
        ? raw.variants.map((v: any, i: number) => ({
            id: v.id || `var_${Date.now()}_${i}`,
            name: String(v.name || '').trim(),
            price: Math.round((Number(v.price) || 0) * rateMultiplier * 100) / 100,
            is_available: v.is_available !== false,
            description: v.description ? String(v.description).trim() : undefined,
            food_type: v.food_type || 'none',
            erp_item_code: v.erp_item_code ? String(v.erp_item_code).trim() : undefined,
            station: v.station || undefined,
          }))
        : null;

      if (existing && importMode === 'merge') {
        // Surgically update price and ERP code while preserving image, description, variants, etc.
        await prisma.menuItem.update({
          where: { id: existing.id },
          data: {
            price: finalPrice,
            erp_item_code: rawCode || existing.erp_item_code,
            station: raw.station ? station : existing.station,
            category_id: categoryId || existing.category_id,
            category: rawCategory || existing.category,
            has_variants: raw.has_variants !== undefined ? Boolean(raw.has_variants) : existing.has_variants,
            variant_group_name: raw.variant_group_name || existing.variant_group_name || 'Options',
            variants: validVariants ? validVariants : existing.variants,
            is_packageable: raw.packaging_type ? raw.packaging_type === 'packageable' : raw.is_packageable !== undefined ? Boolean(raw.is_packageable) : existing.is_packageable,
            packaging_type: raw.packaging_type || (raw.is_packageable === false ? 'dine_in_only' : (existing as any).packaging_type || 'packageable'),
          },
        });
        updatedCount++;
      } else {
        // Create new menu item
        const docId = generateMenuDocId(rawName, businessId);
        await prisma.menuItem.create({
          data: {
            id: docId,
            business_id: businessId,
            name: rawName,
            category: rawCategory,
            additional_categories: raw.subCategory && raw.subCategory.toLowerCase() !== rawName.toLowerCase() ? [raw.subCategory] : [],
            category_id: categoryId || null,
            price: finalPrice,
            currency: 'Rs.',
            description: raw.description ? String(raw.description).trim() : '',
            image_url: raw.image_url ? String(raw.image_url).trim() : '',
            food_type:
              raw.food_type === 'veg' || raw.food_type === 'non-veg' || raw.food_type === 'none'
                ? raw.food_type
                : (catKey.includes('veg') ? 'veg' : 'none'),
            status: 'available',
            is_available: true,
            is_packageable: raw.packaging_type ? raw.packaging_type === 'packageable' : raw.is_packageable !== false,
            packaging_type: raw.packaging_type || (raw.is_packageable === false ? 'dine_in_only' : 'packageable'),
            has_variants: Boolean(raw.has_variants && validVariants && validVariants.length > 0),
            variant_group_name: raw.has_variants ? (raw.variant_group_name || 'Options') : null,
            variants: validVariants ? validVariants : undefined,
            station,
            erp_item_code: rawCode || null,
            created_by: userId,
          },
        });
        createdCount++;
      }
    }

    return res.json({
      success: true,
      createdCount,
      updatedCount,
      data: { createdCount, updatedCount, totalProcessed: createdCount + updatedCount },
      validation: {
        warnings: validationWarnings,
        summary: validationSummary,
      },
      message: `Menu import complete: ${createdCount} created, ${updatedCount} updated.`,
    });
  } catch (err: any) {
    console.error('Error during menu bulk import:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: err.code || 'BULK_IMPORT_ERROR', message: err.message || 'Failed to bulk import menu' },
    });
  }
});

router.delete('/:id', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = req.params.id;
    const existing = await prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'ITEM_NOT_FOUND', message: 'Menu item not found.' },
      });
    }

    const isAuthorized = await assertBusinessAccess(req.user, existing.business_id);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_ACCESS_DENIED', message: `Access denied: You do not have permission to delete menu items for venue '${existing.business_id}'.` },
      });
    }

    await prisma.menuItem.delete({ where: { id: itemId } });

    return res.json({
      success: true,
      message: 'Menu item deleted successfully',
    });
  } catch (err: any) {
    console.error('Error deleting menu item:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'DELETE_MENU_ITEM_ERROR', message: err.message || 'Failed to delete menu item' },
    });
  }
});

export default router;
