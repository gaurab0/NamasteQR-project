import React, { useState } from 'react';
import { MenuItem, MenuStatus } from '../../types/rbac';
import { AvailabilityStatusBadge } from './AvailabilityStatusBadge';
import { Edit2, Trash2, Eye, UtensilsCrossed, Clock } from 'lucide-react';

interface MenuItemCardProps {
  item: MenuItem;
  canManage: boolean;
  isKitchenStaff: boolean;
  onEdit?: (item: MenuItem) => void;
  onDelete?: (item: MenuItem) => void;
  onPreview?: (item: MenuItem) => void;
  onStatusChange?: (item: MenuItem, newStatus: MenuStatus) => Promise<void>;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  canManage,
  isKitchenStaff,
  onEdit,
  onDelete,
  onPreview,
  onStatusChange,
}) => {
  const [imageError, setImageError] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const handleStatusUpdate = async (newStatus: MenuStatus) => {
    if (!onStatusChange) return;
    try {
      setStatusLoading(true);
      await onStatusChange(item, newStatus);
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setStatusLoading(false);
    }
  };

  const isVeg = item.food_type === 'veg';
  const hasDietary = item.food_type === 'veg' || item.food_type === 'non-veg';
  const currencySymbol = item.currency || 'Rs.';

  return (
    <div
      id={`menu-item-card-${item.id}`}
      className={`group relative bg-white border rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
        item.status === 'unavailable'
          ? 'border-zinc-200 opacity-80 bg-zinc-50/50'
          : item.status === 'out_of_stock'
          ? 'border-amber-200/80 bg-amber-50/10'
          : 'border-zinc-200 hover:border-zinc-300'
      }`}
    >
      <div>
        {/* Card Header & Image */}
        <div className="relative w-full h-48 bg-zinc-900/5 overflow-hidden flex items-center justify-center">
          {item.image_url && !imageError ? (
            <img
              src={item.image_url}
              alt={item.name}
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-100 text-zinc-400 p-4">
              <UtensilsCrossed className="w-10 h-10 mb-1 opacity-50 stroke-[1.5]" />
              <span className="text-[11px] font-medium tracking-wide">No image uploaded</span>
            </div>
          )}

          {/* Top badges (Veg/Non-veg & Category) */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5 z-10 max-w-[70%]">
            {/* Veg / Non-Veg Indicator */}
            {hasDietary && (
              <div
                id={`veg-indicator-${item.id}`}
                className={`w-5 h-5 rounded-md flex items-center justify-center border bg-white shadow-xs shrink-0 ${
                  isVeg ? 'border-emerald-600' : 'border-rose-600'
                }`}
                title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                  }`}
                />
              </div>
            )}

            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-900/80 backdrop-blur-xs text-white tracking-wide">
              {item.category || 'General'}
            </span>

            {Array.isArray(item.additional_categories) &&
              item.additional_categories.map((extra) => (
                <span
                  key={extra}
                  className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/90 backdrop-blur-xs text-white tracking-wide shadow-2xs"
                >
                  {extra}
                </span>
              ))}
          </div>

          {/* Preparation Time badge */}
          {item.preparation_time_mins && (
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/90 backdrop-blur-xs text-zinc-700 shadow-xs">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span>{item.preparation_time_mins}m</span>
            </div>
          )}

          {/* Out of Stock banner overlay if out of stock */}
          {item.status === 'out_of_stock' && (
            <div className="absolute inset-x-0 bottom-0 bg-amber-500/90 text-white text-[11px] font-bold text-center py-1 tracking-wider uppercase backdrop-blur-xs">
              Out of Stock
            </div>
          )}

          {item.status === 'unavailable' && (
            <div className="absolute inset-x-0 bottom-0 bg-zinc-800/80 text-white text-[11px] font-bold text-center py-1 tracking-wider uppercase backdrop-blur-xs">
              Currently Unavailable
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <h3
              id={`menu-item-name-${item.id}`}
              className="text-sm font-bold text-zinc-900 leading-snug line-clamp-1 group-hover:text-indigo-600 transition-colors"
            >
              {item.name}
            </h3>
            <span
              id={`menu-item-price-${item.id}`}
              className="text-sm font-extrabold text-zinc-900 shrink-0 font-mono"
            >
              {currencySymbol} {Number(item.price).toLocaleString()}
            </span>
          </div>

          <p
            id={`menu-item-desc-${item.id}`}
            className="text-xs text-zinc-500 line-clamp-2 min-h-[32px] leading-relaxed"
          >
            {item.description || 'No description provided.'}
          </p>
        </div>
      </div>

      {/* Card Footer: Status & Actions */}
      <div className="p-4 pt-0">
        <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
          {/* Status selector or badge */}
          <div>
            <AvailabilityStatusBadge
              status={item.status}
              isAvailable={item.is_available}
              canEdit={isKitchenStaff || canManage}
              onStatusChange={handleStatusUpdate}
              loading={statusLoading}
            />
          </div>

          {/* Admin Actions */}
          {canManage && (
            <div className="flex items-center gap-1">
              {onPreview && (
                <button
                  id={`btn-preview-item-${item.id}`}
                  type="button"
                  onClick={() => onPreview(item)}
                  className="p-1.5 text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                  title="Preview Customer Card"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
              {onEdit && (
                <button
                  id={`btn-edit-item-${item.id}`}
                  type="button"
                  onClick={() => onEdit(item)}
                  className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                  title="Edit Item"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button
                  id={`btn-delete-item-${item.id}`}
                  type="button"
                  onClick={() => onDelete(item)}
                  className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="Delete Item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
