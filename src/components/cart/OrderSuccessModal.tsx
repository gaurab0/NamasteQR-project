import React, { useState, useEffect, useMemo, useRef } from 'react';
import { calculateBillTotals } from '../../utils/taxCalculations';
import { TableOrder, OrderStatus, TableStatus, BusinessTaxConfig, SaleRecord, SaleTaxBreakdown, SalePaymentMethod } from '../../types/rbac';
import { KdsPrintMode } from '../../types/printer.types';
import { rbacService } from '../../services/rbac.service';
import { socketService } from '../../services/socket.service';
import { 
  CheckCircle2, 
  ChefHat, 
  Clock, 
  MapPin, 
  ShoppingBag, 
  X, 
  ArrowRight, 
  Sparkles,
  UtensilsCrossed,
  Receipt,
  Bell,
  Wine,
  Flame,
  CheckCheck,
  CreditCard,
  QrCode,
  Printer,
  ChevronLeft,
  Banknote,
  ShieldCheck,
  AlertCircle,
  Tag,
  AlertTriangle,
  Trash2,
  KeyRound,
  Wallet,
  Lock,
  Package,
  RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

interface OrderSuccessModalProps {
  order: TableOrder | null;
  isOpen?: boolean;
  isHost?: boolean;
  onClose: () => void;
  onOrderMore: () => void;
  onOpenFinalBillPage?: (order?: TableOrder) => void;
  onRequestBill?: () => void;
  onRequestBillOrPaid?: () => void;
  onClearCart?: () => void;
  onSettled?: (orderId: string, tableNumber?: string, settledOrder?: TableOrder) => void;
  kdsPrintMode?: KdsPrintMode;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  order,
  isOpen = true,
  isHost = true,
  onClose,
  onOrderMore,
  onOpenFinalBillPage,
  onRequestBill,
  onRequestBillOrPaid,
  onClearCart,
  onSettled,
  kdsPrintMode,
}) => {
  const [liveOrder, setLiveOrder] = useState<TableOrder | null>(order);
  const [liveKdsPrintMode, setLiveKdsPrintMode] = useState<KdsPrintMode>(() => {
    if (kdsPrintMode) return kdsPrintMode;
    try {
      const cachedBiz = localStorage.getItem('serveflow_customer_business_profile');
      if (cachedBiz) {
        const parsed = JSON.parse(cachedBiz);
        if (parsed.kds_print_mode) return parsed.kds_print_mode;
      }
    } catch {}
    return 'DISPLAY_ONLY';
  });

  useEffect(() => {
    if (kdsPrintMode) {
      setLiveKdsPrintMode(kdsPrintMode);
    }
  }, [kdsPrintMode]);

  // Load configured business profile dispatch policy in real time if not provided
  useEffect(() => {
    const bizId = liveOrder?.business_id || order?.business_id;
    if (!bizId) return;

    rbacService.getBusinessProfileApi(bizId).then((biz) => {
      if (biz?.kds_print_mode) {
        setLiveKdsPrintMode(biz.kds_print_mode as KdsPrintMode);
      }
    }).catch(() => {});
  }, [liveOrder?.business_id, order?.business_id]);

  // Real-time Socket.io listener for dispatch policy updates
  useEffect(() => {
    const bizId = liveOrder?.business_id || order?.business_id;
    if (!bizId) return;

    const unsubBiz = socketService.subscribeToBusinessProfile((biz) => {
      if (biz && (biz.id === bizId || !biz.id) && biz.kds_print_mode) {
        setLiveKdsPrintMode(biz.kds_print_mode as KdsPrintMode);
      }
    });

    return () => unsubBiz();
  }, [liveOrder?.business_id, order?.business_id]);

  const isPrintOnly = liveKdsPrintMode === 'PRINT_ONLY';
  const [viewMode, setViewMode] = useState<'tracker' | 'bill' | 'payment'>(() => {
    if (order?.status === 'AWAITING_PAYMENT') return 'payment';
    if (order?.bill_requested) return 'bill';
    return 'tracker';
  });
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'cash' | 'qr' | 'card'>('cash');
  const [billRequested, setBillRequested] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [requestingBill, setRequestingBill] = useState(false);
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);
  const [waiterCooldown, setWaiterCooldown] = useState(0);
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
  const [promoError, setPromoError] = useState<string | null>(null);

  // Credit & Deposit PIN verification state
  const [pinInput, setPinInput] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  const handleAuthorizePin = async () => {
    if (!liveOrder) return;
    if (!pinInput.trim() || !/^\d{6}$/.test(pinInput.trim())) {
      setPinError('Please enter a valid 6-digit numeric PIN.');
      return;
    }
    setPinSubmitting(true);
    setPinError(null);
    try {
      const currentMethod = (liveOrder.payment_method as any) || 'CREDIT';
      await rbacService.verifyTableOrderPinApi(
        liveOrder.id,
        liveOrder.business_id,
        pinInput.trim(),
        currentMethod
      );
      setLiveOrder((prev) => prev ? { ...prev, payment_method: currentMethod, credit_pin_verified: true, pin_verified: true } : prev);
      setPinSuccess('PIN verified successfully! Staff notified at cashier station.');
    } catch (err: any) {
      setPinError(err?.message || 'Incorrect PIN. Please check and re-enter your 6-digit authorization PIN.');
    } finally {
      setPinSubmitting(false);
    }
  };

  // Track previous order ID to only reset tab views when switching to a completely new order
  const prevOrderIdRef = useRef<string | null>(null);

  // Sync initial order and enforce payment view for pay-first or tracker view unless bill was already requested
  useEffect(() => {
    setLiveOrder(order);
    if (!order) return;

    if (order.status === 'AWAITING_PAYMENT') {
      setViewMode('payment');
      prevOrderIdRef.current = order.id;
    } else {
      // If order is no longer awaiting payment, switch away from payment view to tracker view
      setViewMode((curr) => (curr === 'payment' ? 'tracker' : curr));
      if (order.id !== prevOrderIdRef.current) {
        prevOrderIdRef.current = order.id;
        setViewMode(order.bill_requested ? 'bill' : 'tracker');
        setBillRequested(Boolean(order.bill_requested));
        const isPayFirst = Boolean(order.pay_first);
        const isActuallySettled = isPayFirst
          ? order.status === 'COMPLETED'
          : (order.payment_status === 'PAID' || order.status === 'COMPLETED');
        setIsPaid(isActuallySettled);
        setBillSuccessMessage(null);
      } else if (order.bill_requested) {
        setBillRequested(true);
      }
    }
  }, [order]);

  // Subscribe to real-time status changes via Socket.io
  useEffect(() => {
    if (!order?.id || !order?.business_id) return;

    if (order.table_id) {
      socketService.joinTable(order.business_id, order.table_id);
    }

    const unsubscribe = socketService.subscribeToOrders((data) => {
      if (!data || data.id !== order.id) return;
      setLiveOrder((prev) => ({
        ...(prev || order),
        ...data,
        subtotal: Number(data.subtotal ?? prev?.subtotal ?? 0),
        total_amount: Number(data.total_amount ?? prev?.total_amount ?? 0),
      }));

      if (data.bill_requested) {
        setBillRequested(true);
      }
      if (data.status !== undefined) {
        if (data.status === 'AWAITING_PAYMENT') {
          setViewMode('payment');
        } else {
          setViewMode((currMode) => (currMode === 'payment' ? 'tracker' : currMode));
          if (data.status === 'CANCELLED') {
            alert('Payment was rejected: ' + (data.payment_rejected_reason || 'No reason provided'));
          }
        }
      }
      // For pay-first, wait until the order is COMPLETED (delivered).
      // For non-pay-first, PAID or COMPLETED usually means the bill is settled.
      const isPayFirst = Boolean(data.pay_first ?? liveOrder?.pay_first ?? order.pay_first);
      const isActuallySettled = isPayFirst 
        ? data.status === 'COMPLETED'
        : (data.payment_status === 'PAID' || data.status === 'COMPLETED');

      if (isActuallySettled) {
        setIsPaid(true);
        if (onSettled) {
          onSettled(order.id, data.table_number || order.table_number, { ...order, ...data } as TableOrder);
        }
      }
    });

    return () => unsubscribe();
  }, [order?.id, order?.business_id, onSettled]);

  // Load configured tax settings for the business in real time
  useEffect(() => {
    const bizId = liveOrder?.business_id || order?.business_id;
    if (!bizId) return;

    rbacService.getTaxConfigApi(bizId).then((cfg) => {
      if (cfg) setTaxConfig(cfg);
    }).catch(() => {});
  }, [liveOrder?.business_id, order?.business_id]);

  // Promo Code Actions (Respecting Business Tax/Promo Configuration)
  
  useEffect(() => {
    let timer: any;
    if (waiterCooldown > 0) {
      timer = setTimeout(() => setWaiterCooldown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [waiterCooldown]);

  const handleCallWaiter = async () => {
    if (!liveOrder?.business_id || !liveOrder?.table_id) return;
    setIsCallingWaiter(true);
    try {
      const pingId = `call-${liveOrder.table_id || liveOrder.id}`;
      await rbacService.createServiceRequestApi({
        id: pingId,
        type: 'CALL_WAITER',
        business_id: liveOrder.business_id,
        table_id: liveOrder.table_id,
        table_number: liveOrder.table_number,
        order_id: liveOrder.id,
        order_number: liveOrder.order_number,
        customer_name: liveOrder.customer_name || 'Table Guest',
        status: 'PENDING',
      });
      setWaiterCooldown(60);
    } catch (err) {
      console.error('Failed to call waiter', err);
    } finally {
      setIsCallingWaiter(false);
    }
  };

  const [promoRemovedByUser, setPromoRemovedByUser] = useState(false);

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
        description:
          taxConfig.active_promo_description || `${taxConfig.active_promo_percent || 10}% Off Voucher`,
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

  const handleApplyPromo = () => {
    if (!isPromoVisible) {
      setPromoError('Promotional voucher codes are currently disabled by the restaurant.');
      return;
    }
    const clean = promoInput.trim().toUpperCase();
    if (!clean) {
      setPromoError('Please enter a promo code.');
      return;
    }

    // Check if the business has an active promo code configured and enabled
    if (taxConfig?.active_promo_enabled && taxConfig.active_promo_code) {
      if (clean === taxConfig.active_promo_code.toUpperCase()) {
        setPromoRemovedByUser(false);
        setAppliedPromo({
          code: clean,
          discountPercent: taxConfig.active_promo_percent || 10,
          description: taxConfig.active_promo_description || `${taxConfig.active_promo_percent || 10}% Off Voucher`,
        });
        setPromoError(null);
        setPromoInput('');
        return;
      }
      setPromoError(`Invalid promo code. Active restaurant offer is ${taxConfig.active_promo_code}.`);
      return;
    }

    setPromoError('No active promotional discount codes are currently running.');
  };

  const handleQuickApplyCode = (code: string) => {
    if (taxConfig?.active_promo_enabled && taxConfig.active_promo_code === code) {
      setPromoRemovedByUser(false);
      setAppliedPromo({
        code,
        discountPercent: taxConfig.active_promo_percent || 10,
        description: taxConfig.active_promo_description || `${taxConfig.active_promo_percent || 10}% Off Voucher`,
      });
      setPromoError(null);
      setPromoInput('');
    }
  };

  const handleRemovePromo = () => {
    setPromoRemovedByUser(true);
    setAppliedPromo(null);
    setPromoError(null);
  };

  // Requirement: Final bill gating - all non-cancelled items must be served
  const currentOrder = liveOrder || order;

  const nonCancelledItems = useMemo(() => {
    return (currentOrder?.items || []).filter((i) => i.status !== 'CANCELLED');
  }, [currentOrder?.items]);

  const allItemsServed = useMemo(() => {
    if (!currentOrder || !Array.isArray(nonCancelledItems) || nonCancelledItems.length === 0) {
      return false;
    }
    return nonCancelledItems.every((i) => i.status === 'SERVED' || i.status === 'COMPLETED' || Boolean(i.served_at));
  }, [currentOrder, nonCancelledItems]);

  const unservedCount = useMemo(() => {
    return nonCancelledItems.filter((i) => i.status !== 'SERVED' && i.status !== 'COMPLETED' && !i.served_at).length;
  }, [nonCancelledItems]);

  // When dishes are unserved, strictly lock customer to the live tracker view unless bill was already requested
  useEffect(() => {
    if (!allItemsServed && !billRequested && viewMode === 'bill') {
      setViewMode('tracker');
    }
  }, [allItemsServed, billRequested, viewMode]);

  // Base Items Menu Sum (Non-cancelled items)
  const itemsMenuTotal = useMemo(() => {
    return nonCancelledItems.reduce((acc, it) => {
      const qty = Number(it.quantity) || 1;
      const compQty = Math.max(0, Math.min(qty, Number(it.comp_qty) || 0));
      const isComp = Boolean(it.is_comp || compQty >= qty);
      const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
      return acc + (Number(it.price) || 0) * billedQty;
    }, 0);
  }, [nonCancelledItems]);

  const packagingFeeRate = Number(taxConfig?.packaging_fee) || 10;
  const packagingQty = useMemo(() => {
    if (liveOrder?.packaging_qty !== undefined && Number(liveOrder.packaging_qty) > 0) {
      return Number(liveOrder.packaging_qty);
    }
    return (liveOrder?.items || []).reduce((sum, it) => {
      return sum + Math.max(0, Number(it.pack_qty) || (it.is_packaged ? Number(it.quantity) || 1 : 0));
    }, 0);
  }, [liveOrder?.packaging_qty, liveOrder?.items]);

  const packagingCharge = useMemo(() => {
    if (liveOrder?.packaging_charge !== undefined && Number(liveOrder.packaging_charge) > 0) {
      return Number(liveOrder.packaging_charge);
    }
    return packagingQty * packagingFeeRate;
  }, [liveOrder?.packaging_charge, packagingQty, packagingFeeRate]);

  const billCalc = useMemo(() => {
    const savedFlatPromo =
      !appliedPromo && !promoRemovedByUser ? Number(liveOrder?.promo_discount) || 0 : 0;
    return calculateBillTotals({
      itemsMenuTotal,
      packagingTotal: packagingCharge,
      taxConfig,
      fallbackTaxes: liveOrder?.taxes,
      fallbackTaxAmount: liveOrder?.tax_amount,
      promoDiscountPercent: appliedPromo?.discountPercent || 0,
      flatDiscountAmount: savedFlatPromo,
    });
  }, [
    itemsMenuTotal,
    packagingCharge,
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
  const taxesList = billCalc.taxesList;
  const totalTax = billCalc.totalTax;
  const serviceChargeAmount = billCalc.serviceChargeAmount;
  const totalAmount = billCalc.grandTotal;
  const isInclusiveTax = billCalc.isInclusive;
  const currencySymbol = taxConfig?.currency_symbol || taxConfig?.currency || liveOrder?.currency || 'Rs.';

  /**
   * Resets the table back to default settings (status: 'ACTIVE', current_session_id: null)
   */
  const resetTableToDefaultSettings = async (businessId: string, tableId?: string, tableNumber?: string) => {
    try {
      await rbacService.resetTableStatusApi(businessId, tableId, tableNumber);
    } catch (err) {
      console.warn('API resetTableStatus note:', err);
    }
  };

  const handleRequestBillAction = async () => {
    if (!liveOrder?.id || !liveOrder?.business_id) return;
    if (!allItemsServed) {
      alert('Cannot request bill: All ordered dishes must be delivered and marked as served by the waiter first.');
      return;
    }
    setRequestingBill(true);

    try {
      await rbacService.requestBillApi(liveOrder.business_id, liveOrder.id, {
        payment_method: selectedPaymentMode,
        promo_code: appliedPromo?.code || null,
        promo_discount: promoDiscountAmount,
        total_amount: totalAmount,
        currency: currencySymbol,
        notes: `[WAITER BILL REQUESTED - ${currencySymbol} ${totalAmount.toLocaleString()}]`,
      });

      setBillRequested(true);
      setBillSuccessMessage(
        `Service staff at the Waiter Station has been notified! A waiter is bringing your bill folio folder to Table #${liveOrder?.table_number || ''}.`
      );

      if (onRequestBill) onRequestBill();
    } catch (err: any) {
      console.warn('Bill request error:', err);
      setBillRequested(true);
      setBillSuccessMessage(`Bill requested for Table #${liveOrder?.table_number || ''}. Waiter Station alerted.`);
    } finally {
      setRequestingBill(false);
    }
  };

  const handlePayAndSettleAction = async () => {
    if (!liveOrder?.id || !liveOrder?.business_id) return;
    if (!allItemsServed) {
      alert('Cannot request bill: All ordered dishes must be delivered and marked as served by the waiter first.');
      return;
    }
    setRequestingBill(true);

    try {
      const paymentLabel = 
        selectedPaymentMode === 'cash' ? 'Cash at Table' :
        selectedPaymentMode === 'qr' ? 'QR Code Payment' : 'Card / POS Terminal';

      await rbacService.requestBillApi(liveOrder.business_id, liveOrder.id, {
        payment_method: selectedPaymentMode.toUpperCase(),
        promo_code: appliedPromo?.code || null,
        promo_discount: promoDiscountAmount,
        total_amount: totalAmount,
        currency: currencySymbol,
        notes: `[PAYMENT SETTLEMENT REQUESTED: ${paymentLabel} - ${currencySymbol} ${totalAmount.toLocaleString()}]`,
      });

      // Empty cart and notify callbacks
      if (onClearCart) onClearCart();
      if (onRequestBillOrPaid) onRequestBillOrPaid();
      if (onRequestBill) onRequestBill();

      setBillRequested(true);
      setBillSuccessMessage(
        `Payment request of ${currencySymbol} ${totalAmount.toLocaleString()} via ${paymentLabel} sent! The Waiter Station has been pinged and service staff is on the way to Table #${liveOrder?.table_number || ''}.`
      );
    } catch (err: any) {
      console.error('Pay and settle error:', err);
      setBillRequested(true);
      setBillSuccessMessage(`Settlement requested for Table #${liveOrder?.table_number || ''}. Waiter Station alerted.`);
    } finally {
      setRequestingBill(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  // Status stage config
  const steps: { key: OrderStatus; label: string; desc: string; icon: React.ReactNode }[] = isPrintOnly
    ? [
        {
          key: 'RECEIVED',
          label: 'Ordered',
          desc: 'Paper KOT sent to kitchen',
          icon: <Clock className="w-4 h-4" />,
        },
        {
          key: 'SERVED',
          label: 'Delivered',
          desc: 'Served at your table',
          icon: <CheckCheck className="w-4 h-4" />,
        },
      ]
    : [
        {
          key: 'RECEIVED',
          label: 'Received',
          desc: 'Sent to Kitchen & Bar Queue',
          icon: <Clock className="w-4 h-4" />,
        },
        {
          key: 'PREPARING',
          label: 'Preparing',
          desc: 'Cook is crafting your dishes',
          icon: <Flame className="w-4 h-4" />,
        },
        {
          key: 'READY',
          label: 'Prepared',
          desc: 'Dishes ready for waiter pickup',
          icon: <ChefHat className="w-4 h-4" />,
        },
        {
          key: 'SERVED',
          label: 'Delivered',
          desc: 'Served at your table',
          icon: <CheckCheck className="w-4 h-4" />,
        },
      ];

  const getStepIndex = (status: OrderStatus) => {
    if (isPrintOnly) {
      if (status === 'SERVED' || status === 'COMPLETED') {
        return 1;
      }
      if (status === 'CANCELLED') {
        return -1;
      }
      return 0;
    }
    switch (status) {
      case 'PENDING':
      case 'AWAITING_PAYMENT':
      case 'RECEIVED':
        return 0;
      case 'PREPARING':
        return 1;
      case 'READY':
        return 2;
      case 'SERVED':
      case 'COMPLETED':
        return 3;
      case 'CANCELLED':
        return -1;
      default:
        return 0;
    }
  };

  const currentStatus: OrderStatus = liveOrder?.status || 'RECEIVED';
  const currentStepIdx = getStepIndex(currentStatus);

  const getStatusBadge = () => {
    if (isPrintOnly) {
      if (currentStatus === 'SERVED' || currentStatus === 'COMPLETED') {
        return {
          bg: 'bg-emerald-600',
          text: 'Delivered & Served to Table',
          sub: 'Enjoy your meal! Let us know if you need anything else.',
        };
      }
      if (currentStatus === 'CANCELLED') {
        return {
          bg: 'bg-rose-600',
          text: 'Order Cancelled',
          sub: 'This order has been cancelled by staff.',
        };
      }
      return {
        bg: 'bg-amber-600',
        text: 'Order Received & Dispatched',
        sub: `Paper KOT routed to kitchen. Food will be delivered to Table #${liveOrder?.table_number || ''}.`,
      };
    }
    switch (currentStatus) {
      case 'PREPARING':
        return {
          bg: 'bg-amber-500',
          text: 'Dishes are Being Prepared Fresh',
          sub: 'Chef & Bar staff are currently working on your items.',
        };
      case 'READY':
        return {
          bg: 'bg-blue-600',
          text: 'Dishes Prepared! Waiter Notified',
          sub: '',
        };
      case 'SERVED':
      case 'COMPLETED':
        return {
          bg: 'bg-emerald-600',
          text: 'Delivered & Served to Table',
          sub: 'Enjoy your meal! Let us know if you need anything else.',
        };
      case 'CANCELLED':
        return {
          bg: 'bg-rose-600',
          text: 'Order Cancelled',
          sub: 'This order has been cancelled by staff.',
        };
      default:
        return {
          bg: 'bg-emerald-600',
          text: 'Order Received by Kitchen',
          sub: 'Queued up on the kitchen & bar live display system.',
        };
    }
  };

  if (!isOpen || !liveOrder) {
    return null;
  }

  const badgeInfo = getStatusBadge();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto overscroll-contain">
      <div 
        id="order-success-modal"
        className={`w-full min-w-0 bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col my-auto transition-all ${
          viewMode === 'bill' 
            ? 'max-w-xl md:max-w-2xl max-h-[96vh] flex-1' 
            : 'max-w-lg md:max-w-xl max-h-[94vh]'
        }`}
      >
        {/* VIEW 1: LIVE ORDER TRACKER */}
        {viewMode === 'tracker' && (
          <>
            {/* Streamlined Compact Header (Significantly reduced vertical height for maximum dish visibility) */}
            <div className={`px-3.5 py-2 sm:px-4 sm:py-2.5 text-white transition-colors duration-300 relative ${badgeInfo.bg}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-white text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
                    {currentStatus === 'PREPARING' && <Flame className="w-4 h-4 text-amber-600 animate-pulse" />}
                    {currentStatus === 'READY' && <Bell className="w-4 h-4 text-blue-600 animate-bounce" />}
                    {(currentStatus === 'SERVED' || currentStatus === 'COMPLETED') && <CheckCheck className="w-4 h-4 text-emerald-600" />}
                    {currentStatus === 'RECEIVED' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    {currentStatus === 'CANCELLED' && <X className="w-4 h-4 text-rose-600" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] uppercase font-black tracking-widest text-white/90 bg-white/20 px-2 py-0.5 rounded-full">
                        Live Tracker
                      </span>
                      <span className="text-xs sm:text-sm font-black text-white truncate">
                        {badgeInfo.text}
                      </span>
                    </div>
                    {badgeInfo.sub ? (
                      <p className="text-[11px] text-white/90 truncate leading-tight">
                        {badgeInfo.sub}
                      </p>
                    ) : null}
                  </div>
                </div>

                <button
                  id="btn-close-tracker-top"
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition cursor-pointer shrink-0"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Live Order Progress Timeline */}
            <div className="bg-zinc-50 border-b border-zinc-200 px-3.5 py-1.5 sm:px-4 sm:py-2">
              <div className="flex items-center justify-between relative">
                {/* Connecting Bar */}
                <div className="absolute top-3 left-6 right-6 h-1 bg-zinc-200 -z-0">
                  <div 
                    className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, (currentStepIdx / (steps.length - 1)) * 100))}%`
                    }}
                  />
                </div>

                {steps.map((step, idx) => {
                  const isPast = idx < currentStepIdx;
                  const isCurrent = idx === currentStepIdx;

                  return (
                    <div key={step.key} className="flex flex-col items-center relative z-10 text-center flex-1">
                      <div 
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                          isPast
                            ? 'bg-amber-500 text-white'
                            : isCurrent
                            ? 'bg-amber-500 text-white ring-3 ring-amber-400/40 scale-105'
                            : 'bg-white text-zinc-400 border-2 border-zinc-200'
                        }`}
                      >
                        {isPast || (isCurrent && (step.key === 'SERVED' || currentStatus === 'COMPLETED')) ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          step.icon
                        )}
                      </div>
                      <span 
                        className={`text-[10px] font-bold mt-0.5 leading-tight ${
                          isCurrent ? 'text-amber-800 font-extrabold' : isPast ? 'text-amber-800' : 'text-zinc-400'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order Details Body */}
            <div className="p-3 sm:p-3.5 space-y-2.5 overflow-y-auto flex-1">
              {/* Table & Order Info Pills */}
              <div className="grid grid-cols-2 gap-2 px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200/80 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block leading-tight">Table Number</span>
                  <span className="font-extrabold text-zinc-900 text-sm leading-tight">
                    Table #{liveOrder?.table_number || ''}
                  </span>
                  {(liveOrder?.floor || liveOrder?.building) && (
                    <div className="text-[10px] text-zinc-500 leading-tight">
                      {[liveOrder?.floor, liveOrder?.building].filter(Boolean).join(' • ')}
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block leading-tight">Order Status</span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 leading-tight">
                    <span className={`w-2 h-2 rounded-full ${
                      currentStatus === 'READY' ? 'bg-blue-500 animate-ping' :
                      currentStatus === 'PREPARING' ? 'bg-amber-500 animate-pulse' :
                      currentStatus === 'SERVED' ? 'bg-emerald-500' : 'bg-emerald-600'
                    }`} />
                    <span>{isPrintOnly && (currentStatus === 'RECEIVED' || currentStatus === 'PREPARING' || currentStatus === 'READY') ? 'ORDERED' : currentStatus}</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400 truncate block leading-tight">
                    Ref: {liveOrder.order_number || liveOrder.id.slice(0, 8)}
                  </span>
                </div>
              </div>

              {/* Ordered Items Summary with Live Item-Level Status */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center justify-between">
                  <span>Dishes & Beverages Status</span>
                  <span>{liveOrder.items.length} items</span>
                </h4>

                {/* Granular Readiness Highlights */}
                {!isPrintOnly && liveOrder.items.some((it) => it.status === 'READY') && (
                  <div className="mb-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <ChefHat className="w-3.5 h-3.5 animate-bounce" />
                    </div>
                    <div className="text-xs leading-tight">
                      <div className="font-bold text-blue-950">
                        {liveOrder.items.filter((it) => it.status === 'READY').length} of {liveOrder.items.length} items prepared & ready!
                      </div>
                      <div className="text-blue-800 text-[11px] leading-tight">
                        The kitchen & bar have finished preparing these dishes. Waiter is assigned for delivery.
                      </div>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-zinc-100 bg-white rounded-xl border border-zinc-200/80 px-3 py-2">
                  {liveOrder.items.map((it, idx) => {
                    const isReady = it.status === 'READY';
                    const isServed = it.status === 'SERVED';
                    const isPreparing = it.status === 'PREPARING';

                    const qty = Number(it.quantity) || 1;
                    const compQty = Math.max(0, Math.min(qty, Number(it.comp_qty) || 0));
                    const isComp = Boolean(it.is_comp || compQty >= qty);
                    const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
                    const lineTotal = isComp ? 0 : (billedQty * (Number(it.price) || 0));

                    return (
                      <div key={idx} className="py-1.5 first:pt-0 last:pb-0 flex items-start justify-between gap-2 text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-zinc-900 text-xs sm:text-sm leading-tight">
                              {it.quantity}x {it.name}
                            </span>
                            {it.variant_name && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                                [{it.variant_name}]
                              </span>
                            )}
                            {Number(it.round_number) > 1 && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-900 border border-purple-300 font-bold flex items-center gap-0.5">
                                Round {it.round_number}
                              </span>
                            )}
                            {isComp && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-200/80 text-amber-900 border border-amber-300 font-bold">
                                🎁 Comp
                              </span>
                            )}
                            {!isComp && compQty > 0 && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 border border-amber-300 font-bold">
                                {compQty}x Comp
                              </span>
                            )}
                            {(Boolean(it.is_packaged) || (Number(it.pack_qty) || 0) > 0) && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-bold flex items-center gap-0.5">
                                <Package className="w-2.5 h-2.5 text-amber-700" />
                                {(Number(it.pack_qty) || 0) > 1 ? `${it.pack_qty}x Pack` : 'Pack'}
                              </span>
                            )}
                            {it.station === 'BAR' ? (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold flex items-center gap-0.5">
                                <Wine className="w-2.5 h-2.5" /> Bar
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold flex items-center gap-0.5">
                                <ChefHat className="w-2.5 h-2.5" /> Kitchen
                              </span>
                            )}
                          </div>

                          {/* Live Preparation Status Pill */}
                          <div className="flex items-center gap-1.5">
                            {isServed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCheck className="w-3 h-3 text-emerald-600" />
                                Served at table
                              </span>
                            ) : isPrintOnly ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-500" />
                                Order Placed
                              </span>
                            ) : isReady ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-xs animate-pulse">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                {it.station === 'BAR' ? 'Drink Prepared & Ready to Serve!' : 'Prepared & Ready to Serve!'}
                              </span>
                            ) : isPreparing ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                <Flame className="w-3 h-3 text-amber-500 animate-pulse" />
                                {it.station === 'BAR' ? 'Bartender is mixing drink...' : 'Chef is cooking in kitchen...'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                                <Clock className="w-3 h-3 text-zinc-400" />
                                In preparation queue
                              </span>
                            )}
                          </div>

                          {it.special_instructions && (
                            <div className="text-[10px] text-amber-700 italic leading-tight">
                              "{it.special_instructions}"
                            </div>
                          )}
                        </div>

                        <span className="font-mono font-bold text-zinc-800 shrink-0 notranslate">
                          {it.currency || liveOrder.currency} {lineTotal.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total & Quick Bill Callout with Full VAT & Tax Breakdown */}
              <div className="px-3 py-2 sm:px-3.5 sm:py-2.5 bg-amber-50/80 border border-amber-200/90 rounded-xl space-y-1.5 notranslate">
                <div className="space-y-0.5 text-xs">
                  {packagingQty > 0 && (
                    <div className="flex items-center justify-between text-amber-900/80 font-medium">
                      <span className="flex items-center gap-1">
                        <Package className="w-3.5 h-3.5 text-amber-700" />
                        <span>Packaging ({packagingQty} {packagingQty === 1 ? 'item' : 'items'})</span>
                      </span>
                      <span className="font-mono font-bold text-amber-950">
                        +{liveOrder.currency} {packagingCharge.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-amber-900/80 font-medium">
                    <span>Items Subtotal</span>
                    <span className="font-mono font-bold text-amber-950">
                      {liveOrder.currency} {itemsSubtotal.toFixed(2)}
                    </span>
                  </div>

                  {taxesList.length > 0 ? (
                    taxesList.map((tax, tIdx) => (
                      <div key={tIdx} className="flex items-center justify-between text-amber-800 text-xs">
                        <span className="font-medium">
                          {tax.name} ({tax.rate_percent}%)
                        </span>
                        <span className="font-mono font-bold text-amber-950">
                          +{currencySymbol} {tax.amount.toFixed(2)}
                        </span>
                      </div>
                    ))
                  ) : totalTax > 0 ? (
                    <div className="flex items-center justify-between text-amber-800 text-xs">
                      <span className="font-medium">VAT (13%)</span>
                      <span className="font-mono font-bold text-amber-950">
                        +{currencySymbol} {totalTax.toFixed(2)}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="pt-1.5 border-t border-amber-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-amber-950 block leading-tight">Current Table Total</span>
                    <span className="text-[10px] text-amber-700 leading-tight">
                      All items sent to kitchen & bar
                    </span>
                  </div>
                  <span className="text-lg font-black text-amber-950 font-mono">
                    {liveOrder.currency} {totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Actions: "Order More" and Delivered-Only Checkout */}
            <div className="px-3.5 py-2.5 bg-zinc-50 border-t border-zinc-200 flex flex-col gap-2">
              {/* If food is NOT yet served/delivered, hide checkout and display instructional notice */}
              {!allItemsServed && (
                <div className="px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-900">
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0 animate-pulse" />
                  <span className="text-[10px] sm:text-[11px] leading-tight">
                    <strong>Food in preparation ({unservedCount} pending):</strong> The "Check and confirm final bill" button will unlock once all dishes are delivered & marked as served to Table #{liveOrder?.table_number || ''}.
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-2">
                {isHost ? (
                  <Button
                    id="btn-order-more-items"
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={onOrderMore}
                    className="w-full sm:flex-1 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5 text-zinc-600" />
                    <span>Order More</span>
                  </Button>
                ) : (
                  <div className="w-full sm:flex-1 py-2 px-3 bg-amber-50 rounded-xl text-center border border-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>View-Only Guest</span>
                  </div>
                )}

                <Button
                  id="btn-call-waiter"
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={handleCallWaiter}
                  disabled={isCallingWaiter || waiterCooldown > 0}
                  className="w-full sm:flex-1 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Bell className={`w-3.5 h-3.5 ${waiterCooldown > 0 ? 'text-amber-500' : 'text-zinc-600'}`} />
                  <span>{waiterCooldown > 0 ? `Waiter Alerted (${waiterCooldown}s)` : 'Call Waiter'}</span>
                </Button>

                {/* Check and confirm final bill Button: Strictly gated by allItemsServed */}
                {allItemsServed && (
                  <Button
                    id="btn-view-final-bill"
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => {
                      if (!allItemsServed) return;
                      const freshOrder = liveOrder || order || undefined;
                      if (onOpenFinalBillPage) {
                        onOpenFinalBillPage(freshOrder);
                      } else {
                        setViewMode('bill');
                      }
                    }}
                    className="w-full sm:flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition"
                  >
                    <Receipt className="w-4 h-4 text-white" />
                    <span>{liveOrder?.pay_first ? 'View Paid Receipt' : isHost ? 'Check and confirm final bill' : 'View Final Bill Folio'}</span>
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {/* VIEW 2: FINAL BILLING & INVOICE */}
        
        {viewMode === 'payment' && (
          <>
            <div className="px-4 py-3 sm:px-5 sm:py-3.5 bg-zinc-900 text-white flex items-center justify-between border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h3 className="font-black text-base sm:text-lg text-white">Pay to Confirm Order</h3>
                  {liveOrder?.table_number && (
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950">
                      {liveOrder.table_number.toString().trim().toLowerCase().startsWith('table') ? liveOrder.table_number : `Table #${liveOrder.table_number}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                 {/* No close button, force them to stay on payment until confirmed or cancelled */}
              </div>
            </div>
            
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0 bg-zinc-50">
              {(() => {
                const isPinVerified = Boolean(liveOrder?.credit_pin_verified || (liveOrder as any)?.pin_verified || pinSuccess);
                return (
                  <div className={`p-4 sm:p-5 rounded-2xl border shadow-2xs transition-colors ${
                    isPinVerified
                      ? 'bg-emerald-50/90 text-emerald-950 border-emerald-300'
                      : 'bg-amber-50 text-amber-900 border-amber-200/90'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                              isPinVerified ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}></span>
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                              isPinVerified ? 'bg-emerald-600' : 'bg-amber-600'
                            }`}></span>
                          </span>
                          <h4 className={`font-extrabold text-sm sm:text-base ${
                            isPinVerified ? 'text-emerald-950' : 'text-amber-950'
                          }`}>
                            {isPinVerified ? 'Payment is Being processed by the Cashier' : 'Waiting for payment'}
                          </h4>
                        </div>
                        <p className={`text-xs leading-relaxed ${
                          isPinVerified ? 'text-emerald-800/90 font-medium' : 'text-amber-800/90'
                        }`}>
                          {isPinVerified
                            ? 'Your table authorization PIN has been verified. Cashier is reviewing and confirming your order to the kitchen!'
                            : 'Once confirmed, your order will automatically be sent to the kitchen!'}
                        </p>
                      </div>

                      <div className={`bg-white border-2 rounded-xl px-3.5 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between sm:flex-col sm:items-end gap-2 sm:gap-0.5 shrink-0 shadow-2xs ${
                        isPinVerified ? 'border-emerald-400' : 'border-amber-400/90'
                      }`}>
                        <span className={`text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider ${
                          isPinVerified ? 'text-emerald-800' : 'text-amber-800'
                        }`}>
                          Order Number
                        </span>
                        <span className="text-lg sm:text-2xl font-black font-mono text-zinc-950 tracking-tight">
                          #{liveOrder?.order_number ? liveOrder.order_number.toString().replace(/^#/, '') : (liveOrder?.id ? liveOrder.id.slice(0, 8).toUpperCase() : '')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
               
               <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm space-y-3">
                  <h4 className="font-bold text-zinc-900 border-b border-zinc-100 pb-2">How are you paying?</h4>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button 
                       onClick={() => {
                         if (!liveOrder) return;
                         rbacService.updateTableOrderPaymentMethodApi(liveOrder.id, liveOrder.business_id, 'QR_CODE').catch(()=>{});
                         setLiveOrder(prev => prev ? {...prev, payment_method: 'QR_CODE'} : prev);
                       }}
                       className={`p-2.5 sm:p-3 rounded-xl border-2 text-left transition-all ${liveOrder?.payment_method === 'QR_CODE' || liveOrder?.payment_method === 'UPI_QR' ? 'border-amber-500 bg-amber-50' : 'border-zinc-200 hover:border-zinc-300'}`}>
                       <div className="font-bold text-[13px] sm:text-sm text-zinc-900 flex justify-between items-center">
                          QR Code 
                          {(liveOrder?.payment_method === 'QR_CODE' || liveOrder?.payment_method === 'UPI_QR') && <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 ml-1" />}
                       </div>
                       <div className="text-[10px] sm:text-xs text-zinc-500 mt-1">Fonepay / UPI</div>
                    </button>
                    
                    <button 
                       onClick={() => {
                         if (!liveOrder) return;
                         rbacService.updateTableOrderPaymentMethodApi(liveOrder.id, liveOrder.business_id, 'CASH').catch(()=>{});
                         setLiveOrder(prev => prev ? {...prev, payment_method: 'CASH'} : prev);
                       }}
                       className={`p-2.5 sm:p-3 rounded-xl border-2 text-left transition-all ${liveOrder?.payment_method === 'CASH' ? 'border-amber-500 bg-amber-50' : 'border-zinc-200 hover:border-zinc-300'}`}>
                       <div className="font-bold text-[13px] sm:text-sm text-zinc-900 flex justify-between items-center">
                          Cash
                          {liveOrder?.payment_method === 'CASH' && <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 ml-1" />}
                       </div>
                       <div className="text-[10px] sm:text-xs text-zinc-500 mt-1">Pay at counter</div>
                    </button>

                    <button 
                       onClick={() => {
                         if (!liveOrder) return;
                         rbacService.updateTableOrderPaymentMethodApi(liveOrder.id, liveOrder.business_id, 'CARD').catch(()=>{});
                         setLiveOrder(prev => prev ? {...prev, payment_method: 'CARD'} : prev);
                       }}
                       className={`p-2.5 sm:p-3 rounded-xl border-2 text-left transition-all ${liveOrder?.payment_method === 'CARD' ? 'border-amber-500 bg-amber-50' : 'border-zinc-200 hover:border-zinc-300'}`}>
                       <div className="font-bold text-[13px] sm:text-sm text-zinc-900 flex justify-between items-center">
                          Card
                          {liveOrder?.payment_method === 'CARD' && <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 ml-1" />}
                       </div>
                       <div className="text-[10px] sm:text-xs text-zinc-500 mt-1">Swipe at counter</div>
                    </button>

                    <button 
                       onClick={() => {
                         if (!liveOrder) return;
                         setPinError(null);
                         setPinSuccess(null);
                         setLiveOrder(prev => prev ? {...prev, payment_method: 'CREDIT'} : prev);
                         rbacService.updateTableOrderPaymentMethodApi(liveOrder.id, liveOrder.business_id, 'CREDIT').catch(()=>{});
                       }}
                       className={`p-2.5 sm:p-3 rounded-xl border-2 text-left transition-all ${liveOrder?.payment_method === 'CREDIT' ? 'border-purple-600 bg-purple-50' : 'border-zinc-200 hover:border-zinc-300'}`}>
                       <div className="font-bold text-[13px] sm:text-sm text-zinc-900 flex justify-between items-center">
                          Credit
                          {liveOrder?.payment_method === 'CREDIT' && <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0 ml-1" />}
                       </div>
                       <div className="text-[10px] sm:text-xs text-purple-700 mt-1">Table credit ledger</div>
                    </button>

                    <button 
                       onClick={() => {
                         if (!liveOrder) return;
                         setPinError(null);
                         setPinSuccess(null);
                         setLiveOrder(prev => prev ? {...prev, payment_method: 'DEDUCT_FROM_DEPOSIT'} : prev);
                         rbacService.updateTableOrderPaymentMethodApi(liveOrder.id, liveOrder.business_id, 'DEDUCT_FROM_DEPOSIT').catch(()=>{});
                       }}
                       className={`p-2.5 sm:p-3 rounded-xl border-2 text-left transition-all ${liveOrder?.payment_method === 'DEDUCT_FROM_DEPOSIT' ? 'border-emerald-600 bg-emerald-50' : 'border-zinc-200 hover:border-zinc-300'}`}>
                       <div className="font-bold text-[13px] sm:text-sm text-zinc-900 flex justify-between items-center">
                          Deduct Deposit
                          {liveOrder?.payment_method === 'DEDUCT_FROM_DEPOSIT' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 ml-1" />}
                       </div>
                       <div className="text-[10px] sm:text-xs text-emerald-700 mt-1">Advance deposit pool</div>
                    </button>
                  </div>

                  {(liveOrder?.payment_method === 'CREDIT' || liveOrder?.payment_method === 'DEDUCT_FROM_DEPOSIT') && (
                    <div className="bg-purple-50/80 p-3.5 rounded-xl border border-purple-200 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                          <KeyRound className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <h5 className="font-bold text-xs text-purple-950">
                            {liveOrder.payment_method === 'CREDIT' ? 'Table Credit Authorization' : 'Advance Deposit Authorization'}
                          </h5>
                          <p className="text-[10px] text-purple-700">
                            Enter the 6-digit PIN assigned to your table to verify this order with cashier staff.
                          </p>
                        </div>
                      </div>

                      {liveOrder.credit_pin_verified || (liveOrder as any).pin_verified ? (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-bold">
                          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <div>🛡️ PIN Verified & Authorized</div>
                            <div className="text-[10px] font-normal text-emerald-700">Staff POS station has received your verified badge.</div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              maxLength={6}
                              inputMode="numeric"
                              value={pinInput}
                              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              placeholder="6-digit PIN"
                              className="w-32 px-3 py-1.5 bg-white border border-purple-300 rounded-xl text-center text-xs font-mono font-bold tracking-widest text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                            />
                            <button
                              type="button"
                              onClick={handleAuthorizePin}
                              disabled={pinSubmitting || pinInput.length !== 6}
                              className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 flex items-center gap-1.5"
                            >
                              {pinSubmitting ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Verifying...</span>
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>Authorize & Confirm</span>
                                </>
                              )}
                            </button>
                          </div>

                          {pinError && (
                            <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-1.5">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>{pinError}</span>
                            </div>
                          )}

                          {pinSuccess && (
                            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              <span>{pinSuccess}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  
                  
                  {(liveOrder?.payment_method === 'QR_CODE' || liveOrder?.payment_method === 'UPI_QR') && (
                     <div className="bg-zinc-50 p-4 rounded-xl text-center border border-zinc-200 flex flex-col items-center">
                        <div className="w-40 h-40 bg-zinc-200 rounded-lg flex items-center justify-center mb-2 overflow-hidden shadow-sm">
                           {/* Using a placeholder for now, ideally it comes from business config */}
                           <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=pay+at+counter" alt="QR Code" className="w-full h-full object-cover" />
                        </div>
                        <p className="text-xs text-zinc-500">Scan this QR code with your banking app to pay.</p>
                     </div>
                  )}
               </div>
               
               {/* Bill Summary Reused */}
               <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 text-sm notranslate">
                 <div className="font-bold border-b border-zinc-100 pb-2 mb-2 flex items-center justify-between">
                   <span>Order Summary</span>
                   <span className="text-xs font-mono font-bold text-zinc-600 bg-zinc-100 px-2.5 py-0.5 rounded-md border border-zinc-200">
                     Order #{liveOrder?.order_number || (liveOrder?.id ? liveOrder.id.slice(0, 8).toUpperCase() : '')}
                   </span>
                 </div>
                 {liveOrder?.items?.map((item, idx) => {
                   const qty = Number(item.quantity) || 1;
                   const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || 0));
                   const isComp = Boolean(item.is_comp || compQty >= qty);
                   const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
                   const lineTotal = isComp ? 0 : (billedQty * (Number(item.price) || 0));

                   return (
                     <div key={idx} className="flex justify-between py-1.5 text-zinc-600">
                       <span>{item.quantity}x {item.name}{isComp ? ' (🎁 Comp)' : compQty > 0 ? ` (${compQty}x Comp)` : ''}</span>
                       <span className="font-medium text-zinc-900">{liveOrder.currency} {lineTotal.toFixed(2)}</span>
                     </div>
                   );
                 })}
                 
                 <div className="border-t border-zinc-100 mt-2 pt-2 space-y-1.5 text-xs text-zinc-500">
                    <div className="flex justify-between">
                       <span>Subtotal</span>
                       <span className="text-zinc-900">{currencySymbol} {itemsSubtotal.toFixed(2)}</span>
                    </div>
                    {taxesList.map((t, idx) => (
                       <div key={idx} className="flex justify-between">
                         <span>{t.name} ({t.rate_percent}%)</span>
                         <span className="text-zinc-900">+{currencySymbol} {t.amount.toFixed(2)}</span>
                       </div>
                    ))}
                    <div className="flex justify-between font-bold text-lg text-zinc-900 pt-2 border-t border-zinc-200 mt-2">
                       <span>Total to Pay</span>
                       <span className="text-amber-600">{currencySymbol} {totalAmount.toFixed(2)}</span>
                    </div>
                 </div>
               </div>
            </div>
          </>
        )}

        {viewMode === 'bill' && (
          <>
            {/* Bill Header */}
            <div className="px-4 py-3 sm:px-5 sm:py-3.5 bg-zinc-900 text-white flex items-center justify-between border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-base sm:text-lg text-white">Final Table Bill</h3>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950">
                      Table #{liveOrder?.table_number || ''}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
                    {liveOrder?.invoice_number ? `Invoice #${liveOrder.invoice_number}` : `Order #${liveOrder?.order_number || (liveOrder?.id ? liveOrder.id.slice(0, 8).toUpperCase() : 'ORD')}`} • Dine-In
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition cursor-pointer"
                  title="Print / Save Bill"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  id="btn-close-bill-modal"
                  type="button"
                  onClick={onClose}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Bill Content Body (Fluid Flex & Scrollable on Mobile/Zoom) */}
            <div className="p-3 sm:p-4 space-y-2.5 overflow-y-auto flex-1 min-h-0">
              {/* Table & Order Metadata Banner */}
              <div className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">Table</span>
                  <span className="font-extrabold text-zinc-900">Table #{liveOrder?.table_number || ''}</span>
                  {(liveOrder?.floor || liveOrder?.building) && (
                    <span className="text-[11px] text-zinc-500 block">
                      {[liveOrder?.floor, liveOrder?.building].filter(Boolean).join(' • ')}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">Date & Time</span>
                  <span className="font-bold text-zinc-800">
                    {new Date(liveOrder.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    {new Date(liveOrder.created_at || Date.now()).toLocaleDateString()}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">Payment Status</span>
                  <span className="inline-flex items-center gap-1 font-extrabold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md text-[11px] mt-0.5">
                    <Clock className="w-3 h-3" />
                    {billRequested ? 'Bill Requested' : 'Payment Due'}
                  </span>
                </div>
              </div>

              {/* Promo Code & Voucher Section in Customer Final Bill */}
              {isPromoVisible && (
                <div className="px-3 py-2.5 bg-amber-50/60 border border-amber-200/90 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                      <Tag className="w-4 h-4 text-amber-600" />
                      <span>Restaurant Promo Code & Voucher</span>
                    </div>
                    {appliedPromo && (
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Applied ({appliedPromo.discountPercent}% Off)
                      </span>
                    )}
                  </div>

                  {!appliedPromo ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
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
                          className="flex-1 bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-zinc-900 placeholder:text-zinc-400 placeholder:font-sans focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        />
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={handleApplyPromo}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-2 shrink-0 cursor-pointer"
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
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-150">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-emerald-900 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300">
                            {appliedPromo.code}
                          </span>
                          <span className="text-xs font-extrabold text-emerald-700">
                            -{appliedPromo.discountPercent}% Discount
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-800 font-medium">
                          {appliedPromo.description} • Saved <span className="notranslate font-mono font-bold">{currencySymbol} {promoDiscountAmount.toFixed(2)}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemovePromo}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-white rounded-lg transition cursor-pointer shrink-0"
                        title="Remove promo code"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Itemized Table Bill */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 flex items-center justify-between">
                  <span>Itemized Order Details</span>
                  <span>{liveOrder.items.length} items</span>
                </h4>

                <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100 bg-white">
                  {liveOrder.items.map((it, idx) => {
                    const qty = Number(it.quantity) || 1;
                    const compQty = Math.max(0, Math.min(qty, Number(it.comp_qty) || 0));
                    const isComp = Boolean(it.is_comp || compQty >= qty);
                    const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
                    const lineTotal = isComp ? 0 : (billedQty * (Number(it.price) || 0));

                    return (
                      <div key={idx} className="px-3 py-1.5 flex items-start sm:items-center justify-between gap-2 text-xs hover:bg-zinc-50/50 transition">
                        <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-zinc-900 break-words">
                              {it.name}
                            </span>
                            {Number(it.round_number) > 1 && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-900 border border-purple-300 font-bold flex items-center gap-0.5">
                                Round {it.round_number}
                              </span>
                            )}
                            {isComp && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-200/80 text-amber-900 border border-amber-300 font-bold">
                                🎁 Comp
                              </span>
                            )}
                            {!isComp && compQty > 0 && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 border border-amber-300 font-bold">
                                {compQty}x Comp
                              </span>
                            )}
                            {(Boolean(it.is_packaged) || (Number(it.pack_qty) || 0) > 0) && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-bold flex items-center gap-0.5">
                                <Package className="w-2.5 h-2.5 text-amber-700" />
                                {(Number(it.pack_qty) || 0) > 1 ? `${it.pack_qty}x Pack` : 'Pack'}
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
                          <div className="text-[11px] text-zinc-500 notranslate">
                            {isComp ? (
                              <span className="font-semibold text-emerald-700">Complimentary (Rs. 0.00)</span>
                            ) : compQty > 0 ? (
                              <span>{billedQty} × {currencySymbol} {Number(it.price).toFixed(2)} (+{compQty}x Comp)</span>
                            ) : (
                              <span>{it.quantity} × {currencySymbol} {Number(it.price).toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-zinc-900 text-sm shrink-0 pt-0.5 sm:pt-0 notranslate">
                          {currencySymbol} {lineTotal.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tax & Total Calculation Configured From Tax System */}
              <div className="px-3 py-2.5 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-1 text-xs notranslate">
                {packagingQty > 0 && (
                  <div className="flex items-center justify-between text-zinc-600">
                    <span className="flex items-center gap-1 text-zinc-700 font-medium">
                      <Package className="w-3.5 h-3.5 text-amber-600" />
                      <span>Packaging ({packagingQty} {packagingQty === 1 ? 'item' : 'items'})</span>
                    </span>
                    <span className="font-mono font-semibold text-zinc-800">
                      +{currencySymbol} {packagingCharge.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Items Subtotal</span>
                  <span className="font-mono font-semibold text-zinc-800">
                    {currencySymbol} {itemsSubtotal.toFixed(2)}
                  </span>
                </div>

                {/* Configured Tax System Rates */}
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

                <div className="pt-2 border-t border-zinc-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-zinc-800 block">Total Amount Payable</span>
                  </div>
                  <span className="text-2xl font-black text-zinc-950 font-mono">
                    {currencySymbol} {totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              

              {/* End of content */}
            </div>

            {/* Bill Footer Actions */}
            <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-zinc-50 border-t border-zinc-200 flex flex-col gap-2 shrink-0">
              {!billRequested ? (
                <div className="flex flex-col gap-2">
                  {!allItemsServed && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center gap-2.5">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
                      <div>
                        <strong className="block font-bold">Dishes In Preparation</strong>
                        <span className="text-[11px] text-amber-800">
                          {unservedCount} dish{unservedCount > 1 ? 'es' : ''} not yet served. Final bill can only be requested once all ordered items are delivered & served to Table #{liveOrder?.table_number || ''}.
                        </span>
                      </div>
                    </div>
                  )}

                  <Button
                    id="btn-request-bill-staff"
                    type="button"
                    variant="primary"
                    size="md"
                    disabled={!allItemsServed || requestingBill}
                    onClick={() => {
                      if (!allItemsServed) return;
                      handleRequestBillAction();
                    }}
                    className={`w-full py-3 text-xs font-black shadow-md flex items-center justify-center gap-2 ${
                      !allItemsServed
                        ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                        : 'cursor-pointer bg-zinc-950 hover:bg-zinc-800 text-white'
                    }`}
                  >
                    <Receipt className="w-4 h-4 text-amber-400" />
                    <span>Request Waiter with Bill <span className="notranslate font-mono font-bold">({currencySymbol} {totalAmount.toFixed(2)})</span></span>
                  </Button>

                  
                </div>
              ) : (
                /* Displaced in place of the two buttons */
                <div id="bill-request-dispatched-notice" className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-4 bg-emerald-50 border-2 border-emerald-500 rounded-2xl flex items-start gap-3 shadow-xs">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                          Bill Request Dispatched
                        </strong>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 animate-pulse">
                          Waiter Pinged
                        </span>
                      </div>
                      <p className="text-xs text-emerald-900 font-medium leading-relaxed">
                        {billSuccessMessage || `Service staff at the Waiter Station has been notified! A waiter is bringing your bill folio folder to Table #${liveOrder?.table_number || ''}.`}
                      </p>
                      
                      

                      <div className="text-[11px] text-emerald-800 font-semibold pt-1 border-t border-emerald-200/60 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        <span>Table #{liveOrder?.table_number || ''} • Service staff on the way</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

