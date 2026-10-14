import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, optionalAuthenticate, requireResourceAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { db } from '../services/db.service';
import { MenuItem, MenuCategory, FoodType, MenuStatus, MenuItemVariant } from '../types/rbac.types';
import { generateMenuDocId, generateCategoryDocId } from '../utils/id.utils';

const router = Router();

const DEFAULT_BIZ_ID = 'maya-forest-resort';

/**
 * Robust helper to resolve the business ID from query, header, body, or authenticated user
 */
async function resolveBusinessId(req: AuthenticatedRequest): Promise<string> {
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
  try {
    const defaultBiz = await db.getDefaultBusiness();
    if (defaultBiz?.id) return defaultBiz.id;
  } catch (err) {
    // fallback
  }
  return DEFAULT_BIZ_ID;
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
    const { order } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ORDER', message: 'Order array of category IDs is required.' },
      });
    }

    await Promise.all(
      order.map((catId: string, idx: number) =>
        prisma.menuCategory
          .update({
            where: { id: catId },
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
        has_variants: Boolean(d.has_variants),
        variants: (d.variants as any) || [],
        variant_group_name: d.variant_group_name || undefined,
        display_style: (d.display_style as any) || 'auto',
        show_image: d.show_image,
        promo_badge: d.promo_badge || undefined,
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
        has_variants: Boolean(has_variants && validVariants.length > 0),
        variants: validVariants as any,
        variant_group_name: variant_group_name ? String(variant_group_name).trim() : null,
        display_style: display_style || 'auto',
        show_image: show_image !== undefined ? Boolean(show_image) : true,
        promo_badge: promo_badge ? String(promo_badge).trim() : null,
        order_index: order_index !== undefined ? Number(order_index) : 0,
        preparation_time_mins: Number(preparation_time_mins) || 15,
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
 * PATCH /api/menus/:id/status
 * Quick toggle for item availability status
 */
router.patch('/:id/status', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = req.params.id;
    const { status, is_available } = req.body;

    const updates: any = {};
    if (status) {
      updates.status = status;
      updates.is_available = status === 'available';
    } else if (is_available !== undefined) {
      updates.is_available = Boolean(is_available);
      updates.status = is_available ? 'available' : 'unavailable';
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
router.delete('/:id', authenticate, requireResourceAccess('menus', 'write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemId = req.params.id;
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
