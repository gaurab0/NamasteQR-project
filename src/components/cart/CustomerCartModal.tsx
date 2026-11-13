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
  CreditCard,
  Package
} from 'lucide-react';
import { Button } from '../ui/Button';

interface CustomerCartModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  activeOrder?: TableOrder | null;
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
    compEnabled?: boolean;
    compOrdererName?: string | null;
    compOrdererPhone?: string | null;
  };
  isHost?: boolean;
  hostToken?: string | null;
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
  onUpdateSpecialInstructions: (itemId: string, note: string) => void;
  onUpdatePackaging?: (itemId: string, packQty: number) => void;
  packagingFee?: number;
  onClearCart: () => void;
  onOrderConfirmed: (order: TableOrder) => void;
  onRequestCompConfirmation?: (cartItems: CartItem[], generalNotes?: string) => void;
  currencySymbol?: string;
}

export const CustomerCartModal: React.FC<CustomerCartModalProps> = ({
  isOpen,
  onClose,
  items,
  activeOrder,
  tableInfo,
  isHost: isHostProp,
  hostToken: hostTokenProp,
  onUpdateQuantity,
  onUpdateSpecialInstructions,
  onUpdatePackaging,
  packagingFee = 10,
  onClearCart,
  onOrderConfirmed,
  onRequestCompConfirmation,
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
  const liveOrderItems = activeOrder?.items || [];
  const activeNonCancelledItems = liveOrderItems.filter((i) => i.status !== 'CANCELLED');
  const hasLiveOrder = Boolean(activeOrder && liveOrderItems.length > 0);
  const liveItemsCount = activeNonCancelledItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const draftItemsCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const totalItemsCount = isHost ? draftItemsCount : liveItemsCount;

  const draftSubtotal = items.reduce(
    (sum, item) => {
      const price = item.selected_variant ? Number(item.selected_variant.price) : Number(item.menuItem.price);
      return sum + price * item.quantity;
    },
    0
  );

  const liveSubtotal = Number(
    activeOrder?.subtotal ??
    activeNonCancelledItems.reduce((sum, i) => sum + Number(i.price) * (Number(i.quantity) || 1), 0)
  );

  const packagingFeeRate = Math.max(0, Number(packagingFee ?? 10) || 0);
  const draftPackagingQty = items.reduce((sum, ci) => {
    if (ci.menuItem.is_packageable === false) return sum;
    const pQty = Number(ci.pack_qty) || (ci.is_packaged ? ci.quantity : 0);
    return sum + Math.max(0, Math.min(ci.quantity, pQty));
  }, 0);
  const draftPackagingCharge = draftPackagingQty * packagingFeeRate;

  const livePackagingQty = Number(activeOrder?.packaging_qty || 0);
  const livePackagingCharge = Number(activeOrder?.packaging_charge || 0);
  const liveTotalAmount = Number(activeOrder?.total_amount) || (liveSubtotal + livePackagingCharge);

  const displayPackagingQty = isHost ? draftPackagingQty : livePackagingQty;
  const displayPackagingCharge = isHost ? draftPackagingCharge : livePackagingCharge;

  const displaySubtotal = (isHost ? draftSubtotal : (hasLiveOrder ? liveSubtotal : 0)) + displayPackagingCharge;
  const displayTax = (!isHost && hasLiveOrder) ? Number(activeOrder?.tax_amount || 0) : 0;
  const displayTotal = (!isHost && hasLiveOrder)
    ? Number(activeOrder?.total_amount || (displaySubtotal + displayTax))
    : (isHost ? displaySubtotal : 0);
  const subtotal = draftSubtotal + draftPackagingCharge;
  const totalAmount = subtotal;

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    if (tableInfo.compEnabled && onRequestCompConfirmation) {
      onRequestCompConfirmation(items, generalNotes.trim() || undefined);
      return;
    }

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
          const station = ci.selected_variant?.station || determineItemStation(ci.menuItem);
          const itemCode = ci.selected_variant?.erp_item_code || ci.menuItem.erp_item_code;
          const finalPrice = ci.selected_variant ? Number(ci.selected_variant.price) : Number(ci.menuItem.price);
          const variantName = ci.selected_variant?.name;
          const isPkg = ci.menuItem.is_packageable !== false;
          const pQty = isPkg ? Math.max(0, Math.min(ci.quantity, Number(ci.pack_qty) || (ci.is_packaged ? ci.quantity : 0))) : 0;
          return {
            item_id: ci.menuItem.id,
            name: ci.menuItem.name,
            price: finalPrice,
            currency: ci.menuItem.currency || currencySymbol,
            quantity: ci.quantity,
            special_instructions: ci.special_instructions || '',
            variant_id: ci.selected_variant?.id,
            variant_name: variantName,
            food_type: ci.selected_variant?.food_type || ci.menuItem.food_type,
            erp_item_code: itemCode,
            category: ci.menuItem.category,
            additional_categories: itemCategories,
            station,
            is_packageable: isPkg,
            is_packaged: pQty > 0,
            pack_qty: pQty,
            packaging_charge: pQty * packagingFeeRate,
            ordered_at: new Date().toISOString(),
          };
        }),
        packaging_charge: draftPackagingCharge,
        packaging_qty: draftPackagingQty,
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
                <h3 className="font-extrabold text-base text-white leading-tight">
                  {!isHost ? (hasLiveOrder ? 'Table Live Order Cart' : 'Table Cart') : 'Your Order Cart'}
                </h3>
                <span className="text-[11px] bg-zinc-800 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-zinc-700">
                  {hasLiveOrder && draftItemsCount === 0
                  ? `${liveItemsCount} in kitchen`
                  : hasLiveOrder && draftItemsCount > 0
                  ? `${draftItemsCount} new (+${liveItemsCount} in kitchen)`
                  : `${draftItemsCount} ${draftItemsCount === 1 ? 'item' : 'items'}`}
                </span>
                {!isHost && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/40 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    <span>View-Only</span>
                  </span>
                )}
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
              <span>
                {!isHost ? `Viewing Table #${tableInfo.tableNumber}` : `Ordering for Table #${tableInfo.tableNumber}`}
              </span>
              {(tableInfo.floor || tableInfo.building) && (
                <span className="text-amber-700 font-normal">
                  ({[tableInfo.floor, tableInfo.building].filter(Boolean).join(', ')})
                </span>
              )}
            </div>
            <span className="text-[11px] text-amber-800 font-bold bg-amber-200/70 px-2 py-0.5 rounded-md">
              {!isHost ? 'Guest (View-Only)' : 'Dine-In'}
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

          {!isHost ? (
            /* ================= VIEW-ONLY GUEST MODE ================= */
            hasLiveOrder ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-600 font-semibold pb-1 border-b border-zinc-100">
                  <span className="flex items-center gap-1.5 text-amber-800 font-bold">
                    <UtensilsCrossed className="w-3.5 h-3.5 text-amber-600" />
                    <span>Active Table Order ({liveItemsCount} {liveItemsCount === 1 ? 'dish' : 'dishes'})</span>
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    Live Sync • View Only
                  </span>
                </div>

                {/* Live Order Items List */}
                <div className="divide-y divide-zinc-100">
                  {liveOrderItems.map((item, idx) => {
                    const isVeg = item.food_type === 'veg';
                    const unitPrice = Number(item.price);
                    const itemQty = Number(item.quantity) || 1;
                    const itemTotal = unitPrice * itemQty;
                    const isCancelled = item.status === 'CANCELLED';
                    const isServed = item.status === 'SERVED' || item.status === 'COMPLETED' || Boolean(item.served_at);
                    const isReady = item.status === 'READY' || Boolean(item.ready_at);
                    const isPreparing = item.status === 'PREPARING' || (item.status as any) === 'COOKING';

                    return (
                      <div
                        key={`live-item-${item.item_id || idx}-${item.variant_id || 'base'}`}
                        id={`live-cart-item-${item.item_id || idx}`}
                        className="py-2.5 first:pt-0 last:pb-0 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            {/* Veg / Non-Veg Indicator */}
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

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                                <span className={`text-xs sm:text-sm font-bold text-zinc-900 ${isCancelled ? 'line-through text-zinc-400' : ''}`}>
                                  {item.name}
                                </span>
                                {item.variant_name && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    {item.variant_name}
                                  </span>
                                )}
                                {isCancelled ? (
                                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                    Cancelled
                                  </span>
                                ) : isServed ? (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Served
                                  </span>
                                ) : isReady ? (
                                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                                    Ready
                                  </span>
                                ) : isPreparing ? (
                                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" /> Preparing
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                    In Kitchen
                                  </span>
                                )}
                              </div>

                              <span className="text-[11px] text-zinc-500 font-medium leading-tight block mt-0.5 notranslate">
                                {currencySymbol} {unitPrice.toLocaleString()} each
                              </span>
                            </div>
                          </div>

                          {/* Read-Only Quantity Badge & Total Price */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2.5 py-1 bg-zinc-100 text-zinc-800 rounded-lg text-xs font-bold font-mono border border-zinc-200 select-none">
                              Qty: {itemQty}
                            </span>
                            <span className={`text-xs sm:text-sm font-bold font-mono w-20 text-right notranslate ${isCancelled ? 'line-through text-zinc-400' : 'text-zinc-900'}`}>
                              {currencySymbol} {itemTotal.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Special Instructions (Read-only) */}
                        {item.special_instructions && (
                          <div className="flex items-center gap-1.5 pl-5.5 text-[11px] text-zinc-600 italic">
                            <MessageSquare className="w-3 h-3 text-zinc-400 shrink-0" />
                            <span>Note: "{item.special_instructions}"</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Read-only Kitchen Instructions & Host Details */}
                {activeOrder?.order_notes && (
                  <div className="pt-2 border-t border-zinc-200">
                    <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase block mb-0.5">Kitchen Instructions</span>
                      "{activeOrder.order_notes}"
                    </div>
                  </div>
                )}

                {activeOrder?.customer_name && (
                  <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 pt-1">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Table Host: <strong className="text-zinc-700">{activeOrder.customer_name}</strong></span>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                  <ShoppingBag className="w-8 h-8 stroke-[1.5]" />
                </div>
                <h4 className="text-base font-bold text-zinc-900">Table cart is currently empty</h4>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  No orders have been placed for Table #{tableInfo.tableNumber || ''} yet. Dishes ordered by the Table Host will appear here in real time.
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
            )
          ) : (
            /* ================= HOST MODE ================= */
            items.length === 0 && !hasLiveOrder ? (
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
              <div className="space-y-4">
                {items.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-zinc-500 font-medium pb-1 border-b border-zinc-100">
                      <span className="font-bold text-zinc-700">New Items to Order</span>
                      <button
                        type="button"
                        onClick={onClearCart}
                        className="text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>

                    {/* Draft Items List */}
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

                            {item.is_packageable !== false && (
                              <div className="pl-5.5 pt-0.5">
                                {cartItem.quantity === 1 ? (
                                  <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(cartItem.is_packaged || (Number(cartItem.pack_qty) || 0) > 0)}
                                      onChange={(e) => onUpdatePackaging?.(itemKey, e.target.checked ? 1 : 0)}
                                      className="w-3.5 h-3.5 rounded text-amber-600 border-zinc-300 focus:ring-amber-500 cursor-pointer"
                                    />
                                    <span className="flex items-center gap-1">
                                      <Package className="w-3 h-3 text-amber-600" />
                                      <span>Pack this dish for takeaway (+{currencySymbol}{packagingFeeRate})</span>
                                    </span>
                                  </label>
                                ) : (
                                  <div className="flex items-center justify-between text-[11px] bg-amber-50/60 px-2 py-1 rounded-lg border border-amber-200/60">
                                    <div className="flex items-center gap-1.5 text-zinc-700 font-medium">
                                      <Package className="w-3 h-3 text-amber-600 shrink-0" />
                                      <span>Takeaway Packing (+{currencySymbol}{packagingFeeRate}/dish):</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-zinc-500 font-medium mr-1">Pack:</span>
                                      <div className="inline-flex items-center border border-zinc-200 rounded-md bg-white shadow-2xs overflow-hidden">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const cur = Math.max(0, Math.min(cartItem.quantity, Number(cartItem.pack_qty) || (cartItem.is_packaged ? cartItem.quantity : 0)));
                                            onUpdatePackaging?.(itemKey, Math.max(0, cur - 1));
                                          }}
                                          disabled={(Number(cartItem.pack_qty) || (cartItem.is_packaged ? cartItem.quantity : 0)) <= 0}
                                          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-30 cursor-pointer"
                                        >
                                          <Minus className="w-2.5 h-2.5" />
                                        </button>
                                        <span className="w-5 text-center font-bold text-[11px] text-zinc-900 font-mono">
                                          {Math.max(0, Math.min(cartItem.quantity, Number(cartItem.pack_qty) || (cartItem.is_packaged ? cartItem.quantity : 0)))}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const cur = Math.max(0, Math.min(cartItem.quantity, Number(cartItem.pack_qty) || (cartItem.is_packaged ? cartItem.quantity : 0)));
                                            onUpdatePackaging?.(itemKey, Math.min(cartItem.quantity, cur + 1));
                                          }}
                                          disabled={(Number(cartItem.pack_qty) || (cartItem.is_packaged ? cartItem.quantity : 0)) >= cartItem.quantity}
                                          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-30 cursor-pointer"
                                        >
                                          <Plus className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                      <span className="text-[10px] text-zinc-500 ml-1">of {cartItem.quantity}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* General Order Notes & Guest Details for Host */}
                    <div className="pt-2.5 border-t border-zinc-200 space-y-2">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-800 mb-0.5">
                          Additional Instructions
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

                {/* If Host already has active order items in kitchen, show them as well! */}
                {hasLiveOrder && (
                  <div className={`${items.length > 0 ? 'pt-3 border-t border-zinc-200' : ''} space-y-2`}>
                    <div className="flex items-center justify-between text-xs text-zinc-500 font-bold">
                      <span className="flex items-center gap-1.5 text-zinc-700">
                        <ChefHat className="w-3.5 h-3.5 text-amber-600" />
                        <span>Already in Kitchen ({liveItemsCount} {liveItemsCount === 1 ? 'item' : 'items'})</span>
                      </span>
                      <span className="text-[11px] text-zinc-400 font-mono">Table #{tableInfo.tableNumber}</span>
                    </div>

                    <div className="divide-y divide-zinc-100 bg-zinc-50/80 rounded-xl p-2.5 border border-zinc-200">
                      {liveOrderItems.map((item, idx) => (
                        <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-zinc-900">{item.name}</span>
                            {item.variant_name && <span className="ml-1 text-[10px] text-amber-800 font-bold">[{item.variant_name}]</span>}
                            {Number(item.round_number) > 1 && (
                              <span className="ml-1 text-[9px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-900 border border-purple-300 font-bold">
                                Round {item.round_number}
                              </span>
                            )}
                            <span className="text-zinc-500 ml-2">×{item.quantity}</span>
                          </div>
                          <span className="font-mono font-bold text-zinc-900 shrink-0">
                            {currencySymbol} {(Number(item.price) * item.quantity).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Footer with Price Breakdown and Confirm Button */}
        {(items.length > 0 || (hasLiveOrder && !isHost) || hasLiveOrder) && (
          <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-zinc-50 border-t border-zinc-200 space-y-2">
            {hasLiveOrder && isHost && draftItemsCount === 0 ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm font-extrabold text-zinc-900">
                  <span className="flex items-center gap-1.5 text-zinc-800">
                    <ChefHat className="w-4 h-4 text-amber-600" />
                    <span>Current Table Total</span>
                  </span>
                  <span className="text-amber-700 font-mono text-base notranslate">
                    {currencySymbol} {liveTotalAmount.toFixed(2)}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 font-medium">
                  {liveItemsCount} {liveItemsCount === 1 ? 'dish' : 'dishes'} already sent to kitchen & bar
                </div>
              </div>
            ) : hasLiveOrder && isHost && draftItemsCount > 0 ? (
              <div className="space-y-1.5">
                {draftPackagingCharge > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-600">
                    <span className="flex items-center gap-1.5 text-zinc-700">
                      <Package className="w-3.5 h-3.5 text-amber-600" />
                      <span>Packaging ({draftPackagingQty} @ {currencySymbol}{packagingFeeRate})</span>
                    </span>
                    <span className="font-mono text-zinc-900 font-bold notranslate">
                      +{currencySymbol} {draftPackagingCharge.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-600">
                  <span>New Order Subtotal</span>
                  <span className="font-mono text-zinc-900 font-bold notranslate">
                    {currencySymbol} {subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
                  <span>Dishes Already in Kitchen</span>
                  <span className="font-mono text-zinc-600 notranslate">
                    +{currencySymbol} {liveTotalAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm font-black text-zinc-950 pt-1.5 border-t border-zinc-200">
                  <span>Updated Table Total</span>
                  <span className="text-amber-700 font-mono text-base notranslate">
                    {currencySymbol} {(subtotal + liveTotalAmount).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <>
                {displayPackagingQty > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-600 pb-0.5">
                    <span className="flex items-center gap-1.5 text-zinc-700">
                      <Package className="w-3.5 h-3.5 text-amber-600" />
                      <span>Packaging ({displayPackagingQty} {displayPackagingQty === 1 ? 'item' : 'items'}{displayPackagingCharge > 0 ? ` @ ${currencySymbol}${packagingFeeRate}` : ''})</span>
                    </span>
                    <span className={`font-mono font-bold notranslate ${displayPackagingCharge === 0 ? 'text-emerald-700' : 'text-zinc-900'}`}>
                      {displayPackagingCharge === 0
                        ? `Complimentary (${currencySymbol} 0.00)`
                        : `+${currencySymbol} ${displayPackagingCharge.toFixed(2)}`}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm font-extrabold text-zinc-900">
                  <span>{hasLiveOrder && !isHost ? 'Table Subtotal' : 'Subtotal Amount'}</span>
                  <span className="text-amber-700 font-mono text-base notranslate">
                    {currencySymbol} {displaySubtotal.toLocaleString()}
                  </span>
                </div>

                {displayTax > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-600">
                    <span>Taxes & Charges</span>
                    <span className="font-mono text-zinc-800 notranslate">
                      +{currencySymbol} {displayTax.toLocaleString()}
                    </span>
                  </div>
                )}

                {hasLiveOrder && !isHost && (
                  <div className="flex items-center justify-between text-sm font-black text-zinc-950 pt-1 border-t border-zinc-200">
                    <span>Table Total</span>
                    <span className="text-zinc-950 font-mono text-base notranslate">
                      {currencySymbol} {displayTotal.toLocaleString()}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* View-Only Guest Notice */}
            {!tableInfo.isSessionExpired && tableInfo.tableNumber && !isHost && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold block">View-Only Mode</span>
                  <span className="text-[11px] text-amber-800">
                    {hasLiveOrder
                      ? `You scanned as a guest. Ordering authority belongs to the table host who scanned first. All ordered dishes, kitchen preparation status, and table totals are displayed in real time.`
                      : 'You scanned as a guest. Ordering authority belongs to the table host who scanned first.'}
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

            {(!isHost && !tableInfo.compEnabled) ? (
              <div
                id="btn-confirm-table-order"
                className="w-full py-3.5 px-4 bg-zinc-100 border border-zinc-200 rounded-xl flex items-center justify-center gap-2 text-zinc-600 font-bold select-none cursor-not-allowed shadow-none"
              >
                <Lock className="w-4 h-4 text-zinc-500" />
                <span className="text-sm sm:text-base font-bold text-zinc-600">View-Only Mode • Host Can Order</span>
              </div>
            ) : (
              <button
                id="btn-confirm-table-order"
                type="button"
                onClick={handleConfirmOrder}
                disabled={loading || items.length === 0 || Boolean(tableInfo.isSessionExpired) || !tableInfo.tableNumber}
                className={`w-full py-3.5 px-4 font-extrabold shadow-md rounded-xl flex items-center justify-center gap-2.5 transition-all duration-150 select-none active:scale-[0.99] ${
                  items.length === 0
                    ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed border border-zinc-300'
                    : 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white cursor-pointer'
                }`}
              >
                {loading ? (
                  <span className="text-sm sm:text-base font-bold">{hasLiveOrder ? 'Sending Follow-up to Kitchen...' : 'Placing Your Order...'}</span>
                ) : tableInfo.isSessionExpired ? (
                  <span className="text-sm sm:text-base font-bold">Session Ended • Scan Table QR</span>
                ) : !tableInfo.tableNumber ? (
                  <span className="text-sm sm:text-base font-bold">Scan Table QR to Order</span>
                ) : items.length === 0 && hasLiveOrder ? (
                  <div className="flex items-center justify-center gap-2">
                    <UtensilsCrossed className="w-4 h-4 text-zinc-500" />
                    <span className="text-sm sm:text-base font-bold text-zinc-600">Add dishes to order more</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2.5 w-full">
                    <ChefHat className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-white" />
                    <span className="text-sm sm:text-base font-black tracking-tight text-white whitespace-nowrap">
                      Check your order & confirm
                    </span>
                  </div>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
