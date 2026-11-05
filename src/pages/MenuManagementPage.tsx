import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Business, MenuThemeConfig } from '../types/auth';
import { MenuThemeCustomizerModal } from '../components/menu/MenuThemeCustomizerModal';
import { MenuItem, MenuCategory, MenuStatus } from '../types/rbac';
import { rbacService } from '../services/rbac.service';
import { getAllItemCategories, itemMatchesCategory } from '../utils/menuUtils';
import { CategoryManager } from '../components/menu/CategoryManager';
import { MenuItemCard } from '../components/menu/MenuItemCard';
import { MenuItemFormModal } from '../components/menu/MenuItemFormModal';
import { MenuItemPreviewModal } from '../components/menu/MenuItemPreviewModal';
import { MenuBulkImportModal } from '../components/menu/MenuBulkImportModal';
import { DeleteConfirmationModal } from '../components/menu/DeleteConfirmationModal';
import {
  Plus,
  Eye,
  FileSpreadsheet,
  Search,
  UtensilsCrossed,
  Filter,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Loader2,
  RefreshCw, Paintbrush,
  Image as ImageIcon,
} from 'lucide-react';

interface MenuManagementPageProps {
  userRole?: string;
  isViewOnly?: boolean;
  businessId?: string;
  onNavigate?: (path: string) => void;
  onRequestRoleSignIn?: () => void;
}

export const MenuManagementPage: React.FC<MenuManagementPageProps> = ({
  userRole,
  isViewOnly = false,
  businessId,
  onNavigate,
  onRequestRoleSignIn,
}) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MenuStatus>('all');
  const [foodTypeFilter, setFoodTypeFilter] = useState<'all' | 'veg' | 'non-veg'>('all');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<MenuItem | null>(null);
  const [previewItem, setPreviewItem] = useState<MenuItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Success & Error Alerts
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Business Profile & Theme Customizer
  const [businessProfile, setBusinessProfile] = useState<Business | null>(null);
  const [isThemeCustomizerOpen, setIsThemeCustomizerOpen] = useState<boolean>(false);

  const { updateBusiness } = useAuth();
  const isOwnerOrAdminOrManager = !isViewOnly;
  const isKitchenStaff = !isViewOnly;
  const canEditTheme = !isViewOnly;
  const canCreateMenu = !isViewOnly;

  const loadData = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      const [itemsData, catsData, profileData] = await Promise.all([
        rbacService.getMenusApi(businessId),
        rbacService.getCategoriesApi(businessId).catch(() => []),
        rbacService.getBusinessProfileApi(businessId).catch(() => null),
      ]);

      setMenuItems(itemsData);
      setCategories(catsData);
      if (profileData) {
        setBusinessProfile(profileData);
      }
    } catch (err: any) {
      console.error('Failed to load menu data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSaveTheme = async (newConfig: MenuThemeConfig) => {
    if (!canEditTheme) return;
    try {
      const updated = await rbacService.updateBusinessProfileApi({ menu_theme_config: newConfig }, businessId);
      setBusinessProfile(prev => prev ? { ...prev, menu_theme_config: newConfig } : null);
      if (updateBusiness && updated) {
        updateBusiness(updated);
      }
      setSuccessMessage('Menu theme updated successfully. Customers will now see the new design.');
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error('Failed to save menu theme:', err);
      setErrorMessage(err.message || 'Failed to update menu theme.');
      setTimeout(() => setErrorMessage(null), 4500);
    }
  };

  useEffect(() => {
    loadData();
  }, [businessId]);

  // Category Actions
  const handleAddCategory = async (name: string) => {
    const newCat = await rbacService.createCategoryApi(name, businessId);
    setCategories((prev) => [...prev, newCat]);
    return newCat;
  };

  const handleRenameCategory = async (id: string, newName: string) => {
    await rbacService.updateCategoryApi(id, newName, businessId);
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: newName } : c))
    );
  };

  const handleDeleteCategory = async (id: string) => {
    await rbacService.deleteCategoryApi(id, businessId);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  // Dynamic Category Positioning & Reordering
  const handleReorderCategories = async (newCategories: MenuCategory[]) => {
    setCategories(newCategories);
    const orderedIds = newCategories.map((c) => c.id);

    setBusinessProfile((prev) =>
      prev
        ? ({
            ...prev,
            menu_theme_config: {
              ...(prev.menu_theme_config || {}),
              categoryOrder: orderedIds,
            } as any,
          } as Business)
        : null
    );

    try {
      await rbacService.reorderCategoriesApi(orderedIds, businessId);
      setSuccessMessage('Category order updated successfully. Customer menu is now in sync.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to reorder categories:', err);
      setErrorMessage(err.message || 'Failed to save category order.');
      loadData(true);
    }
  };

  const orderedCategories = useMemo(() => {
    const order = businessProfile?.menu_theme_config?.categoryOrder || [];
    return [...categories].sort((a, b) => {
      if (order.length > 0) {
        const idxA = order.indexOf(a.id) !== -1 ? order.indexOf(a.id) : (order.indexOf(a.name) !== -1 ? order.indexOf(a.name) : 9999);
        const idxB = order.indexOf(b.id) !== -1 ? order.indexOf(b.id) : (order.indexOf(b.name) !== -1 ? order.indexOf(b.name) : 9999);
        if (idxA !== idxB) return idxA - idxB;
      }
      const ordA = typeof a.order === 'number' ? a.order : 9999;
      const ordB = typeof b.order === 'number' ? b.order : 9999;
      if (ordA !== ordB) return ordA - ordB;
      return a.name.localeCompare(b.name);
    });
  }, [categories, businessProfile?.menu_theme_config?.categoryOrder]);

  // Menu Item CRUD
  const handleOpenAdd = () => {
    setItemToEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: MenuItem) => {
    setItemToEdit(item);
    setIsFormOpen(true);
  };

  const handleSaveItem = async (payload: Partial<MenuItem>) => {
    if (itemToEdit) {
      await rbacService.updateMenuItemApi(itemToEdit.id, payload, businessId);
      setSuccessMessage(`"${payload.name}" updated successfully!`);
      alert(`Changes saved successfully to database for ${payload.name}!`);
    } else {
      const created = await rbacService.createMenuItemApi(payload, businessId);
      setSuccessMessage(`"${created.name}" created successfully!`);
      alert(`Created successfully in database for ${created.name}!`);
    }
    await loadData(true);
  };

  const handleStatusChange = async (item: MenuItem, newStatus: MenuStatus) => {
    await rbacService.updateMenuItemStatusApi(item.id, newStatus, businessId);
    setMenuItems((prev) =>
      prev.map((m) =>
        m.id === item.id
          ? {
              ...m,
              status: newStatus,
              is_available: newStatus === 'available',
            }
          : m
      )
    );
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      setDeleteLoading(true);
      await rbacService.deleteMenuItemApi(itemToDelete.id, businessId);
      setMenuItems((prev) => prev.filter((m) => m.id !== itemToDelete.id));
      setItemToDelete(null);
      setSuccessMessage('Menu item deleted successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to delete menu item');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filter calculations (accounting for multi-category items)
  const categoryCounts = menuItems.reduce<Record<string, number>>((acc, item) => {
    const allCats = getAllItemCategories(item);
    for (const cat of allCats) {
      const key = cat.toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {});

  const filteredItems = menuItems.filter((item) => {
    const matchesCat =
      selectedCategory === 'All' ||
      itemMatchesCategory(item, selectedCategory);

    const itemCats = getAllItemCategories(item);
    const matchesSearch =
      searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      itemCats.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ||
      item.status === statusFilter ||
      (statusFilter === 'available' && item.is_available && !item.status) ||
      (statusFilter === 'unavailable' && !item.is_available && !item.status);

    const matchesFoodType =
      foodTypeFilter === 'all' || item.food_type === foodTypeFilter;

    return matchesCat && matchesSearch && matchesStatus && matchesFoodType;
  });

  return (
    <div id="menu-management-page" className="space-y-6">
      {/* View-Only Mode Banner */}
      {isViewOnly && (
        <div id="view-only-role-notice-banner" className="bg-amber-50 border border-amber-200 text-amber-900 px-5 py-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900">
                Dashboard Mode: View-Only
              </div>
              <p className="text-xs text-zinc-600 mt-0.5">
                Viewing is allowed for everyone. To add dishes, edit pricing, or toggle availability according to your designation, please authenticate your role.
              </p>
            </div>
          </div>
          {onRequestRoleSignIn && (
            <button
              id="btn-banner-role-login"
              type="button"
              onClick={onRequestRoleSignIn}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs shrink-0 cursor-pointer"
            >
              Staff / Role Sign-In →
            </button>
          )}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 id="page-main-heading" className="text-xl sm:text-2xl font-extrabold text-zinc-900 tracking-tight">
              Menu Management
            </h1>
            {isKitchenStaff && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Kitchen Staff Mode
              </span>
            )}
            {isViewOnly && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                View Only
              </span>
            )}
            {isOwnerOrAdminOrManager && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                Manager / Owner Access
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zinc-500">
            {isViewOnly
              ? 'Catalog inspection mode. Sign in with your assigned staff/owner account to make edits.'
              : isKitchenStaff
              ? 'Real-time kitchen availability control. Toggle dishes between Available, Out of Stock, or Unavailable.'
              : 'Create, organize, price and manage your restaurant menu items.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            id="btn-refresh-menu"
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2.5 bg-zinc-50 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 rounded-xl transition cursor-pointer"
            title="Refresh menu items"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Customer Preview button */}
          <button
            id="btn-preview-customer-menu"
            type="button"
            onClick={() => window.open('/menu', '_blank')}
            className="px-4 py-2.5 bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-50 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Eye className="w-4 h-4 text-indigo-600" />
            <span>Preview Menu</span>
          </button>

          {canEditTheme && (
            <button
              type="button"
              onClick={() => setIsThemeCustomizerOpen(true)}
              className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Paintbrush className="w-4 h-4" />
              <span>Theme</span>
            </button>
          )}
          
          {canCreateMenu && (
            <button
              id="btn-bulk-import-excel"
              type="button"
              onClick={() => setIsBulkImportOpen(true)}
              className="px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-2 cursor-pointer"
              title="Bulk import dishes from Excel or CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-purple-600" />
              <span>Import Excel / CSV</span>
            </button>
          )}

          {canCreateMenu && (
            <button
              id="btn-add-menu-item-primary"
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Menu Item</span>
            </button>
          )}

          {isViewOnly && onRequestRoleSignIn && (
            <button
              id="btn-header-sign-in-role"
              type="button"
              onClick={onRequestRoleSignIn}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <span>Staff Sign-In</span>
            </button>
          )}
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div
          id="success-banner"
          className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl flex items-center justify-between gap-3 shadow-xs animate-in fade-in"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold">{successMessage}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="btn-banner-view-preview"
              type="button"
              onClick={() => onNavigate && onNavigate('/menu-preview')}
              className="text-xs font-bold text-emerald-800 underline hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
            >
              <span>View Customer Preview</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-xs text-emerald-700 hover:text-emerald-900 ml-2 cursor-pointer font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorMessage && (
        <div
          id="error-banner"
          className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl flex items-center justify-between gap-3 shadow-xs animate-in fade-in"
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="text-xs font-bold">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs text-rose-700 hover:text-rose-900 ml-2 cursor-pointer font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Categories Navigation Bar */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs">
        <CategoryManager
          categories={orderedCategories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          canManageCategories={canCreateMenu}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          onReorderCategories={canCreateMenu ? handleReorderCategories : undefined}
          categoryCounts={categoryCounts}
          totalCount={menuItems.length}
        />
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-400" />
          <input
            id="input-menu-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu items..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-zinc-900 transition font-medium"
          />
        </div>

        {/* Filter Dropdowns & Segmented Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-xl p-1 text-xs">
            <span className="text-[11px] font-bold text-zinc-400 px-1.5 uppercase">Status:</span>
            <select
              id="select-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-xs font-semibold text-zinc-700 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="available">🟢 Available</option>
              <option value="out_of_stock">🟠 Out of Stock</option>
              <option value="unavailable">⚪ Unavailable</option>
            </select>
          </div>

          {/* Food Type Filter */}
          <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-xl p-1 text-xs">
            <span className="text-[11px] font-bold text-zinc-400 px-1.5 uppercase">Dietary:</span>
            <select
              id="select-dietary-filter"
              value={foodTypeFilter}
              onChange={(e) => setFoodTypeFilter(e.target.value as any)}
              className="bg-transparent text-xs font-semibold text-zinc-700 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="veg">🌱 Pure Veg</option>
              <option value="non-veg">🍗 Non-Veg</option>
            </select>
          </div>

          {(searchQuery || statusFilter !== 'all' || foodTypeFilter !== 'all' || selectedCategory !== 'All') && (
            <button
              id="btn-clear-filters"
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setFoodTypeFilter('all');
                setSelectedCategory('All');
              }}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 px-2 py-1 cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Menu Items Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 py-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-zinc-200 h-72 animate-pulse p-4 space-y-3">
              <div className="w-full h-40 bg-zinc-100 rounded-lg" />
              <div className="h-4 bg-zinc-200 rounded-md w-2/3" />
              <div className="h-3 bg-zinc-100 rounded-md w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          id="menu-empty-state"
          className="bg-white rounded-2xl border border-dashed border-zinc-300 p-12 text-center space-y-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <UtensilsCrossed className="w-7 h-7 stroke-[1.5]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-900">
              {menuItems.length === 0 ? 'No menu items yet' : 'No items match your filter criteria'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              {menuItems.length === 0
                ? 'Create your first menu item to start building your restaurant menu.'
                : 'Try adjusting your search query, status filters, or category tabs.'}
            </p>
          </div>

          {canCreateMenu && menuItems.length === 0 && (
            <button
              id="btn-create-first-item"
              type="button"
              onClick={handleOpenAdd}
              className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition shadow-sm inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Menu Item</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              canManage={canCreateMenu}
              isKitchenStaff={isKitchenStaff}
              onEdit={handleOpenEdit}
              onDelete={setItemToDelete}
              onPreview={setPreviewItem}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Form Modal with Live Preview */}

      <MenuBulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        businessId={businessId || 'maya-forest-resort'}
        onSuccess={() => {
          setSuccessMessage('Menu successfully updated from spreadsheet!');
          setSelectedCategory('All');
          loadData(true);
        }}
      />

      <MenuItemFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveItem}
        itemToEdit={itemToEdit}
        categories={categories}
        onCreateCategory={canCreateMenu ? handleAddCategory : undefined}
      />

      {isThemeCustomizerOpen && (
        <MenuThemeCustomizerModal
          currentConfig={businessProfile?.menu_theme_config}
          onSave={handleSaveTheme}
          onClose={() => setIsThemeCustomizerOpen(false)}
          menuItems={menuItems}
          categories={categories}
        />
      )}

      {/* Individual Customer Preview Modal */}
      <MenuItemPreviewModal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        item={previewItem}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        item={itemToDelete}
        loading={deleteLoading}
      />
    </div>
  );
};
