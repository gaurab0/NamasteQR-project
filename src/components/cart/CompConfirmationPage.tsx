import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  Gift, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  ChefHat, 
  ArrowLeft, 
  Check, 
  UtensilsCrossed,
  UserCheck,
  Minus,
  Plus,
  Package
} from 'lucide-react';
import { CartItem, TableOrder } from '../../types/rbac';
import { determineItemStation, getAllItemCategories } from '../../utils/menuUtils';
import { computeOrderBillableAmounts } from '../../utils/taxCalculations';
import { rbacService } from '../../services/rbac.service';
import { Button } from '../ui/Button';

export interface CompConfirmationPageProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  tableInfo: {
    tableId?: string;
    tableNumber?: string;
    floor?: string | null;
    building?: string | null;
    businessId?: string;
    businessName?: string;
    existingOrderId?: string;
    sessionId?: string | null;
    hostToken?: string | null;
    compOrdererName?: string | null;
    compOrdererPhone?: string | null;
  };
  currencySymbol?: string;
  packagingFee?: number;
  generalNotes?: string;
  onOrderConfirmed: (order: TableOrder) => void;
  onClearCart: () => void;
}

export const CompConfirmationPage: React.FC<CompConfirmationPageProps> = ({
  isOpen,
  onClose,
  cartItems,
  tableInfo,
  currencySymbol = 'Rs.',
  packagingFee = 10,
  generalNotes,
  onOrderConfirmed,
  onClearCart,
}) => {
  const [step, setStep] = useState<'PASSWORD' | 'SELECT_ITEMS'>('PASSWORD');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Selected comp quantities per item (default: all quantities checked/comped)
  const getItemKey = (ci: CartItem) => `${ci.menuItem.id}_${ci.selected_variant?.id || 'base'}`;
  const [compQuantities, setCompQuantities] = useState<Record<string, number>>({});
  // null = auto-comp packaging for comped quantities; true = make ALL packaging complimentary; false = bill all packaging
  const [pkgCompOverride, setPkgCompOverride] = useState<boolean | null>(null);

  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize selected comp quantities to ALL items & full quantities by default
  useEffect(() => {
    if (isOpen) {
      const initialCompQtys: Record<string, number> = {};
      cartItems.forEach((ci) => {
        initialCompQtys[getItemKey(ci)] = ci.quantity;
      });
      setCompQuantities(initialCompQtys);
      setPkgCompOverride(null);
      setStep('PASSWORD');
      setPasswordInput('');
      setPasswordError(null);
      setSubmitError(null);
    }
  }, [isOpen, cartItems]);

  if (!isOpen) return null;

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) {
      setPasswordError('Please enter the complementary password.');
      return;
    }

    setVerifying(true);
    setPasswordError(null);
    try {
      const result = await rbacService.verifyCompPasswordApi(passwordInput.trim(), tableInfo.businessId);
      if (result.valid) {
        setStep('SELECT_ITEMS');
      } else {
        setPasswordError(result.message || 'Incorrect complementary password. Please check and try again.');
      }
    } catch (err: any) {
      setPasswordError(err?.message || 'Failed to verify complementary password. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleToggleItemComp = (key: string, maxQty: number) => {
    setCompQuantities((prev) => {
      const current = prev[key] ?? 0;
      const nextQty = current > 0 ? 0 : maxQty;
      return { ...prev, [key]: nextQty };
    });
  };

  const handleSetCompQty = (key: string, nextQty: number, maxQty: number) => {
    setCompQuantities((prev) => {
      const clamped = Math.max(0, Math.min(maxQty, nextQty));
      return { ...prev, [key]: clamped };
    });
  };

  const isAllFullySelected = cartItems.length > 0 && cartItems.every((ci) => {
    const key = getItemKey(ci);
    return (compQuantities[key] ?? 0) === ci.quantity;
  });

  const handleSelectAll = () => {
    const nextQtys: Record<string, number> = {};
    cartItems.forEach((ci) => {
      const key = getItemKey(ci);
      nextQtys[key] = isAllFullySelected ? 0 : ci.quantity;
    });
    setCompQuantities(nextQtys);
    setPkgCompOverride(null);
  };

  // Calculations
  const packagingFeeRate = Math.max(0, Number(packagingFee ?? 10) || 0);
  const draftBillItems = cartItems.map((ci) => {
    const key = getItemKey(ci);
    const compQty = Math.max(0, Math.min(ci.quantity, compQuantities[key] ?? ci.quantity));
    const price = ci.selected_variant ? Number(ci.selected_variant.price) : Number(ci.menuItem.price);
    const isPkg = ci.menuItem.is_packageable !== false;
    const pQty = isPkg ? Math.max(0, Math.min(ci.quantity, Number(ci.pack_qty) || (ci.is_packaged ? ci.quantity : 0))) : 0;
    return {
      price,
      quantity: ci.quantity,
      comp_qty: compQty,
      is_comp: compQty >= ci.quantity,
      is_packageable: isPkg,
      is_packaged: pQty > 0,
      pack_qty: pQty,
    };
  });

  const defaultBillSummary = computeOrderBillableAmounts(draftBillItems, {
    packagingFeeRate,
  });
  const isDefaultAllPkgComp = defaultBillSummary.packagingQty > 0 && defaultBillSummary.packagingTotal === 0;

  const billSummary = pkgCompOverride === null
    ? defaultBillSummary
    : computeOrderBillableAmounts(draftBillItems, {
        packagingFeeRate,
        isPackagingComp: pkgCompOverride === true ? true : undefined,
        ...(pkgCompOverride === false
          ? { explicitPackagingCharge: draftBillItems.reduce((s, it) => s + it.pack_qty * packagingFeeRate, 0) }
          : {}),
      });

  const totalPackagingQty = billSummary.packagingQty;
  const effectiveCompPackagingQty = pkgCompOverride === false ? 0 : billSummary.compPackagingQty;
  const effectivePackagingCharge = billSummary.packagingTotal;
  const effectiveCompPackagingValue = pkgCompOverride === false ? 0 : billSummary.compPackagingValue;
  const isAllPkgComp = totalPackagingQty > 0 && effectivePackagingCharge === 0;
  const compValueTotal = billSummary.compItemsValue + effectiveCompPackagingValue;
  const payableTotal = billSummary.itemsMenuTotal + effectivePackagingCharge;

  const handleConfirmAndSend = async () => {
    if (cartItems.length === 0) return;

    setSubmittingOrder(true);
    setSubmitError(null);

    try {
      const itemsPayload = cartItems.map((ci) => {
        const itemCategories = getAllItemCategories(ci.menuItem);
        const station = ci.selected_variant?.station || determineItemStation(ci.menuItem);
        const itemCode = ci.selected_variant?.erp_item_code || ci.menuItem.erp_item_code;
        const finalPrice = ci.selected_variant ? Number(ci.selected_variant.price) : Number(ci.menuItem.price);
        const variantName = ci.selected_variant?.name;
        const key = getItemKey(ci);
        const compQty = Math.max(0, Math.min(ci.quantity, compQuantities[key] ?? ci.quantity));
        const isComp = compQty >= ci.quantity;
        const isPkg = ci.menuItem.is_packageable !== false;
        const pQty = isPkg ? Math.max(0, Math.min(ci.quantity, Number(ci.pack_qty) || (ci.is_packaged ? ci.quantity : 0))) : 0;
        const compPackQty = pkgCompOverride === true
          ? pQty
          : pkgCompOverride === false
            ? 0
            : Math.min(pQty, compQty);
        const billedPackQty = Math.max(0, pQty - compPackQty);

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
          is_comp: isComp,
          comp_qty: compQty,
          comp_value: compQty * finalPrice,
          is_packageable: isPkg,
          is_packaged: pQty > 0,
          pack_qty: pQty,
          comp_pack_qty: compPackQty,
          is_packaging_comp: pQty > 0 && compPackQty >= pQty,
          packaging_charge: billedPackQty * packagingFeeRate,
          ordered_at: new Date().toISOString(),
        };
      });

      const orderPayload = {
        business_id: tableInfo.businessId || 'default-biz',
        table_id: tableInfo.tableId || 'walk-in',
        table_number: tableInfo.tableNumber || 'Table',
        floor: tableInfo.floor || null,
        building: tableInfo.building || null,
        existing_order_id: tableInfo.existingOrderId,
        session_id: tableInfo.sessionId || undefined,
        host_token: tableInfo.hostToken,
        customer_name: tableInfo.compOrdererName || 'Manager Comp',
        customer_phone: tableInfo.compOrdererPhone || '',
        order_notes: [
          generalNotes,
          `[Complementary Order] Auth by ${tableInfo.compOrdererName || 'Manager'} (${tableInfo.compOrdererPhone || '-'})`
        ].filter(Boolean).join(' • '),
        items: itemsPayload,
        is_packaging_comp: isAllPkgComp,
        packaging_charge: effectivePackagingCharge,
        packaging_qty: totalPackagingQty,
        subtotal: payableTotal,
        total_amount: payableTotal,
        currency: currencySymbol,
      };

      const res = await fetch('/api/rbac/table-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to place complementary order');
      }

      onOrderConfirmed(data.data);
      onClearCart();
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || 'Something went wrong while confirming the order');
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-zinc-900 text-white flex items-center justify-between border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-500 text-zinc-950 flex items-center justify-center font-bold shadow-xs">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold tracking-tight">
                Complementary Order Authorization
              </h3>
              <p className="text-[11px] text-zinc-400 font-medium">
                {tableInfo.businessName || 'Restaurant Service'} • Table #{tableInfo.tableNumber || '-'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* STEP 1: Password Gate */}
          {step === 'PASSWORD' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                      Manager Password Required
                    </h4>
                    <p className="text-[11px] text-amber-800">
                      Table #{tableInfo.tableNumber} is operating in Complementary Mode.
                    </p>
                  </div>
                </div>
                {tableInfo.compOrdererName && (
                  <div className="pt-2 border-t border-amber-200/80 flex items-center gap-2 text-xs text-amber-900 font-semibold">
                    <UserCheck className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Registered Orderer: <strong>{tableInfo.compOrdererName}</strong> ({tableInfo.compOrdererPhone || 'No Phone'})</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleVerifyPassword} className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                    Complementary Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoFocus
                      required
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Enter complementary password"
                      className="w-full px-3.5 py-3 pr-11 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-mono font-bold tracking-wider text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Code configured in Business Profile tab by the owner.
                  </p>
                </div>

                {passwordError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-bold flex items-center gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={onClose}
                    className="w-1/3 text-xs font-bold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={verifying || !passwordInput.trim()}
                    className="w-2/3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
                  >
                    {verifying ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify Password →</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 2: Item Selection for Complementary */}
          {step === 'SELECT_ITEMS' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Orderer Banner */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Authorized for: <strong>{tableInfo.compOrdererName || 'Owner/Manager'}</strong>
                    {tableInfo.compOrdererPhone && ` (${tableInfo.compOrdererPhone})`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[11px] font-bold text-amber-700 hover:text-amber-950 underline cursor-pointer"
                >
                  {isAllFullySelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="text-xs text-zinc-500 font-medium">
                Select dishes and quantities to mark as complimentary. Unchecked/remaining items will be billed at standard menu prices.
              </div>

              {/* Items List */}
              <div className="divide-y divide-zinc-200/70 border border-zinc-200 rounded-2xl bg-zinc-50/50 p-2 max-h-72 overflow-y-auto space-y-2">
                {cartItems.map((ci) => {
                  const key = getItemKey(ci);
                  const compQty = Math.max(0, Math.min(ci.quantity, compQuantities[key] ?? ci.quantity));
                  const isFullyComp = compQty === ci.quantity;
                  const isPartialComp = compQty > 0 && compQty < ci.quantity;
                  const isZeroComp = compQty === 0;
                  const billedQty = ci.quantity - compQty;
                  const unitPrice = ci.selected_variant ? Number(ci.selected_variant.price) : Number(ci.menuItem.price);
                  const payableLine = billedQty * unitPrice;
                  const isPkg = ci.menuItem.is_packageable !== false;
                  const pQty = isPkg ? Math.max(0, Math.min(ci.quantity, Number(ci.pack_qty) || (ci.is_packaged ? ci.quantity : 0))) : 0;
                  const itemCompPackQty = pkgCompOverride === true
                    ? pQty
                    : pkgCompOverride === false
                      ? 0
                      : Math.min(pQty, compQty);
                  const itemBilledPackQty = Math.max(0, pQty - itemCompPackQty);
                  const itemPkgFee = itemBilledPackQty * packagingFeeRate;

                  return (
                    <div
                      key={key}
                      onClick={() => {
                        if (ci.quantity === 1) {
                          handleToggleItemComp(key, ci.quantity);
                        }
                      }}
                      className={`p-3 rounded-xl border transition select-none flex flex-col gap-2 ${
                        isFullyComp
                          ? 'bg-amber-100/70 border-amber-300'
                          : isPartialComp
                          ? 'bg-amber-50/90 border-amber-300 ring-1 ring-amber-300/50'
                          : 'bg-white border-zinc-200 hover:border-zinc-300'
                      } ${ci.quantity === 1 ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleItemComp(key, ci.quantity);
                            }}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition cursor-pointer ${
                              isFullyComp
                                ? 'bg-amber-600 border-amber-600 text-white'
                                : isPartialComp
                                ? 'bg-amber-500 border-amber-500 text-white'
                                : 'border-zinc-300 bg-white hover:border-zinc-400'
                            }`}
                            title={isFullyComp ? 'Deselect complimentary' : 'Mark all complimentary'}
                          >
                            {isFullyComp && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            {isPartialComp && <Minus className="w-3.5 h-3.5 stroke-[3]" />}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-zinc-900 truncate">
                                {ci.quantity}x {ci.menuItem.name}
                              </span>
                              {ci.selected_variant && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-200/80 text-amber-900">
                                  {ci.selected_variant.name}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-zinc-500 block mt-0.5">
                              {currencySymbol} {unitPrice.toFixed(2)} each
                            </span>
                            {pQty > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900">
                                <Package className="w-3 h-3 text-amber-600" />
                                <span>Pack: {pQty}</span>
                                <span className={itemPkgFee === 0 ? 'text-emerald-700' : 'text-amber-700'}>
                                  {itemPkgFee === 0 ? '• 🎁 Comp Pack' : `• +${currencySymbol} ${itemPkgFee.toFixed(2)}`}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price & Badge Display */}
                        <div className="text-right shrink-0">
                          {isFullyComp ? (
                            <div className="flex flex-col items-end">
                              <span className="text-xs font-bold text-emerald-700 font-mono">
                                {currencySymbol} 0.00
                              </span>
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-200/80 px-1.5 py-0.2 rounded mt-0.5">
                                🎁 All Comp ({ci.quantity})
                              </span>
                            </div>
                          ) : isPartialComp ? (
                            <div className="flex flex-col items-end">
                              <span className="text-xs font-bold text-zinc-900 font-mono">
                                {currencySymbol} {payableLine.toFixed(2)}
                              </span>
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-200/80 px-1.5 py-0.2 rounded mt-0.5">
                                🎁 {compQty} Comp • {billedQty} Bill
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end">
                              <span className="text-xs font-bold text-zinc-900 font-mono">
                                {currencySymbol} {(unitPrice * ci.quantity).toFixed(2)}
                              </span>
                              <span className="text-[10px] text-zinc-400 mt-0.5">
                                Standard Bill
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Selective Quantity Stepper when item has multiple quantities */}
                      {ci.quantity > 1 && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-between pt-2 border-t border-zinc-200/60 mt-1"
                        >
                          <div className="flex items-center gap-1.5">
                            <Gift className="w-3.5 h-3.5 text-amber-600" />
                            <span className="text-[11px] font-bold text-zinc-700">Complimentary Qty:</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="inline-flex items-center border border-amber-300 rounded-lg bg-white shadow-2xs overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleSetCompQty(key, compQty - 1, ci.quantity)}
                                disabled={compQty <= 0}
                                className="w-7 h-7 flex items-center justify-center text-amber-700 hover:text-amber-900 hover:bg-amber-50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer select-none"
                                title="Decrease comp quantity"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-8 text-center font-bold text-xs font-mono text-amber-950 select-none">
                                {compQty}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSetCompQty(key, compQty + 1, ci.quantity)}
                                disabled={compQty >= ci.quantity}
                                className="w-7 h-7 flex items-center justify-center text-amber-700 hover:text-amber-900 hover:bg-amber-50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer select-none"
                                title="Increase comp quantity"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="text-[10px] font-medium text-zinc-500">
                              of {ci.quantity}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Complimentary Packaging Toggle (shown whenever packaging exists) */}
              {totalPackagingQty > 0 && (
                <label
                  htmlFor="toggle-comp-packaging"
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition select-none ${
                    isAllPkgComp
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-amber-50/70 border-amber-200 text-amber-950 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      id="toggle-comp-packaging"
                      type="checkbox"
                      checked={isAllPkgComp}
                      onChange={() => {
                        if (isAllPkgComp) {
                          setPkgCompOverride(pkgCompOverride === true && !isDefaultAllPkgComp ? null : false);
                        } else {
                          setPkgCompOverride(true);
                        }
                      }}
                      className="w-4 h-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Make Packaging Complimentary</span>
                      </div>
                      <p className="text-[10px] opacity-80">
                        {isAllPkgComp
                          ? `All ${totalPackagingQty} container${totalPackagingQty === 1 ? '' : 's'} waived (Kitchen still packs ${totalPackagingQty})`
                          : `${effectiveCompPackagingQty} of ${totalPackagingQty} auto-comped • ${totalPackagingQty - effectiveCompPackagingQty} billed`}
                      </p>
                    </div>
                  </div>
                  <span className={`font-mono text-xs font-bold shrink-0 ${isAllPkgComp ? 'text-emerald-700' : 'text-amber-800'}`}>
                    {isAllPkgComp ? 'FREE' : `+${currencySymbol} ${effectivePackagingCharge.toFixed(2)}`}
                  </span>
                </label>
              )}

              {/* Price Breakdown */}
              <div className="p-3.5 bg-zinc-100 rounded-2xl border border-zinc-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-zinc-600 font-medium">
                  <span>Dishes in Order</span>
                  <span className="font-bold text-zinc-900">{cartItems.length} dishes</span>
                </div>
                {totalPackagingQty > 0 && (
                  <div className="flex items-center justify-between text-zinc-700 font-medium">
                    <span className="flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-amber-600" />
                      <span>Packaging ({totalPackagingQty} {totalPackagingQty === 1 ? 'item' : 'items'})</span>
                    </span>
                    <span className={`font-mono font-bold ${effectivePackagingCharge === 0 ? 'text-emerald-700' : 'text-zinc-900'}`}>
                      {effectivePackagingCharge === 0
                        ? `Complimentary (${currencySymbol} 0.00)`
                        : `+${currencySymbol} ${effectivePackagingCharge.toFixed(2)}`}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-emerald-800 font-semibold">
                  <span className="flex items-center gap-1">
                    <Gift className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Complimentary Value</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-900">
                    +{currencySymbol} {compValueTotal.toFixed(2)}
                  </span>
                </div>
                <div className="pt-2 border-t border-zinc-200 flex items-center justify-between font-black text-sm text-zinc-950">
                  <span>Payable Bill Balance</span>
                  <span className="font-mono text-base text-zinc-950">
                    {currencySymbol} {payableTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {submitError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setStep('PASSWORD')}
                  disabled={submittingOrder}
                  className="w-1/3 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={submittingOrder}
                  onClick={handleConfirmAndSend}
                  className="w-2/3 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md"
                >
                  {submittingOrder ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sending to Kitchen...</span>
                    </>
                  ) : (
                    <>
                      <ChefHat className="w-4 h-4" />
                      <span>Confirm & Send to Kitchen</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
