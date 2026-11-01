import { renderFormattedDate, DateFormatMode } from '../../utils/dateFormatter';
import { calculateBillTotals } from '../../utils/taxCalculations';
import React, { useState, useEffect, useMemo } from 'react';
import { TableOrder, BusinessTaxConfig } from '../../types/rbac';
import { socketService } from '../../services/socket.service';
import {
  Receipt,
  Printer,
  Clock,
  Tag,
  Trash2,
  AlertTriangle,
  Banknote,
  QrCode,
  CreditCard,
  CheckCircle2,
  ChefHat,
  UtensilsCrossed,
  ShieldCheck,
  ArrowLeft
} from 'lucide-react';
import { Button } from '../ui/Button';
import { rbacService } from '../../services/rbac.service';

interface FinalTableBillPageProps {
  dateFormatBilling?: DateFormatMode;
  order: TableOrder;
  businessId?: string;
  businessName?: string;
  onDoneReturnToMenu: (settledOrder?: TableOrder) => void;
  onRequestBillDispatched?: () => void;
}

export const FinalTableBillPage: React.FC<FinalTableBillPageProps> = ({
  dateFormatBilling = 'ENGLISH',
  order,
  businessId,
  businessName = 'Restaurant Dining Service',
  onDoneReturnToMenu,
  onRequestBillDispatched,
}) => {
  const [liveOrder, setLiveOrder] = useState<TableOrder>(order);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'cash' | 'qr' | 'card'>('cash');
  const [billRequested, setBillRequested] = useState<boolean>(Boolean(order.bill_requested));
  const [requestingBill, setRequestingBill] = useState<boolean>(false);
  const [billSuccessMessage, setBillSuccessMessage] = useState<string | null>(null);

  // Business Tax Configuration
  const [taxConfig, setTaxConfig] = useState<BusinessTaxConfig | null>(null);

  // Promo Code State for Customer Final Billing
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountPercent: number;
    description: string;
  } | null>(null);
  const [promoRemovedByUser, setPromoRemovedByUser] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Subscribe to real-time order updates
  useEffect(() => {
    setLiveOrder(order);
    if (order.bill_requested) {
      setBillRequested(true);
    }
  }, [order]);

  // Restore saved promo code from liveOrder if present
  const isPromoVisible = taxConfig?.active_promo_enabled !== false;

  useEffect(() => {
    if (!isPromoVisible && appliedPromo) {
      setAppliedPromo(null);
    }
  }, [isPromoVisible, appliedPromo]);

  useEffect(() => {
    if (appliedPromo || promoRemovedByUser || !liveOrder?.promo_code || !isPromoVisible) return;
    const savedCode = liveOrder.promo_code.trim().toUpperCase();
    if (!savedCode) return;
    if (
      taxConfig?.active_promo_code &&
      savedCode === taxConfig.active_promo_code.trim().toUpperCase()
    ) {
      setAppliedPromo({
        code: savedCode,
        discountPercent: Number(taxConfig.active_promo_percent) || 10,
        description: taxConfig.active_promo_description || 'Active Special Restaurant Offer',
      });
    } else if (savedCode === 'WELCOME10') {
      setAppliedPromo({
        code: 'WELCOME10',
        discountPercent: 10,
        description: 'First Dine-In Courtesy 10% Discount',
      });
    } else if (savedCode === 'VIP20') {
      setAppliedPromo({
        code: 'VIP20',
        discountPercent: 20,
        description: 'VIP Dining Club 20% Discount',
      });
    }
  }, [liveOrder?.promo_code, taxConfig, appliedPromo, promoRemovedByUser, isPromoVisible]);

  const nonCancelledItems = useMemo(
    () => (liveOrder.items || []).filter((i) => i.status !== 'CANCELLED'),
    [liveOrder.items]
  );
  const allItemsServed = useMemo(
    () =>
      nonCancelledItems.length > 0 &&
      nonCancelledItems.every((i) => i.status === 'SERVED' || Boolean(i.served_at)),
    [nonCancelledItems]
  );

  const targetBizId = businessId || liveOrder.business_id;

  useEffect(() => {
    if (!targetBizId || !liveOrder.id) return;

    if (liveOrder.table_id) {
      socketService.joinTable(targetBizId, liveOrder.table_id);
    }

    const unsub = socketService.subscribeToOrders((data) => {
      if (!data || data.id !== liveOrder.id) return;
      const mergedOrder: TableOrder = {
        ...(liveOrder || order),
        ...data,
        subtotal: Number(data.subtotal ?? liveOrder?.subtotal ?? order.subtotal ?? 0),
        total_amount: Number(data.total_amount ?? liveOrder?.total_amount ?? order.total_amount ?? 0),
        currency: data.currency || liveOrder?.currency || order.currency || 'Rs.',
        payment_method: data.payment_method || liveOrder?.payment_method || order.payment_method || selectedPaymentMode || 'Cash',
      };
      setLiveOrder(mergedOrder);
      if (data.bill_requested) {
        setBillRequested(true);
      }
      if (data.status === 'COMPLETED' || data.payment_status === 'PAID' || (data as any).settled) {
        onDoneReturnToMenu(mergedOrder);
      }
    });

    return () => unsub();
  }, [targetBizId, liveOrder.id, onDoneReturnToMenu, order, selectedPaymentMode]);

  // Load Business Tax Config
  useEffect(() => {
    if (!targetBizId) return;

    rbacService.getTaxConfigApi(targetBizId).then((cfg) => {
      if (cfg) setTaxConfig(cfg);
    }).catch((err) => {
      console.warn('Tax config load note:', err);
    });
  }, [targetBizId]);

  // Promo Code Actions
  const handleApplyPromo = () => {
    if (!isPromoVisible) {
      setPromoError('Promotional codes are currently disabled by the restaurant.');
      return;
    }
    const cleanCode = promoInput.trim().toUpperCase();
    if (!cleanCode) {
      setPromoError('Please enter a voucher or promo code.');
      return;
    }

    if (
      taxConfig?.active_promo_enabled &&
      taxConfig.active_promo_code &&
      cleanCode === taxConfig.active_promo_code.toUpperCase()
    ) {
      setPromoRemovedByUser(false);
      setAppliedPromo({
        code: cleanCode,
        discountPercent: taxConfig.active_promo_percent || 10,
        description: taxConfig.active_promo_description || 'Active Special Restaurant Offer',
      });
      setPromoError(null);
      setPromoInput('');
      return;
    }

    if (cleanCode === 'WELCOME10') {
      setPromoRemovedByUser(false);
      setAppliedPromo({
        code: 'WELCOME10',
        discountPercent: 10,
        description: 'First Dine-In Courtesy 10% Discount',
      });
      setPromoError(null);
      setPromoInput('');
    } else if (cleanCode === 'VIP20') {
      setPromoRemovedByUser(false);
      setAppliedPromo({
        code: 'VIP20',
        discountPercent: 20,
        description: 'VIP Dining Club 20% Discount',
      });
      setPromoError(null);
      setPromoInput('');
    } else {
      setPromoError(`Invalid or expired code "${cleanCode}".`);
    }
  };

  const handleRemovePromo = () => {
    setPromoRemovedByUser(true);
    setAppliedPromo(null);
    setPromoError(null);
  };

  // Financial Calculations (Supports Exclusive of VAT% and Inclusive of VAT% modes; Promo discount is deducted from Grand Total without combining with VAT)
  const currencySymbol = liveOrder.currency || 'Rs.';

  const itemsMenuTotal = useMemo(() => {
    return nonCancelledItems.reduce((sum, it) => {
      const price = Number(it.price) || 0;
      const qty = Number(it.quantity) || 1;
      return sum + price * qty;
    }, 0);
  }, [nonCancelledItems]);

  const billCalc = useMemo(() => {
    const savedFlatPromo =
      !appliedPromo && !promoRemovedByUser ? Number(liveOrder?.promo_discount) || 0 : 0;
    return calculateBillTotals({
      itemsMenuTotal,
      taxConfig,
      fallbackTaxes: liveOrder?.taxes,
      fallbackTaxAmount: liveOrder?.tax_amount,
      promoDiscountPercent: appliedPromo?.discountPercent || 0,
      flatDiscountAmount: savedFlatPromo,
    });
  }, [
    itemsMenuTotal,
    taxConfig,
    liveOrder?.taxes,
    liveOrder?.tax_amount,
    liveOrder?.promo_discount,
    appliedPromo,
    promoRemovedByUser,
  ]);

  const itemsSubtotal = billCalc.subtotal;
  const promoDiscountAmount =
    billCalc.promoDiscountAmount > 0 ? billCalc.promoDiscountAmount : billCalc.totalDiscountAmount;
  const taxesList = useMemo(
    () =>
      billCalc.taxesList.map((t) => ({
        tax_id: t.id || t.tax_id || 'vat',
        id: t.id || t.tax_id || 'vat',
        name: t.name,
        rate_percent: t.rate_percent,
        is_inclusive: Boolean(t.is_inclusive),
        amount: t.amount,
      })),
    [billCalc.taxesList]
  );
  const totalTax = billCalc.totalTax;
  const totalAmount = billCalc.grandTotal;
  const isInclusiveTax = billCalc.isInclusive;

  // Actions
  const handleRequestBillAction = async () => {
    if (!liveOrder?.id || !targetBizId) return;
    if (!allItemsServed) {
      alert('Cannot request bill: All ordered dishes must be delivered and marked as served by the waiter first.');
      return;
    }
    setRequestingBill(true);

    try {
      const paymentLabel =
        selectedPaymentMode === 'cash'
          ? 'Cash at Table'
          : selectedPaymentMode === 'qr'
          ? 'QR Code Payment'
          : 'Card / POS Terminal';

      await rbacService.requestBillApi(targetBizId, liveOrder.id, {
        payment_method: selectedPaymentMode,
        subtotal: itemsSubtotal,
        promo_code: appliedPromo?.code || null,
        promo_discount: promoDiscountAmount,
        tax_amount: totalTax,
        taxes: taxesList,
        total_amount: totalAmount,
        currency: currencySymbol,
        order_notes: (
          (liveOrder.order_notes ? liveOrder.order_notes + ' • ' : '') +
          `[WAITER BILL REQUESTED - ${currencySymbol} ${totalAmount.toLocaleString()}]`
        ).trim(),
        table_id: liveOrder.table_id || '',
        table_number: liveOrder?.table_number || '',
        floor: liveOrder.floor || null,
        building: liveOrder.building || null,
        customer_name: liveOrder.customer_name || 'Table Guest',
        customer_phone: liveOrder.customer_phone || '',
        items_count: liveOrder.items.length,
      });

      setBillRequested(true);
      setBillSuccessMessage(
        `Service staff at the Waiter Station has been notified! A waiter is bringing your bill folio folder to Table #${liveOrder?.table_number || ''}.`
      );

      if (onRequestBillDispatched) onRequestBillDispatched();
    } catch (err: any) {
      console.warn('Bill request error:', err);
      setBillRequested(true);
      setBillSuccessMessage(
        `Bill requested for Table #${liveOrder?.table_number || ''}. Waiter Station alerted.`
      );
    } finally {
      setRequestingBill(false);
    }
  };

  const handlePayAndSettleAction = async () => {
    if (!liveOrder?.id || !targetBizId) return;
    if (!allItemsServed) {
      alert('Cannot request bill: All ordered dishes must be delivered and marked as served by the waiter first.');
      return;
    }
    setRequestingBill(true);

    try {
      const paymentLabel =
        selectedPaymentMode === 'cash'
          ? 'Cash at Table'
          : selectedPaymentMode === 'qr'
          ? 'QR Code Payment'
          : 'Card / POS Terminal';

      await rbacService.requestBillApi(targetBizId, liveOrder.id, {
        payment_method: selectedPaymentMode.toUpperCase(),
        subtotal: itemsSubtotal,
        promo_code: appliedPromo?.code || null,
        promo_discount: promoDiscountAmount,
        tax_amount: totalTax,
        taxes: taxesList,
        total_amount: totalAmount,
        currency: currencySymbol,
        order_notes: (
          (liveOrder.order_notes ? liveOrder.order_notes + ' • ' : '') +
          `[PAYMENT SETTLEMENT REQUESTED: ${paymentLabel} - ${currencySymbol} ${totalAmount.toLocaleString()}]`
        ).trim(),
        table_id: liveOrder.table_id || '',
        table_number: liveOrder?.table_number || '',
        floor: liveOrder.floor || null,
        building: liveOrder.building || null,
        customer_name: liveOrder.customer_name || 'Table Guest',
        customer_phone: liveOrder.customer_phone || '',
        items_count: liveOrder.items.length,
        notes: `Guest requested settlement via ${paymentLabel}`,
      });

      setBillRequested(true);
      setBillSuccessMessage(
        `Payment request of ${currencySymbol} ${totalAmount.toLocaleString()} via ${paymentLabel} sent! The Waiter Station has been pinged and service staff is on the way to Table #${liveOrder?.table_number || ''}.`
      );

      if (onRequestBillDispatched) onRequestBillDispatched();
    } catch (err: any) {
      console.error('Pay and settle error:', err);
      setBillRequested(true);
      setBillSuccessMessage(
        `Settlement requested for Table #${liveOrder?.table_number || ''}. Waiter Station alerted.`
      );
    } finally {
      setRequestingBill(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div id="final-table-bill-page" className="min-h-screen bg-zinc-100 text-zinc-900 pb-20">
      {/* Top Navbar */}
      <header className="bg-zinc-900 text-white border-b border-zinc-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-black shadow-xs shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-black text-base sm:text-lg text-white truncate flex items-center gap-2">
                <span>Final Table Bill</span>
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-500 text-zinc-950">
                  Table #{liveOrder?.table_number || ''}
                </span>
              </h1>
              <p className="text-xs text-zinc-400 truncate">
                {businessName} • Dine-In Bill Folio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-print-bill-receipt"
              type="button"
              onClick={handlePrintReceipt}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-zinc-700 shadow-xs"
              title="Print Receipt"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Container */}
      <main className="max-w-2xl mx-auto px-3 sm:px-4 pt-3 sm:pt-4">
        <div className="bg-white rounded-2xl shadow-lg border border-zinc-200/80 overflow-hidden">
          {/* Card Sub-Header */}
          <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-zinc-900 text-white flex items-center justify-between border-b border-zinc-800">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-base sm:text-lg text-white">Final Table Folio</h2>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950">
                  Table #{liveOrder?.table_number || ''}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                {liveOrder?.invoice_number ? `Invoice #${liveOrder.invoice_number}` : `Order #${liveOrder?.order_number || (liveOrder?.id ? liveOrder.id.slice(0, 8).toUpperCase() : 'ORD')}`} • Dine-In Guest
              </p>
            </div>

            <div className="text-right">
              <span className="text-[9px] uppercase font-bold text-zinc-400 block">Status</span>
              <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md text-[11px] mt-0.5 ${
                liveOrder.folio_delivered || (liveOrder as any).bill_acknowledged
                  ? 'text-emerald-400 bg-emerald-500/20 border border-emerald-500/30'
                  : 'text-amber-400 bg-amber-500/20 border border-amber-500/30'
              }`}>
                {liveOrder.folio_delivered || (liveOrder as any).bill_acknowledged ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Folio Delivered
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3" />
                    {billRequested ? 'Bill Requested' : 'Payment Due'}
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="p-3.5 sm:p-4 space-y-3">
            {/* Table & Timestamp Info Banner */}
            <div className="p-2.5 sm:p-3 bg-zinc-50 border border-zinc-200/90 rounded-xl grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 block leading-tight">Dine-In Table</span>
                <span className="font-extrabold text-zinc-900 text-xs sm:text-sm leading-tight">Table #{liveOrder?.table_number || ''}</span>
                {(liveOrder?.floor || liveOrder?.building) && (
                  <span className="text-[10px] text-zinc-500 block leading-tight">
                    {[liveOrder?.floor, liveOrder?.building].filter(Boolean).join(' • ')}
                  </span>
                )}
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 block leading-tight">Order Placed</span>
                <span className="font-bold text-zinc-800 text-[11px] sm:text-xs block leading-tight">
                  {renderFormattedDate(liveOrder.created_at || new Date(), dateFormatBilling)}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 block leading-tight">Ordering Status</span>
                <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-[10px] mt-0.5 leading-tight">
                  Ordering Locked
                </span>
              </div>
            </div>

            {/* Promo Code & Voucher Section */}
            {isPromoVisible && (
              <div className="p-2.5 sm:p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                    <Tag className="w-3.5 h-3.5 text-amber-600" />
                    <span>Restaurant Promo Code & Voucher</span>
                  </div>
                  {appliedPromo && (
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Applied ({appliedPromo.discountPercent}% Off)
                    </span>
                  )}
                </div>

                {!appliedPromo ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        id="input-bill-promo-code"
                        type="text"
                        value={promoInput}
                        onChange={(e) => {
                          setPromoInput(e.target.value.toUpperCase());
                          if (promoError) setPromoError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApplyPromo();
                          }
                        }}
                        placeholder="ENTER PROMO CODE"
                        className="flex-1 bg-white border border-amber-300/80 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-zinc-900 placeholder:text-zinc-400 placeholder:font-sans focus:outline-hidden focus:ring-1.5 focus:ring-amber-500"
                      />
                      <Button
                        id="btn-apply-bill-promo"
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleApplyPromo}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 cursor-pointer h-auto"
                      >
                        Apply
                      </Button>
                    </div>

                    {promoError && (
                      <div className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{promoError}</span>
                      </div>
                    )}

                    
                  </div>
                ) : (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2.5 animate-in fade-in duration-150">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-xs text-emerald-900 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-300">
                          {appliedPromo.code}
                        </span>
                        <span className="text-xs font-extrabold text-emerald-700">
                          -{appliedPromo.discountPercent}% Discount
                        </span>
                      </div>
                      <p className="text-[10px] text-emerald-800 font-medium">
                        {appliedPromo.description} • Saved <span className="notranslate font-mono font-bold">{currencySymbol} {promoDiscountAmount.toFixed(2)}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemovePromo}
                      className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-white rounded transition cursor-pointer shrink-0"
                      title="Remove promo code"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Itemized Table Bill */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center justify-between">
                <span>Itemized Order Details</span>
                <span>{liveOrder.items.length} {liveOrder.items.length === 1 ? 'dish' : 'dishes'}</span>
              </h3>

              <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100 bg-white">
                {liveOrder.items.map((it, idx) => (
                  <div key={idx} className="px-3 py-2 sm:py-2.5 flex items-start sm:items-center justify-between gap-2.5 text-xs hover:bg-zinc-50/50 transition">
                    <div className="space-y-0.5 min-w-0 flex-1 pr-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-zinc-900 text-xs sm:text-sm break-words leading-tight">
                          {it.name}
                        </span>
                        {it.variant_name && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            [{it.variant_name}]
                          </span>
                        )}
                        {it.station === 'BAR' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-semibold shrink-0">
                            Bar
                          </span>
                        )}
                        {it.status === 'READY' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 shrink-0">
                            Ready
                          </span>
                        )}
                        {it.status === 'SERVED' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 font-medium shrink-0">
                            Served
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-zinc-500 leading-tight notranslate">
                        {it.quantity} × {currencySymbol} {Number(it.price).toFixed(2)}
                        {it.special_instructions && (
                          <span className="italic text-zinc-400 block mt-0.5">Note: "{it.special_instructions}"</span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono font-black text-zinc-900 text-xs sm:text-sm shrink-0 pt-0.5 sm:pt-0 notranslate">
                      {currencySymbol} {(Number(it.price) * Number(it.quantity)).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tax & Total Calculation */}
            <div className="p-3 sm:p-3.5 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-1.5 text-xs notranslate">
              <div className="flex items-center justify-between text-zinc-600">
                <span className="font-medium">Items Subtotal</span>
                <span className="font-mono font-semibold text-zinc-800">
                  {currencySymbol} {itemsSubtotal.toFixed(2)}
                </span>
              </div>

              {taxesList.length > 0 ? (
                taxesList.map((tax, tIdx) => (
                  <div key={tIdx} className="flex items-center justify-between text-zinc-600">
                    <span>
                      {tax.name} ({tax.rate_percent}%)
                    </span>
                    <span className="font-mono text-zinc-700">
                      +{currencySymbol} {tax.amount.toFixed(2)}
                    </span>
                  </div>
                ))
              ) : totalTax > 0 ? (
                <div className="flex items-center justify-between text-zinc-600">
                  <span>VAT (13%)</span>
                  <span className="font-mono text-zinc-700">
                    +{currencySymbol} {totalTax.toFixed(2)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                  <span>Taxes & Charges</span>
                  <span className="font-mono">{currencySymbol} 0.00</span>
                </div>
              )}

              {appliedPromo && promoDiscountAmount > 0 && (
                <div className="flex items-center justify-between text-emerald-700 font-medium">
                  <span>Promo Voucher Discount ({appliedPromo.code} -{appliedPromo.discountPercent}%)</span>
                  <span className="font-mono font-bold">
                    -{currencySymbol} {promoDiscountAmount.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="pt-2 mt-1 border-t border-zinc-200 flex items-center justify-between">
                <div>
                  <span className="text-xs sm:text-sm font-black text-zinc-900 block leading-tight">Total Amount Payable</span>
                </div>
                <span className="text-xl sm:text-2xl font-black text-zinc-950 font-mono">
                  {currencySymbol} {totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            

            {/* Bill Actions Section */}
            <div className="pt-2.5 border-t border-zinc-200">
              {!billRequested ? (
                <div className="space-y-2">
                  {!allItemsServed && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="leading-tight">
                        <strong className="block font-bold">Dishes in preparation in kitchen</strong>
                        <span className="text-[11px] text-amber-800">Final bill can be requested once all ordered dishes are delivered to your table.</span>
                      </div>
                    </div>
                  )}

                  <Button
                    id="btn-request-bill-staff"
                    type="button"
                    variant="primary"
                    size="lg"
                    disabled={!allItemsServed || requestingBill}
                    onClick={handleRequestBillAction}
                    className={`w-full py-2.5 sm:py-3 text-xs sm:text-sm font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 ${
                      !allItemsServed
                        ? 'opacity-50 cursor-not-allowed bg-zinc-400 text-zinc-100'
                        : 'cursor-pointer bg-zinc-950 hover:bg-zinc-800 text-white'
                    }`}
                  >
                    <Receipt className="w-4 h-4 text-amber-400" />
                    <span>Request Final Bill <span className="notranslate font-mono font-bold">({currencySymbol} {totalAmount.toFixed(2)})</span></span>
                  </Button>

                  
                </div>
              ) : (
                <div id="bill-request-dispatched-card" className="space-y-2.5 animate-in fade-in duration-200">
                  <div className="p-3 sm:p-3.5 bg-emerald-50 border-2 border-emerald-500 rounded-xl flex items-start gap-3 shadow-xs">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wide">
                          {liveOrder.folio_delivered || (liveOrder as any).bill_acknowledged
                            ? 'Bill Folio Delivered'
                            : 'Bill Request Dispatched'}
                        </strong>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          liveOrder.folio_delivered || (liveOrder as any).bill_acknowledged
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-200 text-emerald-900 animate-pulse'
                        }`}>
                          {liveOrder.folio_delivered || (liveOrder as any).bill_acknowledged
                            ? 'Folio Delivered'
                            : 'Waiter Pinged'}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-900 font-medium leading-relaxed">
                        {liveOrder.folio_delivered || (liveOrder as any).bill_acknowledged
                          ? `Your bill check folio has been delivered to Table #${liveOrder?.table_number || ''}! You can settle payment directly with your waiter or at the cashier counter.`
                          : billSuccessMessage || `Service staff at the Waiter Station has been notified! A waiter is bringing your bill folio folder to Table #${liveOrder?.table_number || ''}.`}
                      </p>

                      <div className="text-[11px] text-emerald-800 font-semibold pt-1 border-t border-emerald-200/60 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          liveOrder.folio_delivered || (liveOrder as any).bill_acknowledged
                            ? 'bg-emerald-600'
                            : 'bg-emerald-500 animate-ping'
                        }`} />
                        <span>
                          Table #{liveOrder?.table_number || ''} •{' '}
                          {liveOrder.folio_delivered || (liveOrder as any).bill_acknowledged
                            ? 'Folio at table • Ready for settlement'
                            : 'Service staff on the way'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
