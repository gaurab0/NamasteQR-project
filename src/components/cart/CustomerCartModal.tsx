import React, { useState, useEffect } from 'react';
import { CartItem, TableOrder } from '../../types/rbac';
import { determineItemStation, getAllItemCategories } from '../../utils/menuUtils';
import { 
  ShoppingBag, 
  X, 
  Plus, 
  Minus, 
  Trash2, 
  MessageSquare, 
  UtensilsCrossed, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Building2, 
  Layers, 
  ChefHat, 
  ArrowRight,
  Sparkles,
  Phone,
  User,
  AlertTriangle,
  QrCode,
  Lock,
  CreditCard
} from 'lucide-react';
import { Button } from '../ui/Button';

interface CustomerCartModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  tableInfo: {
    tableId?: string;
    tableNumber?: string;
    floor?: string | null;
    building?: string | null;
    businessId?: string;
    businessName?: string;
    existingOrderId?: string;
    sessionId?: string | null;
    isSessionExpired?: boolean;
    sessionExpiredReason?: string | null;
    isHost?: boolean;
    hostToken?: string | null;
    creditOnly?: boolean;
    creditCustomerName?: string | null;
    creditCustomerPhone?: string | null;
    creditPin?: string | null;
    creditGlAccountId?: string | null;
    creditGlAccountNumber?: string | null;
    creditGlAccountName?: string | null;
  };
  isHost?: boolean;
  hostToken?: string | null;
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
  onUpdateSpecialInstructions: (itemId: string, note: string) => void;
  onClearCart: () => void;
  onOrderConfirmed: (order: TableOrder) => void;
  currencySymbol?: string;
}

export const CustomerCartModal: React.FC<CustomerCartModalProps> = ({
  isOpen,
  onClose,
  items,
  tableInfo,
  isHost: isHostProp,
  hostToken: hostTokenProp,
  onUpdateQuantity,
  onUpdateSpecialInstructions,
  onClearCart,
  onOrderConfirmed,
  currencySymbol = 'Rs.',
}) => {
  const [generalNotes, setGeneralNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isCreditLocked = Boolean(tableInfo.creditOnly || tableInfo.creditCustomerName);

  useEffect(() => {
    if (tableInfo.creditCustomerName) {
      setCustomerName(tableInfo.creditCustomerName);
    }
    if (tableInfo.creditCustomerPhone) {
      setCustomerPhone(tableInfo.creditCustomerPhone);
    }
  }, [tableInfo.creditCustomerName, tableInfo.creditCustomerPhone]);

  if (!isOpen) return null;

  const isHost = (tableInfo.isHost ?? isHostProp) !== false;
  const totalItemsCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => {
      const price = item.selected_variant ? Number(item.selected_variant.price) : Number(item.menuItem.price);
      return sum + price * item.quantity;
    },
    0
  );
  const totalAmount = subtotal;

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    if (!isHost) {
      setErrorMsg('Ordering authority reserved: Only the Table Host who first scanned the table QR code can submit orders.');
      return;
    }

    if (tableInfo.isSessionExpired) {
      setErrorMsg(tableInfo.sessionExpiredReason || 'The dining session for this table has ended. Please scan the QR code on your table to place a new order.');
      return;
    }

    if (!tableInfo.tableNumber) {
      setErrorMsg('Dine-in table not detected. Please scan the QR code on your restaurant table to place orders directly to the kitchen.');
      return;
    }

    const oos = items.filter((ci) => {
      const m = ci.menuItem;
      const hasVariants = Boolean(Array.isArray(m.variants) && m.variants.length > 0);
      const areAllVariantsUnavailable = hasVariants && m.variants!.every(
        (v) => v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable'
      );
      if (m.status === 'out_of_stock' || m.status === 'unavailable' || m.is_available === false || areAllVariantsUnavailable) return true;
      const v = ci.selected_variant;
      if (v && (v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable')) return true;
      return false;
    });
    if (oos.length > 0) {
      const names = oos.map((ci) => ci.selected_variant ? `${ci.menuItem.name} (${ci.selected_variant.name})` : ci.menuItem.name).join(', ');
      setErrorMsg(`Item(s) currently out of stock: ${names}. Please remove them to proceed.`);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const orderPayload = {
        business_id: tableInfo.businessId || 'default-biz',
        table_id: tableInfo.tableId || 'walk-in',
        table_number: tableInfo.tableNumber || 'Takeout / Direct',
        floor: tableInfo.floor || null,
        building: tableInfo.building || null,
        existing_order_id: tableInfo.existingOrderId,
        session_id: tableInfo.sessionId || undefined,
        host_token: tableInfo.hostToken || hostTokenProp,
        credit_only: tableInfo.creditOnly || false,
        credit_gl_account_id: tableInfo.creditGlAccountId || undefined,
        credit_gl_account_number: tableInfo.creditGlAccountNumber || undefined,
        credit_gl_account_name: tableInfo.creditGlAccountName || undefined,
        items: items.map((ci) => {
          const itemCategories = getAllItemCategories(ci.menuItem);
          const station = determineItemStation(ci.menuItem);
          const finalPrice = ci.selected_variant ? Number(ci.selected_variant.price) : Number(ci.menuItem.price);
          const variantName = ci.selected_variant?.name;
          return {
            item_id: ci.menuItem.id,
            name: ci.menuItem.name,
            price: finalPrice,
            currency: ci.menuItem.currency || currencySymbol,
            quantity: ci.quantity,
            special_instructions: ci.special_instructions || '',
            variant_id: ci.selected_variant?.id,
            variant_name: variantName,
            food_type: ci.menuItem.food_type,
            category: ci.menuItem.category,
            additional_categories: itemCategories,
            station,
            ordered_at: new Date().toISOString(),
          };
        }),
        subtotal,
        total_amount: totalAmount,
        currency: currencySymbol,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        general_notes: generalNotes.trim() || undefined,
      };

      const res = await fetch('/api/rbac/table-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errorMsg = data.error?.message || (typeof data.error === 'string' ? data.error : 'Failed to place table order');
        throw new Error(errorMsg);
      }

      onOrderConfirmed(data.data);
      onClearCart();
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong while confirming your order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-zinc-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div 
        id="customer-cart-drawer" 
        className="w-full max-w-lg bg-white h-full sm:h-auto sm:max-h-[92vh] sm:rounded-3xl shadow-2xl border border-zinc-200 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Drawer Header */}
        <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-zinc-900 text-white flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-bold shadow-xs">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white leading-tight">Your Order Cart</h3>
                <span className="text-[11px] bg-zinc-800 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-zinc-700">
                  {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-medium leading-tight">
                <span>{tableInfo.businessName && tableInfo.businessName !== 'Restaurant Table Service' ? tableInfo.businessName : 'Restaurant Service'}</span>
                {tableInfo.tableNumber && (
                  <>
                    <span>•</span>
                    <span className="text-amber-400 font-bold">
                      {tableInfo.tableNumber.toString().trim().toLowerCase().startsWith('table')
                        ? tableInfo.tableNumber
                        : `Table #${tableInfo.tableNumber}`}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            id="close-cart-btn"
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table Reference Banner if available */}
        {tableInfo.tableNumber && (
          <div className="px-4 py-1.5 sm:px-5 sm:py-1.5 bg-amber-50 border-b border-amber-200/80 flex items-center justify-between text-xs text-amber-900 font-semibold">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Ordering for Table #{tableInfo.tableNumber}</span>
              {(tableInfo.floor || tableInfo.building) && (
                <span className="text-amber-700 font-normal">
                  ({[tableInfo.floor, tableInfo.building].filter(Boolean).join(', ')})
                </span>
              )}
            </div>
            <span className="text-[11px] text-amber-800 font-bold bg-amber-200/70 px-2 py-0.5 rounded-md">
              Dine-In
            </span>
          </div>
        )}

        {/* Scrollable Cart Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5">
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {items.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                <ShoppingBag className="w-8 h-8 stroke-[1.5]" />
              </div>
              <h4 className="text-base font-bold text-zinc-900">Your cart is empty</h4>
              <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                Browse our delicious menu items and add dishes to your table order.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="mt-2"
              >
                Browse Menu
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-500 font-medium pb-1 border-b border-zinc-100">
                <span>Selected Items</span>
                <button
                  type="button"
                  onClick={onClearCart}
                  className="text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                >
                  Clear All
                </button>
              </div>

              {/* Items List */}
              <div className="divide-y divide-zinc-100">
                {items.map((cartItem) => {
                  const item = cartItem.menuItem;
                  const isVeg = item.food_type === 'veg';
                  const unitPrice = cartItem.selected_variant ? Number(cartItem.selected_variant.price) : Number(item.price);
                  const itemTotal = unitPrice * cartItem.quantity;
                  const itemKey = cartItem.selected_variant ? `${item.id}_${cartItem.selected_variant.id}` : item.id;
                  const hasVariants = Boolean(Array.isArray(item.variants) && item.variants.length > 0);
                  const areAllVariantsUnavailable = hasVariants && item.variants!.every(
                    (v) => v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable'
                  );
                  const isItemOutOfStock = item.status === 'out_of_stock' || item.status === 'unavailable' || item.is_available === false || areAllVariantsUnavailable;
                  const isVariantUnavailable = isItemOutOfStock || cartItem.selected_variant?.is_available === false || (cartItem.selected_variant as any)?.status === 'out_of_stock' || (cartItem.selected_variant as any)?.status === 'unavailable';

                  return (
                    <div 
                      key={itemKey} 
                      id={`cart-item-${itemKey}`}
                      className="py-2 first:pt-0 last:pb-0 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          {/* Food Type Dot */}
                          <div
                            className={`w-3.5 h-3.5 rounded-xs flex items-center justify-center border bg-white shadow-2xs mt-0.5 shrink-0 ${
                              isVeg ? 'border-emerald-600' : 'border-rose-600'
                            }`}
                          >
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                              }`}
                            />
                          </div>

                          <div className="min-w-0">
                            <h5 className="text-xs sm:text-sm font-bold text-zinc-900 truncate flex items-center gap-1.5 flex-wrap leading-tight">
                              <span className={isVariantUnavailable ? 'line-through text-zinc-400' : ''}>{item.name}</span>
                              {cartItem.selected_variant && (
                                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${isVariantUnavailable ? 'bg-zinc-100 text-zinc-400 line-through' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
                                  {cartItem.selected_variant.name}
                                </span>
                              )}
                              {isVariantUnavailable && (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                  Out of Stock
                                </span>
                              )}
                            </h5>
                            <span className="text-[11px] text-zinc-500 font-medium leading-tight block notranslate">
                              {currencySymbol} {unitPrice.toLocaleString()} each
                            </span>
                          </div>
                        </div>

                        {/* Quantity Counter Buttons & Remove Action */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isVariantUnavailable && (
                            <button
                              id={`cart-remove-oos-${itemKey}`}
                              type="button"
                              onClick={() => onUpdateQuantity(itemKey, 0)}
                              className="p-1 rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                              title="Remove out of stock item from order"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <div className="flex items-center bg-zinc-100 rounded-lg p-0.5 border border-zinc-200/80">
                            <button
                              id={`cart-minus-${itemKey}`}
                              type="button"
                              onClick={() => onUpdateQuantity(itemKey, cartItem.quantity - 1)}
                              className="w-6 h-6 flex items-center justify-center rounded-md bg-white text-zinc-700 hover:bg-zinc-200 transition shadow-2xs cursor-pointer"
                              title="Decrease quantity"
                            >
                              <Minus className="w-3 h-3" />
                            </button>

                            <span className="w-6 text-center text-xs font-bold text-zinc-900 notranslate">
                              {cartItem.quantity}
                            </span>

                            <button
                              id={`cart-plus-${itemKey}`}
                              type="button"
                              disabled={isVariantUnavailable}
                              onClick={() => !isVariantUnavailable && onUpdateQuantity(itemKey, cartItem.quantity + 1)}
                              className={`w-6 h-6 flex items-center justify-center rounded-md transition shadow-2xs ${
                                isVariantUnavailable
                                  ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                                  : 'bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer'
                              }`}
                              title={isVariantUnavailable ? 'Item is out of stock' : 'Increase quantity'}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <span className="text-xs sm:text-sm font-bold text-zinc-900 font-mono w-18 text-right notranslate">
                            {currencySymbol} {itemTotal.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Special Note for Item */}
                      <div className="flex items-center gap-1.5 pl-5.5">
                        <MessageSquare className="w-3 h-3 text-zinc-400 shrink-0" />
                        <input
                          type="text"
                          placeholder="Special request (e.g., less spicy, extra dip)..."
                          value={cartItem.special_instructions || ''}
                          onChange={(e) => onUpdateSpecialInstructions(itemKey, e.target.value)}
                          className="w-full text-[11px] px-2 py-0.5 bg-zinc-50 border border-zinc-200 rounded-md text-zinc-700 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* General Order Notes & Guest Details */}
              <div className="pt-2.5 border-t border-zinc-200 space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-800 mb-0.5">
                    Additional Instructions for the Kitchen
                  </label>
                  <textarea
                    id="order-general-notes"
                    rows={1}
                    placeholder="e.g. Serve appetizers first, bring extra napkins & warm water..."
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg bg-zinc-50 text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500 resize-none font-medium"
                  />
                </div>

                {isCreditLocked && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-[11px] font-semibold">
                    <Lock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Registered Credit Account (Locked for table security)</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-0.5 flex items-center justify-between">
                      <span>{isCreditLocked ? 'Registered Customer' : 'Guest Name (Optional)'}</span>
                      {isCreditLocked && <Lock className="w-3 h-3 text-purple-600" />}
                    </label>
                    <div className="relative">
                      <User className={`absolute left-2.5 top-2 w-3.5 h-3.5 ${isCreditLocked ? 'text-purple-500' : 'text-zinc-400'}`} />
                      <input
                        id="order-guest-name"
                        type="text"
                        readOnly={isCreditLocked}
                        disabled={isCreditLocked}
                        placeholder="e.g. Sarah"
                        value={customerName}
                        onChange={(e) => !isCreditLocked && setCustomerName(e.target.value)}
                        className={`w-full pl-8 pr-2.5 py-1 text-xs border rounded-lg ${
                          isCreditLocked
                            ? 'bg-purple-50/60 border-purple-200 text-purple-950 font-bold cursor-not-allowed select-none'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-0.5 flex items-center justify-between">
                      <span>{isCreditLocked ? 'Registered Phone' : 'Phone Number (Optional)'}</span>
                      {isCreditLocked && <Lock className="w-3 h-3 text-purple-600" />}
                    </label>
                    <div className="relative">
                      <Phone className={`absolute left-2.5 top-2 w-3.5 h-3.5 ${isCreditLocked ? 'text-purple-500' : 'text-zinc-400'}`} />
                      <input
                        id="order-guest-phone"
                        type="tel"
                        readOnly={isCreditLocked}
                        disabled={isCreditLocked}
                        placeholder="+977 98XXXXXXXX"
                        value={customerPhone}
                        onChange={(e) => !isCreditLocked && setCustomerPhone(e.target.value)}
                        className={`w-full pl-8 pr-2.5 py-1 text-xs border rounded-lg ${
                          isCreditLocked
                            ? 'bg-purple-50/60 border-purple-200 text-purple-950 font-bold cursor-not-allowed select-none'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Price Breakdown and Confirm Button */}
        {items.length > 0 && (
          <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-zinc-50 border-t border-zinc-200 space-y-2">
            <div className="flex items-center justify-between text-sm font-extrabold text-zinc-900">
              <span>Subtotal Amount</span>
              <span className="text-amber-700 font-mono text-base notranslate">
                {currencySymbol} {subtotal.toLocaleString()}
              </span>
            </div>

            {/* View-Only Guest Notice */}
            {!tableInfo.isSessionExpired && tableInfo.tableNumber && !isHost && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold block">View-Only Mode</span>
                  <span className="text-[11px] text-amber-800">
                    You scanned as a guest. Ordering authority belongs to the table host who scanned first.
                  </span>
                </div>
              </div>
            )}

            {/* Session Expired Notice */}
            {tableInfo.isSessionExpired && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold block">Table Session Concluded</span>
                  <span className="text-[11px] text-amber-800">
                    {tableInfo.sessionExpiredReason || 'The dining session for this table has ended. Please scan the QR code on your table to start a new order.'}
                  </span>
                </div>
              </div>
            )}

            {/* No Table QR Scanned Notice (Browsing Mode) */}
            {!tableInfo.isSessionExpired && !tableInfo.tableNumber && (
              <div className="p-3 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-700 text-xs flex items-start gap-2.5">
                <QrCode className="w-4 h-4 shrink-0 text-zinc-500 mt-0.5" />
                <div>
                  <span className="font-bold block">Table QR Scan Required</span>
                  <span className="text-[11px] text-zinc-500">
                    You are currently in menu browsing mode. To send orders to the kitchen, please scan the QR code placed at your dining table.
                  </span>
                </div>
              </div>
            )}

            <button
              id="btn-confirm-table-order"
              type="button"
              onClick={handleConfirmOrder}
              disabled={loading || items.length === 0 || Boolean(tableInfo.isSessionExpired) || !tableInfo.tableNumber || !isHost}
              className="w-full py-3.5 px-4 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white font-extrabold shadow-md rounded-xl flex items-center justify-center gap-2.5 transition-all duration-150 cursor-pointer select-none active:scale-[0.99]"
            >
              {loading ? (
                <span className="text-sm sm:text-base font-bold">{tableInfo.existingOrderId ? 'Updating Bill & Sending to Kitchen...' : 'Placing Your Order...'}</span>
              ) : !isHost ? (
                <span className="text-sm sm:text-base font-bold">View-Only Mode • Host Can Order</span>
              ) : tableInfo.isSessionExpired ? (
                <span className="text-sm sm:text-base font-bold">Session Ended • Scan Table QR</span>
              ) : !tableInfo.tableNumber ? (
                <span className="text-sm sm:text-base font-bold">Scan Table QR to Order</span>
              ) : (
                <div className="flex items-center justify-center gap-2.5 w-full">
                  <ChefHat className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-white" />
                  <span className="text-sm sm:text-base font-black tracking-tight text-white whitespace-nowrap">
                    Check your order & confirm
                  </span>
                </div>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
