import React, { useState, useEffect, useMemo } from 'react';
import { MenuItem, MenuItemVariant, CartItem } from '../../types/rbac';
import { X, Clock, Plus, Minus, Lock, ChefHat, Layers, ShoppingBag } from 'lucide-react';

interface MenuItemDetailModalProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  showImages?: boolean;
  isHost?: boolean;
  isReadOnly?: boolean;
  cartItems?: CartItem[];
  currentCartQuantity?: number;
  initialVariant?: MenuItemVariant;
  onAddToCart?: (item: MenuItem, quantity: number, instructions?: string, selectedVariant?: MenuItemVariant) => void;
  onUpdateCartItem?: (item: MenuItem, quantity: number, instructions?: string, selectedVariant?: MenuItemVariant) => void;
}

export const MenuItemDetailModal: React.FC<MenuItemDetailModalProps> = ({
  item,
  isOpen,
  onClose,
  showImages = true,
  isHost = true,
  isReadOnly = false,
  cartItems,
  currentCartQuantity = 0,
  initialVariant,
  onAddToCart,
  onUpdateCartItem,
}) => {
  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState<string>('');

  useEffect(() => {
    if (isOpen && item) {
      if (initialVariant) {
        setSelectedVariant(initialVariant);
      } else if (Array.isArray(item.variants) && item.variants.length > 0) {
        const firstAvailable = item.variants.find(
          (v) => v.is_available !== false && (v as any).status !== 'out_of_stock' && (v as any).status !== 'unavailable'
        );
        setSelectedVariant(firstAvailable || item.variants[0]);
      } else {
        setSelectedVariant(null);
      }
    }
  }, [isOpen, item, initialVariant]);

  // Find matching cart item for this item and selected variant
  const matchingCartItem = useMemo(() => {
    if (!item || !cartItems) return undefined;
    return cartItems.find((ci) => {
      if (ci.menuItem.id !== item.id) return false;
      if (selectedVariant) {
        return ci.selected_variant?.id === selectedVariant.id;
      }
      return !ci.selected_variant;
    });
  }, [item, cartItems, selectedVariant]);

  // Sync special instructions from existing cart item
  useEffect(() => {
    if (matchingCartItem && matchingCartItem.special_instructions !== undefined) {
      setSpecialInstructions(matchingCartItem.special_instructions);
    } else {
      setSpecialInstructions('');
    }
  }, [matchingCartItem?.special_instructions, selectedVariant?.id, item?.id]);

  if (!isOpen || !item) return null;

  const currentVariantCartQty = matchingCartItem
    ? matchingCartItem.quantity
    : (cartItems ? 0 : (currentCartQuantity || 0));

  const hasVariants = Boolean(Array.isArray(item.variants) && item.variants.length > 0);
  const areAllVariantsOutOfStock = Boolean(
    hasVariants &&
    item.variants!.every((v) => v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable')
  );
  const isItemOutOfStock = item.status === 'out_of_stock' || item.status === 'unavailable' || item.is_available === false || areAllVariantsOutOfStock;
  const isVariantOutOfStock = Boolean(
    selectedVariant && (
      selectedVariant.is_available === false ||
      (selectedVariant as any).status === 'out_of_stock' ||
      (selectedVariant as any).status === 'unavailable'
    )
  );
  const isEffectivelyOutOfStock = isItemOutOfStock || isVariantOutOfStock;

  const isVeg = item.food_type === 'veg';
  const hasDietary = item.food_type === 'veg' || item.food_type === 'non-veg';
  const currency = item.currency || 'Rs.';
  const activeUnitPrice = selectedVariant ? Number(selectedVariant.price) : Number(item.price);
  const displayImage = selectedVariant?.image_url?.trim() ? selectedVariant.image_url : item.image_url;
  const displayDescription = selectedVariant?.description?.trim() ? selectedVariant.description : item.description;

  const handleIncrease = () => {
    if (!isHost || isReadOnly || isEffectivelyOutOfStock) return;
    const newQty = currentVariantCartQty + 1;
    const updater = onUpdateCartItem || onAddToCart;
    if (updater && item) {
      updater(item, newQty, specialInstructions.trim(), selectedVariant || undefined);
    }
  };

  const handleDecrease = () => {
    if (!isHost || isReadOnly) return;
    if (currentVariantCartQty <= 0) return;
    const newQty = currentVariantCartQty - 1;
    const updater = onUpdateCartItem || onAddToCart;
    if (updater && item) {
      updater(item, newQty, specialInstructions.trim(), selectedVariant || undefined);
    }
  };

  const handleInstructionsChange = (newVal: string) => {
    setSpecialInstructions(newVal);
    if (currentVariantCartQty > 0 && item) {
      const updater = onUpdateCartItem || onAddToCart;
      if (updater) {
        updater(item, currentVariantCartQty, newVal.trim(), selectedVariant || undefined);
      }
    }
  };

  return (
    <div
      id="menu-item-modal-backdrop"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="menu-item-modal-container"
        className="relative w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-slideUp sm:animate-scaleUp"
      >
        {/* Modal Header & Close Button */}
        <button
          id="close-menu-item-modal-btn"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors backdrop-blur-md cursor-pointer"
          title="Close details"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Dish Banner Image (Only shown if showImages is enabled AND image_url exists) */}
        {showImages && displayImage ? (
          <div className="relative w-full h-56 sm:h-64 bg-stone-100 overflow-hidden shrink-0">
            <img
              src={displayImage}
              alt={item.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
            
            <div className="absolute bottom-3 left-4 flex items-center gap-2">
              {hasDietary && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-md shadow-sm ${
                  isVeg ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
                }`}>
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  {isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                </span>
              )}
              {item.category && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/80 text-stone-800 backdrop-blur-md">
                  {item.category}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasDietary && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  isVeg ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-800 border border-red-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />
                  {isVeg ? 'Pure Veg' : 'Non-Veg'}
                </span>
              )}
              {item.category && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-stone-200 text-stone-700">
                  {item.category}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="modal-item-title" className="text-xl sm:text-2xl font-bold text-stone-900 leading-tight">
                {item.name}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {item.preparation_time_mins && (
                  <div className="flex items-center gap-1.5 text-xs text-stone-500">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Prep time: approx. {item.preparation_time_mins} minutes</span>
                  </div>
                )}
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors ${
                  currentVariantCartQty > 0
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-stone-100 text-stone-600 border-stone-200'
                }`}>
                  <ShoppingBag className="w-3 h-3" />
                  <span>{currentVariantCartQty} in cart</span>
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span id="modal-item-price" className="text-2xl font-black text-amber-600 font-mono notranslate">
                {currency} {activeUnitPrice.toLocaleString()}
              </span>
              {selectedVariant && (
                <span className="block text-[11px] font-bold text-amber-800 font-sans">
                  [{selectedVariant.name}]
                </span>
              )}
              {isEffectivelyOutOfStock && (
                <span className="inline-block mt-1 text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                  {isItemOutOfStock && item.status === 'unavailable' ? 'Unavailable' : 'Out of Stock'}
                </span>
              )}
            </div>
          </div>

          {/* Portion / Size / Subcategory Selector */}
          {Array.isArray(item.variants) && item.variants.length > 0 && (
            <div className="space-y-2 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-600" />
                  <span>{item.variant_group_name ? `Choose ${item.variant_group_name}` : 'Choose Option / Subcategory'}</span>
                </label>
                <span className="text-[11px] text-amber-800 font-semibold bg-amber-200/60 px-2 py-0.5 rounded-md">
                  Required
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {item.variants.map((v) => {
                  const isVOutOfStock = isItemOutOfStock || v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable';
                  const isSelected = selectedVariant?.id === v.id;
                  const vCartQty = cartItems?.find(
                    (ci) => ci.menuItem.id === item.id && ci.selected_variant?.id === v.id
                  )?.quantity || 0;

                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariant(v)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? isVOutOfStock
                            ? 'bg-rose-50 text-rose-900 border-rose-300 ring-2 ring-rose-200 font-bold'
                            : 'bg-amber-500 text-zinc-950 border-amber-500 shadow-xs font-bold ring-2 ring-amber-400/40'
                          : isVOutOfStock
                            ? 'bg-zinc-50 border-zinc-200 text-zinc-400 opacity-75'
                            : 'bg-white border-zinc-200 text-zinc-800 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 truncate">
                          {(v.food_type === 'veg' || v.food_type === 'non-veg') && (
                            <div className={`w-2.5 h-2.5 rounded-xs flex flex-shrink-0 items-center justify-center border bg-white ${v.food_type === 'veg' ? 'border-emerald-600' : 'border-rose-600'}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${v.food_type === 'veg' ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                            </div>
                          )}
                          <div className={`text-xs font-bold truncate ${isVOutOfStock ? 'line-through text-zinc-400' : ''}`}>{v.name}</div>
                        </div>
                        {isVOutOfStock ? (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-100/80 px-1.5 py-0.5 rounded-full shrink-0">
                            Out of Stock
                          </span>
                        ) : vCartQty > 0 ? (
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                            isSelected ? 'bg-zinc-950 text-white' : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}>
                            {vCartQty} in cart
                          </span>
                        ) : null}
                      </div>
                      <div className={`text-xs font-mono font-black mt-0.5 notranslate ${
                        isVOutOfStock ? 'text-zinc-400 line-through' : isSelected ? 'text-zinc-950' : 'text-amber-700'
                      }`}>
                        {currency} {Number(v.price).toLocaleString()}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detailed Description */}
          <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-100">
            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <ChefHat className="w-3.5 h-3.5 text-amber-600" />
              Description & Preparation
            </h4>
            <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">
              {displayDescription ? displayDescription : 'Prepared fresh to order by our culinary kitchen using premium sourced spices and authentic culinary techniques.'}
            </p>
          </div>

          {/* Special Instructions (only relevant if Host and not ReadOnly) */}
          {isReadOnly ? (
            <div className="p-3 bg-zinc-100 border border-zinc-200 rounded-xl flex items-start gap-2.5 text-xs text-zinc-700">
              <Lock className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-zinc-900">Final Bill Requested — View Only Mode</p>
                <p className="text-zinc-600 mt-0.5">
                  Ordering has concluded for this table. You can explore dish ingredients and prices.
                </p>
              </div>
            </div>
          ) : isHost ? (
            <div>
              <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1.5">
                Special Requests or Dietary Notes (Optional)
              </label>
              <textarea
                id="modal-special-instructions-input"
                rows={2}
                value={specialInstructions}
                onChange={(e) => handleInstructionsChange(e.target.value)}
                placeholder="E.g., Extra spicy, less oil, separate sauce, allergies..."
                className="w-full text-sm rounded-xl border border-stone-200 bg-white p-2.5 text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all resize-none"
              />
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">View-Only Guest Mode</p>
                <p className="text-amber-800 mt-0.5">
                  The first person who scanned this table QR is the Table Host with ordering authority. You can explore all ingredients, prices, and dish details freely.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3 shrink-0">
          {isEffectivelyOutOfStock ? (
            <div className="w-full flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  {isItemOutOfStock 
                    ? (item.status === 'unavailable' ? 'Currently Unavailable' : 'Out of Stock') 
                    : 'Selected Option Out of Stock'}
                </span>
                <span className="text-xs text-stone-500 hidden sm:inline">This item cannot be ordered right now.</span>
              </div>
              <button
                id="modal-close-out-of-stock-btn"
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : !isReadOnly && isHost ? (
            <>
              {/* Quantity Stepper & in-cart indicator */}
              <div className="flex items-center gap-2.5 sm:gap-3">
                <span className="text-xs font-bold text-stone-600">Qty:</span>
                <div className="flex items-center border border-stone-300 rounded-xl bg-white overflow-hidden shadow-sm">
                  <button
                    id="modal-qty-decrease-btn"
                    type="button"
                    disabled={currentVariantCartQty <= 0}
                    onClick={handleDecrease}
                    className={`p-2 transition-colors ${
                      currentVariantCartQty <= 0
                        ? 'text-stone-300 cursor-not-allowed'
                        : 'text-stone-700 hover:bg-stone-100 cursor-pointer active:scale-95'
                    }`}
                    title="Decrease quantity in cart"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span id="modal-qty-display" className="px-3 text-sm font-black font-mono text-stone-900 min-w-[28px] text-center">
                    {currentVariantCartQty}
                  </span>
                  <button
                    id="modal-qty-increase-btn"
                    type="button"
                    onClick={handleIncrease}
                    className="p-2 text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer active:scale-95"
                    title="Increase quantity in cart"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                  currentVariantCartQty > 0
                    ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                    : 'bg-stone-100 text-stone-500 border-stone-200'
                }`}>
                  {currentVariantCartQty} in cart
                </span>
              </div>

              {/* Done / Close Button */}
              <button
                id="modal-done-btn"
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
              >
                Done
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-xs text-stone-500 font-medium">
                Dish: <strong className="text-stone-800">{item.name}</strong> {selectedVariant ? `[${selectedVariant.name}]` : ''} <span className="notranslate font-mono font-semibold">({currency} {activeUnitPrice})</span>
                {isReadOnly && <span className="ml-1.5 text-[10px] font-bold uppercase text-zinc-500">• View Only</span>}
              </span>
              <button
                id="modal-close-guest-btn"
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 text-sm font-semibold transition-colors cursor-pointer"
              >
                Back to Menu
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
