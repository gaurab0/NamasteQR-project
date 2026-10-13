import React from 'react';
import { MenuItem } from '../../types/rbac';
import { X, Clock, UtensilsCrossed, Sparkles } from 'lucide-react';

interface MenuItemPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
}

export const MenuItemPreviewModal: React.FC<MenuItemPreviewModalProps> = ({
  isOpen,
  onClose,
  item,
}) => {
  if (!isOpen || !item) return null;

  const isVeg = item.food_type === 'veg';
  const currencySymbol = item.currency || 'Rs.';

  return (
    <div
      id="menu-item-preview-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        id="menu-item-preview-modal-container"
        className="relative bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Customer View Preview</span>
          </div>
          <button
            id="btn-close-preview-modal"
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Card Content (Customer-Facing Presentation) */}
        <div>
          <div className="relative w-full h-64 bg-zinc-900/5 overflow-hidden flex items-center justify-center">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
                <UtensilsCrossed className="w-12 h-12 mb-1 opacity-40 stroke-[1.5]" />
                <span className="text-xs font-medium">Standard dish presentation</span>
              </div>
            )}

            {/* Badges */}
            <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-10 max-w-[70%]">
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center border bg-white shadow-xs shrink-0 ${
                  isVeg ? 'border-emerald-600' : 'border-rose-600'
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                  }`}
                />
              </div>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-900/80 backdrop-blur-xs text-white">
                {item.category || 'General'}
              </span>
              {Array.isArray(item.additional_categories) &&
                item.additional_categories.map((extra) => (
                  <span
                    key={extra}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/90 backdrop-blur-xs text-white shadow-2xs"
                  >
                    {extra}
                  </span>
                ))}
            </div>

            {item.preparation_time_mins && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-white/90 backdrop-blur-xs text-zinc-800 shadow-xs">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                <span>{item.preparation_time_mins} mins</span>
              </div>
            )}

            {item.status === 'out_of_stock' && (
              <div className="absolute inset-x-0 bottom-0 bg-amber-500 text-white text-xs font-bold text-center py-1.5 uppercase tracking-wider">
                Out of Stock
              </div>
            )}
            {item.status === 'unavailable' && (
              <div className="absolute inset-x-0 bottom-0 bg-zinc-800 text-white text-xs font-bold text-center py-1.5 uppercase tracking-wider">
                Currently Unavailable
              </div>
            )}
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-zinc-900 leading-snug">{item.name}</h3>
              <span className="text-lg font-extrabold text-zinc-900 font-mono shrink-0">
                {currencySymbol} {Number(item.price).toLocaleString()}
              </span>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              {item.description || 'Prepared fresh upon order with our finest select ingredients.'}
            </p>

            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
              <span>Dietary: {isVeg ? '🌱 Vegetarian' : '🍗 Non-Vegetarian'}</span>
              <span>
                Status: {item.status === 'available' ? '🟢 Available' : item.status === 'out_of_stock' ? '🟠 Out of Stock' : '⚪ Unavailable'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-zinc-50 border-t border-zinc-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-xl hover:bg-zinc-800 transition cursor-pointer"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
