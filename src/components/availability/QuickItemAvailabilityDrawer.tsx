import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem, MenuItemVariant, MenuStatus } from '../../types/rbac';
import { rbacService } from '../../services/rbac.service';
import {
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Clock,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  Filter,
} from 'lucide-react';

interface QuickItemAvailabilityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  businessId?: string;
  menuItems: MenuItem[];
  onItemsUpdated?: (updatedItems: MenuItem[]) => void;
  onRefresh?: () => Promise<void> | void;
  userRole?: string;
}

export const QuickItemAvailabilityDrawer: React.FC<QuickItemAvailabilityDrawerProps> = ({
  isOpen,
  onClose,
  businessId,
  menuItems,
  onItemsUpdated,
  onRefresh,
  userRole,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [localItems, setLocalItems] = useState<MenuItem[]>(menuItems);
  const [expandedVariants, setExpandedVariants] = useState<Record<string, boolean>>({});
  const [isBulkResetting, setIsBulkResetting] = useState(false);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const canManage = userRole !== 'WAITER' && userRole !== 'waiter';

  useEffect(() => {
    setLocalItems(menuItems);
  }, [menuItems]);

  // Extract all categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    localItems.forEach((it) => {
      if (it.category && it.category.trim()) {
        set.add(it.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [localItems]);

  // Find all currently unavailable or out of stock items and individual variants
  const unavailableEntries = useMemo(() => {
    const list: Array<{
      item: MenuItem;
      variant?: MenuItemVariant;
      currentStatus: MenuStatus;
    }> = [];

    localItems.forEach((item) => {
      const isItemOff = !item.is_available || item.status === 'out_of_stock' || item.status === 'unavailable';
      if (isItemOff) {
        list.push({
          item,
          currentStatus: item.status || 'unavailable',
        });
      }

      // Also check variants individually if item itself isn't completely off
      if (Array.isArray(item.variants)) {
        item.variants.forEach((v) => {
          const isVOff = v.is_available === false || v.status === 'out_of_stock' || v.status === 'unavailable';
          if (isVOff && !isItemOff) {
            list.push({
              item,
              variant: v,
              currentStatus: v.status || 'unavailable',
            });
          }
        });
      }
    });

    return list;
  }, [localItems]);

  // Filtered items for search
  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return localItems.filter((item) => {
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;

      const nameMatch = item.name.toLowerCase().includes(q);
      const catMatch = item.category?.toLowerCase().includes(q);
      const variantMatch = Array.isArray(item.variants) && item.variants.some((v) => v.name.toLowerCase().includes(q));
      const codeMatch = item.erp_item_code?.toLowerCase().includes(q);

      return nameMatch || catMatch || variantMatch || codeMatch;
    });
  }, [localItems, searchTerm, selectedCategory]);

  // Toggle item or variant status
  const handleUpdateStatus = async (
    item: MenuItem,
    newStatus: MenuStatus,
    variantId?: string
  ) => {
    if (!canManage) return;

    const opKey = variantId ? `${item.id}_${variantId}` : item.id;
    setUpdatingKey(opKey);

    const isAvail = newStatus === 'available';

    // Optimistic update
    const nextItems = localItems.map((it) => {
      if (it.id !== item.id) return it;

      if (variantId && Array.isArray(it.variants)) {
        const nextVariants = it.variants.map((v) => {
          if (v.id === variantId) {
            return { ...v, status: newStatus, is_available: isAvail };
          }
          return v;
        });
        const allOff = nextVariants.every(
          (v) => v.is_available === false || v.status === 'out_of_stock' || v.status === 'unavailable'
        );
        return {
          ...it,
          variants: nextVariants,
          ...(allOff ? { is_available: false, status: 'unavailable' as MenuStatus } : (it.status !== 'available' && !allOff ? { is_available: true, status: 'available' as MenuStatus } : {})),
        };
      }

      return {
        ...it,
        status: newStatus,
        is_available: isAvail,
        // If parent item is made available or unavailable, also sync its variants
        variants: Array.isArray(it.variants)
          ? it.variants.map((v) => ({ ...v, status: newStatus, is_available: isAvail }))
          : it.variants,
      };
    });

    setLocalItems(nextItems);
    onItemsUpdated?.(nextItems);

    try {
      await rbacService.updateMenuItemStatusApi(item.id, newStatus, businessId, variantId);
    } catch (err: any) {
      console.error('Failed to update item availability:', err);
      // Revert on error
      setLocalItems(menuItems);
      onItemsUpdated?.(menuItems);
      alert(err.message || 'Failed to update item availability');
    } finally {
      setUpdatingKey(null);
    }
  };

  // Bulk make all available
  const handleBulkMakeAllAvailable = async () => {
    if (!canManage || isBulkResetting) return;

    setIsBulkResetting(true);

    // Optimistic update
    const nextItems = localItems.map((it) => ({
      ...it,
      status: 'available' as MenuStatus,
      is_available: true,
      variants: Array.isArray(it.variants)
        ? it.variants.map((v) => ({ ...v, status: 'available' as MenuStatus, is_available: true }))
        : it.variants,
    }));

    setLocalItems(nextItems);
    onItemsUpdated?.(nextItems);

    try {
      await rbacService.bulkMakeAllAvailableApi(businessId);
      onRefresh?.();
    } catch (err: any) {
      console.error('Failed to bulk reset items to available:', err);
      setLocalItems(menuItems);
      onItemsUpdated?.(menuItems);
      alert(err.message || 'Failed to make all items available');
    } finally {
      setIsBulkResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Slide-in Drawer Container */}
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col z-10 border-l border-zinc-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 bg-zinc-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-white">Item Availability</h3>
                {unavailableEntries.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                    {unavailableEntries.length} Off-Menu
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    All Available
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">
                Quick 86 / Out of Stock switch synced live with customer menu
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
            title="Close Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Section 1: Pinned Currently Unavailable / Bulk Reset */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${unavailableEntries.length > 0 ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
                <span className="text-xs font-black text-zinc-900 uppercase tracking-wider">
                  Off-Menu Items ({unavailableEntries.length})
                </span>
              </div>
              {unavailableEntries.length > 0 && canManage && (
                <button
                  type="button"
                  disabled={isBulkResetting}
                  onClick={handleBulkMakeAllAvailable}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                  title="Make all unavailable and out of stock items available at once"
                >
                  {isBulkResetting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Make All Available</span>
                </button>
              )}
            </div>

            {unavailableEntries.length === 0 ? (
              <div className="text-center py-4 px-3 bg-white rounded-xl border border-zinc-200/80">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                <p className="text-xs font-bold text-zinc-800">All items are currently available</p>
                <p className="text-[11px] text-zinc-400">
                  Customers can see and order every active menu item.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {unavailableEntries.map((entry, idx) => {
                  const key = entry.variant ? `${entry.item.id}_${entry.variant.id}` : entry.item.id;
                  const isUpdating = updatingKey === key;
                  const displayName = entry.variant
                    ? `${entry.item.name} (${entry.variant.name})`
                    : entry.item.name;

                  return (
                    <div
                      key={key}
                      className="bg-white rounded-xl border border-zinc-200 p-2.5 flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-zinc-900 truncate">
                          {displayName}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mt-0.5">
                          <span className="px-1.5 py-0.2 rounded-md bg-zinc-100 font-semibold text-zinc-700">
                            {entry.item.category}
                          </span>
                          <span>·</span>
                          <span
                            className={`font-semibold ${
                              entry.currentStatus === 'out_of_stock'
                                ? 'text-amber-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {entry.currentStatus === 'out_of_stock' ? 'Out of Stock' : 'Unavailable'}
                          </span>
                        </div>
                      </div>

                      {canManage && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(entry.item, 'available', entry.variant?.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
                        >
                          {isUpdating ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          )}
                          <span>Make Available</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Search & Filter Controls */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search dish by name, category, or sub-item..."
                className="w-full pl-9 pr-9 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs font-medium placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === 'ALL'
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                All ({localItems.length})
              </button>
              {categories.map((cat) => {
                const count = localItems.filter((i) => i.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Item List with 3-Way Toggles */}
          <div className="space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between px-1">
              <span>Menu Items ({filteredItems.length})</span>
              <span>Available · OOS · Unavailable</span>
            </div>

            {filteredItems.length === 0 ? (
              <div className="text-center py-10 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200 text-zinc-400 text-xs">
                No menu items match your search.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => {
                  const hasVariants = Boolean(Array.isArray(item.variants) && item.variants.length > 0);
                  const isExpanded = expandedVariants[item.id] ?? false;
                  const itemKey = item.id;
                  const isUpdating = updatingKey === itemKey;
                  const currentStatus = item.status || (item.is_available ? 'available' : 'unavailable');

                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-xl border transition-all p-3 space-y-2.5 ${
                        !item.is_available || currentStatus !== 'available'
                          ? 'border-amber-200 bg-amber-50/20'
                          : 'border-zinc-200'
                      }`}
                    >
                      {/* Main Item Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs text-zinc-900 truncate">
                              {item.name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded-md bg-zinc-100 text-[10px] font-semibold text-zinc-600">
                              {item.category}
                            </span>
                            {hasVariants && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedVariants((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }))
                                }
                                className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.2 rounded-md border border-amber-200/80 flex items-center gap-0.5 cursor-pointer"
                              >
                                <span>{item.variants!.length} Options</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">
                            {item.currency || 'Rs.'} {Number(item.price).toFixed(2)}
                          </div>
                        </div>

                        {/* 3-State Segmented Toggle for Item */}
                        <div className="inline-flex rounded-xl bg-zinc-100 p-0.5 border border-zinc-200 shrink-0 self-start sm:self-auto">
                          <button
                            type="button"
                            disabled={!canManage || isUpdating}
                            onClick={() => handleUpdateStatus(item, 'available')}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                              currentStatus === 'available'
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'text-zinc-600 hover:text-zinc-900'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                            <span>Available</span>
                          </button>

                          <button
                            type="button"
                            disabled={!canManage || isUpdating}
                            onClick={() => handleUpdateStatus(item, 'out_of_stock')}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                              currentStatus === 'out_of_stock'
                                ? 'bg-amber-500 text-white shadow-2xs'
                                : 'text-zinc-600 hover:text-zinc-900'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                            <span>Out of Stock</span>
                          </button>

                          <button
                            type="button"
                            disabled={!canManage || isUpdating}
                            onClick={() => handleUpdateStatus(item, 'unavailable')}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                              currentStatus === 'unavailable'
                                ? 'bg-zinc-700 text-white shadow-2xs'
                                : 'text-zinc-600 hover:text-zinc-900'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                            <span>Unavailable</span>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Variants Sub-list */}
                      {hasVariants && isExpanded && (
                        <div className="pt-2 pl-3 border-l-2 border-amber-300/60 space-y-2 mt-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                            Sub-items / Options (manage individual availability):
                          </div>
                          {item.variants!.map((v) => {
                            const vKey = `${item.id}_${v.id}`;
                            const isVUpdating = updatingKey === vKey;
                            const vStatus: MenuStatus =
                              v.status || (v.is_available !== false ? 'available' : 'unavailable');

                            return (
                              <div
                                key={v.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-zinc-50/80 border border-zinc-200/70"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-xs text-zinc-800">
                                    {v.name}
                                  </div>
                                  <div className="text-[10px] text-zinc-400">
                                    {item.currency || 'Rs.'} {Number(v.price).toFixed(2)}
                                  </div>
                                </div>

                                <div className="inline-flex rounded-lg bg-zinc-200/70 p-0.5 border border-zinc-300/60 shrink-0 self-start sm:self-auto">
                                  <button
                                    type="button"
                                    disabled={!canManage || isVUpdating}
                                    onClick={() => handleUpdateStatus(item, 'available', v.id)}
                                    className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                                      vStatus === 'available'
                                        ? 'bg-emerald-600 text-white shadow-2xs'
                                        : 'text-zinc-600 hover:text-zinc-900'
                                    }`}
                                  >
                                    Available
                                  </button>

                                  <button
                                    type="button"
                                    disabled={!canManage || isVUpdating}
                                    onClick={() => handleUpdateStatus(item, 'out_of_stock', v.id)}
                                    className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                                      vStatus === 'out_of_stock'
                                        ? 'bg-amber-500 text-white shadow-2xs'
                                        : 'text-zinc-600 hover:text-zinc-900'
                                    }`}
                                  >
                                    Out of Stock
                                  </button>

                                  <button
                                    type="button"
                                    disabled={!canManage || isVUpdating}
                                    onClick={() => handleUpdateStatus(item, 'unavailable', v.id)}
                                    className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                                      vStatus === 'unavailable'
                                        ? 'bg-zinc-700 text-white shadow-2xs'
                                        : 'text-zinc-600 hover:text-zinc-900'
                                    }`}
                                  >
                                    Unavailable
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between text-xs text-zinc-500 shrink-0">
          <span className="text-[11px]">
            {canManage
              ? 'Changes sync live via Socket.io across customer phones & stations.'
              : 'Read-only: Manager or Cashier access required to modify availability.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold transition cursor-pointer text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
