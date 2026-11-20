import { Bell } from 'lucide-react';
import React, { useState, useEffect, useMemo, useRef } from 'react';

import { MenuItem, MenuCategory, CartItem, TableOrder, CustomerTableSession, MenuItemVariant, MenuStatus, FoodType, BusinessTaxConfig } from '../types/rbac';
import { Business } from '../types/auth';
import { computeOrderBillableAmounts } from '../utils/taxCalculations';
import { useAuth } from '../context/AuthContext';
import { rbacService } from '../services/rbac.service';
import { socketService } from '../services/socket.service';
import { getAllItemCategories, itemMatchesCategory } from '../utils/menuUtils';
import { CustomerCartModal } from '../components/cart/CustomerCartModal';
import { CompConfirmationPage } from '../components/cart/CompConfirmationPage';
import { OrderSuccessModal } from '../components/cart/OrderSuccessModal';
import { MenuItemDetailModal } from '../components/menu/MenuItemDetailModal';
import { FinalTableBillPage } from '../components/billing/FinalTableBillPage';
import { getThemeClasses } from '../utils/themeEngine';
import { useSyncedOperationsState } from '../hooks/useSyncedOperationsState';
import {
  UtensilsCrossed,
  Search,
  Clock,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Phone,
  MapPin,
  Flame,
  Info,
  ShoppingBag,
  Plus,
  Minus,
  QrCode,
  Building2,
  Layers,
  ChefHat,
  RefreshCw,
  AlertTriangle,
  Lock,
  LogOut,
  Moon,
  X,
  Receipt,
  FileText,
  Ban,
  Globe,
  ChevronDown
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import {
  SUPPORTED_LANGUAGES,
  getSavedCustomerLanguage,
  saveCustomerLanguage,
  applyLanguage,
  initGoogleTranslate,
} from '../utils/googleTranslate';

interface CustomerMenuPreviewPageProps {
  onNavigateBack?: () => void;
  onNavigate?: (path: string) => void;
}

const TABLE_SESSION_STORAGE_KEY = 'serveflow_customer_table_session';
const SESSION_EXPIRED_REASON_KEY = 'serveflow_session_expired_reason';
const SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours

const getActiveOrderStorageKeys = (bizId?: string | null, tableId?: string | null, tableNum?: string | null): string[] => {
  const b = bizId || 'biz';
  const keys: string[] = [];
  if (tableId) keys.push(`serveflow_active_order_${b}_${tableId}`);
  if (tableNum && tableNum !== tableId) keys.push(`serveflow_active_order_${b}_${tableNum}`);
  if (keys.length === 0) keys.push(`serveflow_active_order_${b}_default`);
  return keys;
};

export const cleanTableNumber = (num?: string | null): string => {
  if (!num) return '';
  return num.replace(/^(table\s*#?|#)/i, '').trim();
};

/**
 * MinimalistScrollContainer
 * A sleek, clean horizontal scroll container with:
 * - Hidden native browser scrollbars (no ugly lines cutting across cards or clipping highlights)
 * - A centered, compact mini scroll indicator bar (short length, e.g. 44px or 64px)
 * - Real-time scroll tracking with a gliding amber thumb
 * - Interactive click-to-scroll on the track
 * - Automatically hides the indicator if content fits without scrolling
 */
interface MinimalistScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  indicatorClassName?: string;
  trackWidth?: number; // width in pixels of the centered track (default: 44px)
}

const MinimalistScrollContainer: React.FC<MinimalistScrollContainerProps> = ({
  children,
  className = '',
  contentClassName = '',
  indicatorClassName = '',
  trackWidth = 44,
}) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [thumbWidth, setThumbWidth] = React.useState(16);

  const checkScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isScrollable = el.scrollWidth > el.clientWidth + 2;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const curProgress = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollLeft / maxScroll)) : 0;
    const visibleRatio = el.clientWidth / (el.scrollWidth || 1);
    const computedThumbWidth = Math.max(trackWidth >= 60 ? 28 : 12, Math.min(trackWidth * 0.55, Math.round(trackWidth * visibleRatio)));

    setCanScroll(isScrollable);
    setProgress(curProgress);
    setThumbWidth(computedThumbWidth);
  }, [trackWidth]);

  React.useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => checkScroll()) : null;
    if (ro) {
      ro.observe(el);
      Array.from(el.children).forEach((child) => ro.observe(child));
    }

    const handleWindowResize = () => checkScroll();
    window.addEventListener('resize', handleWindowResize);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [checkScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return;
    setProgress(Math.min(1, Math.max(0, el.scrollLeft / maxScroll)));
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const track = e.currentTarget;
    if (!el || !track) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const availableTrack = rect.width - thumbWidth;
    const ratio = availableTrack > 0 ? Math.max(0, Math.min(1, (clickX - thumbWidth / 2) / availableTrack)) : 0;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll > 0) {
      el.scrollTo({ left: ratio * maxScroll, behavior: 'smooth' });
    }
  };

  const maxTranslate = Math.max(0, trackWidth - thumbWidth);
  const translateX = progress * maxTranslate;

  const isMini = trackWidth < 60;

  return (
    <div className={`w-full min-w-0 ${className}`}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`overflow-x-auto scrollbar-none flex-nowrap ${contentClassName}`}
      >
        {children}
      </div>

      {canScroll && (
        <div className={`flex justify-center items-center ${indicatorClassName || 'pt-1 pb-0.5'}`}>
          {!isMini ? (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 shadow-2xs">
              <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 select-none leading-none">‹</span>
              <div
                onClick={handleTrackClick}
                style={{ width: `${trackWidth}px` }}
                className="h-2 bg-zinc-200 dark:bg-zinc-700/80 rounded-full overflow-hidden relative cursor-pointer group shadow-inner border border-zinc-300/60 dark:border-zinc-600/60"
                title="Scroll to view more items"
              >
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500 rounded-full shadow-xs ring-1 ring-amber-600/30 transition-all duration-75 group-hover:from-amber-600 group-hover:to-amber-700"
                  style={{
                    width: `${thumbWidth}px`,
                    transform: `translateX(${translateX}px)`,
                  }}
                />
              </div>
              <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 select-none leading-none">›</span>
            </div>
          ) : (
            <div
              onClick={handleTrackClick}
              style={{ width: `${trackWidth}px` }}
              className="h-1.5 bg-black/15 dark:bg-white/20 rounded-full overflow-hidden relative cursor-pointer group shadow-2xs"
              title="Scroll indicator"
            >
              <div
                className="h-full bg-amber-500 dark:bg-amber-400 rounded-full transition-all duration-75 group-hover:bg-amber-600 dark:group-hover:bg-amber-300"
                style={{
                  width: `${thumbWidth}px`,
                  transform: `translateX(${translateX}px)`,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function consolidateTableOrders(orders: TableOrder[], sessionId?: string | null): TableOrder | null {
  const activeRaw = orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'COMPLETED' && !(o as any).settled);
  if (activeRaw.length === 0) return null;

  const sessionScoped = sessionId
    ? activeRaw.filter((o) => !o.session_id || o.session_id === sessionId)
    : activeRaw;
  const active = sessionScoped.length > 0 ? sessionScoped : activeRaw;
  if (active.length === 1) return active[0];

  active.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const root = active[0];
  const allItems = active.flatMap((o) => o.items || []);
  const subtotal = active.reduce((s, o) => s + (Number(o.subtotal) || 0), 0);
  const pkgCharge = active.reduce((s, o) => s + (Number(o.packaging_charge) || 0), 0);
  const pkgQty = active.reduce((s, o) => s + (Number(o.packaging_qty) || 0), 0);
  const tax = active.reduce((s, o) => s + (Number(o.tax_amount) || 0), 0);
  const total = active.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const billReq = active.some((o) => o.bill_requested);

  const nonCancelled = allItems.filter((i) => i && i.status !== 'CANCELLED');
  let derivedStatus = root.status;
  if (active.some((o) => o.status === 'AWAITING_PAYMENT')) {
    derivedStatus = 'AWAITING_PAYMENT';
  } else if (nonCancelled.length > 0) {
    const allServed = nonCancelled.every((i) => i.status === 'SERVED' || i.status === 'COMPLETED' || Boolean(i.served_at));
    const allReadyOrServed = nonCancelled.every((i) => i.status === 'READY' || i.status === 'SERVED' || i.status === 'COMPLETED' || Boolean(i.ready_at) || Boolean(i.served_at));
    const anyPrepOrReady = nonCancelled.some((i) => i.status === 'PREPARING' || i.status === 'READY' || (i.status as any) === 'COOKING');
    if (allServed) derivedStatus = 'SERVED';
    else if (allReadyOrServed) derivedStatus = 'READY';
    else if (anyPrepOrReady) derivedStatus = 'PREPARING';
    else derivedStatus = 'RECEIVED';
  }

  return {
    ...root,
    status: derivedStatus,
    pay_first: active.some((o) => o.pay_first && o.status === 'AWAITING_PAYMENT') ? true : root.pay_first,
    items: allItems,
    subtotal,
    packaging_charge: pkgCharge,
    packaging_qty: pkgQty,
    tax_amount: tax,
    total_amount: total,
    bill_requested: billReq,
  };
}

export const CustomerMenuPreviewPage: React.FC<CustomerMenuPreviewPageProps> = ({
  onNavigateBack,
  onNavigate,
}) => {
  const { user } = useAuth();
  const [businessProfile, setBusinessProfile] = useState<Business | null>(() => {
    if (user?.business) return user.business;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const bizId = urlParams.get('businessId');
      if (bizId) {
        const cachedBiz = localStorage.getItem(`serveflow_biz_${bizId}`);
        if (cachedBiz) return JSON.parse(cachedBiz);
      }
      const cached = localStorage.getItem('serveflow_customer_business_profile');
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  });
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const userManuallySelectedCategoryRef = useRef(false);
  const prevBizIdRef = useRef<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'veg' | 'non-veg'>('all');
  const [selectedVariants, setSelectedVariants] = useState<Record<string, MenuItemVariant>>({});

  // Table Information parsed from URL query params or verified sessionStorage
  const [tableParams, setTableParams] = useState<{
    businessId?: string;
    tableId?: string;
    tableNumber?: string;
    floor?: string | null;
    building?: string | null;
    sessionId?: string | null;
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
  }>({});

  const [isCompConfirmOpen, setIsCompConfirmOpen] = useState(false);
  const [pendingCompCartItems, setPendingCompCartItems] = useState<CartItem[]>([]);
  const [pendingCompNotes, setPendingCompNotes] = useState<string>('');
  const [taxConfig, setTaxConfig] = useState<BusinessTaxConfig | null>(null);

  const isExplicitAdminPreview = Boolean(onNavigateBack || window.location.pathname === '/menu-preview');

  // Session Security & Expiration States (Option A)
  const [sessionExpired, setSessionExpired] = useState<boolean>(() => {
    if (isExplicitAdminPreview) return false;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const pathParts = window.location.pathname.split('/');
      const hasQr = Boolean(urlParams.get('tableId') || urlParams.get('t') || urlParams.get('tableNumber') || (pathParts[1] === 't' && pathParts[2]));
      if (hasQr) return false;
      const hasActiveSession = Boolean(localStorage.getItem(TABLE_SESSION_STORAGE_KEY) || sessionStorage.getItem(TABLE_SESSION_STORAGE_KEY));
      if (hasActiveSession) return false;
      return Boolean(localStorage.getItem(SESSION_EXPIRED_REASON_KEY));
    } catch {
      return false;
    }
  });
  const [sessionExpiredReason, setSessionExpiredReason] = useState<string | null>(() => {
    if (isExplicitAdminPreview) return null;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const pathParts = window.location.pathname.split('/');
      const hasQr = Boolean(urlParams.get('tableId') || urlParams.get('t') || urlParams.get('tableNumber') || (pathParts[1] === 't' && pathParts[2]));
      if (hasQr) return null;
      const hasActiveSession = Boolean(localStorage.getItem(TABLE_SESSION_STORAGE_KEY) || sessionStorage.getItem(TABLE_SESSION_STORAGE_KEY));
      if (hasActiveSession) return null;
      return localStorage.getItem(SESSION_EXPIRED_REASON_KEY);
    } catch {
      return null;
    }
  });
  const sessionExpiredRef = useRef<boolean>(sessionExpired);
  useEffect(() => {
    sessionExpiredRef.current = sessionExpired;
  }, [sessionExpired]);

  // Group Ordering Authority States (Requirement 4: Host vs View-Only Guests)
  const [isHost, setIsHost] = useState<boolean>(true);
  const [hostToken, setHostToken] = useState<string | null>(null);

  // Menu Item Detail Modal States (Requirement 3: Compact Menu with click popup)
  const [selectedDetailItem, setSelectedDetailItem] = useState<MenuItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // Cart and Order States
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [successOrderData, setSuccessOrderData] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<TableOrder | null>(null);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [noOrderToast, setNoOrderToast] = useState(false);
  const lastTargetOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeOrder?.id) {
      lastTargetOrderIdRef.current = activeOrder.id;
    } else if (successOrderData?.id) {
      lastTargetOrderIdRef.current = successOrderData.id;
    }
  }, [activeOrder?.id, successOrderData?.id]);

  // Customer View Language Preference State (Headless Google Translate)
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    const saved = getSavedCustomerLanguage();
    if (saved) return saved;
    return businessProfile?.default_language || (businessProfile as any)?.operations_config?.default_language || 'en';
  });

  const hasUserCustomLanguage = useRef<boolean>(Boolean(getSavedCustomerLanguage()));

  // Initialize headless Google Translate element script
  useEffect(() => {
    if (selectedLanguage && selectedLanguage !== 'en') {
      initGoogleTranslate();
    } else {
      applyLanguage('en');
    }
  }, []);

  // When businessProfile loads: If customer has NOT manually chosen a language, apply venue default
  useEffect(() => {
    if (!hasUserCustomLanguage.current && businessProfile) {
      const venueDefault = businessProfile.default_language || (businessProfile as any)?.operations_config?.default_language || 'en';
      setSelectedLanguage(venueDefault);
      applyLanguage(venueDefault);
    } else if (hasUserCustomLanguage.current) {
      const saved = getSavedCustomerLanguage();
      if (saved) {
        setSelectedLanguage(saved);
        applyLanguage(saved);
      }
    }
  }, [businessProfile?.default_language, (businessProfile as any)?.operations_config?.default_language]);

  const handleLanguageChange = (newLang: string) => {
    hasUserCustomLanguage.current = true;
    saveCustomerLanguage(newLang);
    setSelectedLanguage(newLang);
    applyLanguage(newLang);
    // Reload ensures Google Translate initializes and translates 100% of DOM nodes cleanly
    window.location.reload();
  };
  const formatPaymentMode = (pm?: string) => {
    if (!pm) return 'Cash';
    const upper = pm.toUpperCase();
    if (upper === 'CASH') return 'Cash';
    if (upper === 'CARD') return 'Card';
    if (upper === 'QR_CODE' || upper === 'UPI_QR' || upper === 'QR') return 'QR Code';
    return pm.replace(/_/g, ' ');
  };

  const [settledPaymentInfo, setSettledPaymentInfo] = useState<{
    mode?: string;
    amount?: number;
    currency?: string;
  } | null>(() => {
    try {
      const cached = localStorage.getItem('serveflow_last_settled_payment');
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (!parsed || typeof parsed.amount !== 'number' || isNaN(parsed.amount) || parsed.amount < 0) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const { storeStatus } = useSyncedOperationsState(
    businessProfile?.id || user?.business?.id,
    businessProfile?.operations_config,
    businessProfile?.current_operational_day
  );
  const isStoreOpen = !businessProfile ? true : storeStatus.isOpen;

  const [thankYouSettledBanner, setThankYouSettledBanner] = useState<{
    show: boolean;
    tableNumber?: string;
  }>({ show: false });

  // Dedicated Final Bill Page and Read-Only Menu Mode
  const [isFinalBillPageOpen, setIsFinalBillPageOpen] = useState<boolean>(false);
  const kickOutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTableBillConcluded, setIsTableBillConcluded] = useState<boolean>(() => {
    if (isExplicitAdminPreview) return false;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const pathParts = window.location.pathname.split('/');
      const hasQr = Boolean(urlParams.get('tableId') || urlParams.get('t') || urlParams.get('tableNumber') || (pathParts[1] === 't' && pathParts[2]));
      if (hasQr) return false;
      const stored = localStorage.getItem('serveflow_table_bill_concluded');
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const isTableBillConcludedRef = useRef<boolean>(isTableBillConcluded);
  useEffect(() => {
    isTableBillConcludedRef.current = isTableBillConcluded;
  }, [isTableBillConcluded]);

  // Read-only condition: Once final bill is requested, table bill concluded, or business day closed, no ordering is allowed
  const isReadOnlyMode = isTableBillConcluded || Boolean(activeOrder?.bill_requested) || !isStoreOpen;

  // Requirement 4: Final bill gating - all non-cancelled items must be served
  const allItemsServed = useMemo(() => {
    if (!activeOrder || !Array.isArray(activeOrder.items) || activeOrder.items.length === 0) {
      return false;
    }
    const nonCancelledItems = activeOrder.items.filter((i) => i.status !== 'CANCELLED');
    if (nonCancelledItems.length === 0) {
      return false;
    }
    return nonCancelledItems.every((i) => i.status === 'SERVED' || i.status === 'COMPLETED' || Boolean(i.served_at));
  }, [activeOrder]);

  // Requirement 1: Table-bound cart persistence key (null until table resolves)
  const tableCartStorageKey = useMemo(() => {
    const tId = tableParams.tableId || tableParams.tableNumber;
    return tId ? `serveflow_table_cart_${tId}` : null;
  }, [tableParams.tableId, tableParams.tableNumber]);

  const restoringCartForKeyRef = useRef<string | null>(null);

  // Restore cart from localStorage / sessionStorage on table parameter resolution
  useEffect(() => {
    if (!tableCartStorageKey) return;
    try {
      const altKey = tableParams.tableNumber && tableParams.tableId && tableParams.tableNumber !== tableParams.tableId
        ? `serveflow_table_cart_${tableParams.tableNumber}`
        : null;
      const savedCart =
        localStorage.getItem(tableCartStorageKey) ||
        sessionStorage.getItem(tableCartStorageKey) ||
        (altKey ? (localStorage.getItem(altKey) || sessionStorage.getItem(altKey)) : null);
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          restoringCartForKeyRef.current = tableCartStorageKey;
          setCartItems(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to restore cart from storage:', e);
    }
  }, [tableCartStorageKey]);

  // Persist cart to localStorage & sessionStorage on updates (StrictMode-safe: never wipe before restored state commits)
  useEffect(() => {
    if (!tableCartStorageKey) return;
    if (restoringCartForKeyRef.current === tableCartStorageKey) {
      if (cartItems.length === 0) {
        return;
      }
      restoringCartForKeyRef.current = null;
    }
    try {
      if (cartItems.length > 0) {
        const serialized = JSON.stringify(cartItems);
        localStorage.setItem(tableCartStorageKey, serialized);
        sessionStorage.setItem(tableCartStorageKey, serialized);
      } else {
        localStorage.removeItem(tableCartStorageKey);
        sessionStorage.removeItem(tableCartStorageKey);
      }
    } catch (e) {
      console.warn('Failed to persist cart to storage:', e);
    }
  }, [cartItems, tableCartStorageKey]);

  // Beforeunload warning prompt: "your cart items will be empty if you refresh"
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cartItems.length > 0) {
        const message = 'your cart items will be empty if you refresh';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [cartItems.length]);

  const handleOpenFinalBillPage = (orderOverride?: TableOrder | React.MouseEvent) => {
    const validOrder = (orderOverride && typeof orderOverride === 'object' && 'items' in orderOverride && Array.isArray((orderOverride as any).items))
      ? (orderOverride as TableOrder)
      : null;
    const currentActiveOrder = validOrder || activeOrder;
    if (validOrder) {
      setActiveOrder(validOrder);
    }
    const nonCancelledItems = (currentActiveOrder?.items || []).filter((i) => i.status !== 'CANCELLED');
    const isServed = nonCancelledItems.length > 0 && nonCancelledItems.every((i) => i.status === 'SERVED' || i.status === 'COMPLETED' || Boolean(i.served_at));

    // If not in read-only mode and not all non-cancelled items are served, block opening
    if (!isReadOnlyMode && !isServed) {
      alert('Final bill cannot be requested yet: All ordered dishes must be delivered and marked as served by the waiter first.');
      return;
    }
    // 1. Immediately wipe any pending cart items so customer cannot order
    setCartItems([]);
    setIsCartOpen(false);
    setIsTrackerOpen(false);
    setSuccessOrderData(null);
    // 2. Open dedicated Final Table Bill page (NOT a popup)
    pushCustomerHistoryGuard('bill');
    setIsFinalBillPageOpen(true);
  };

  const handleDoneReturnToMenu = (settledOrder?: TableOrder) => {
    setIsFinalBillPageOpen(false);
    setIsTableBillConcluded(true);
    try {
      localStorage.setItem('serveflow_table_bill_concluded', 'true');
    } catch {}
    setCartItems([]);
    setIsCartOpen(false);
    setIsTrackerOpen(false);
    handleOrderSettled(
      settledOrder?.id || activeOrder?.id,
      settledOrder?.table_number || tableParams.tableNumber,
      settledOrder || activeOrder
    );
  };

  const clearStoredSessionData = (bizId?: string | null, tableId?: string | null, tableNum?: string | null) => {
    try {
      sessionStorage.removeItem(TABLE_SESSION_STORAGE_KEY);
      sessionStorage.removeItem('serveflow_customer_active');
      sessionStorage.removeItem('serveflow_customer_last_url');
      localStorage.removeItem(TABLE_SESSION_STORAGE_KEY);
      const tIds = [tableId, tableNum].filter(Boolean) as string[];
      for (const tid of tIds) {
        sessionStorage.removeItem(`serveflow_table_cart_${tid}`);
        localStorage.removeItem(`serveflow_table_cart_${tid}`);
        localStorage.removeItem(`serveflow_host_token_${tid}`);
      }
      for (const k of getActiveOrderStorageKeys(bizId, tableId, tableNum)) {
        localStorage.removeItem(k);
      }
    } catch {}
  };

  const persistActiveOrder = (order: TableOrder | null, bizIdOverride?: string | null, tableIdOverride?: string | null, tableNumOverride?: string | null) => {
    if (!order) return;
    const isCancelledOrSettled =
      order.status === 'CANCELLED' ||
      (order.pay_first
        ? order.status === 'COMPLETED'
        : (order.status === 'COMPLETED' || order.payment_status === 'PAID' || Boolean((order as any).settled)));
    if (isCancelledOrSettled) return;
    const bId = bizIdOverride || order.business_id || tableParams.businessId || user?.business?.id;
    const tId = tableIdOverride || order.table_id || tableParams.tableId;
    const tNum = tableNumOverride || order.table_number || tableParams.tableNumber;
    if (!bId || (!tId && !tNum)) return;
    try {
      const [primaryKey] = getActiveOrderStorageKeys(bId, tId, tNum);
      localStorage.setItem(primaryKey, JSON.stringify(order));
    } catch {}
  };

  const expireCustomerSession = (
    reason: string,
    overrides?: { businessId?: string | null; tableId?: string | null; tableNumber?: string | null }
  ) => {
    const bId = overrides?.businessId ?? tableParams.businessId ?? activeOrder?.business_id;
    const tId = overrides?.tableId ?? tableParams.tableId ?? activeOrder?.table_id;
    const tNum = overrides?.tableNumber ?? tableParams.tableNumber ?? activeOrder?.table_number;

    setActiveOrder(null);
    setIsTrackerOpen(false);
    setIsCartOpen(false);
    setCartItems([]);
    setIsFinalBillPageOpen(false);
    setSuccessOrderData(null);
    lastTargetOrderIdRef.current = null;

    clearStoredSessionData(bId, tId, tNum);
    isTableBillConcludedRef.current = false;
    setIsTableBillConcluded(false);
    setSettledPaymentInfo(null);
    setThankYouSettledBanner({ show: false });
    try {
      localStorage.removeItem('serveflow_table_bill_concluded');
      localStorage.removeItem('serveflow_last_settled_payment');
      localStorage.setItem(SESSION_EXPIRED_REASON_KEY, reason);
    } catch {}

    sessionExpiredRef.current = true;
    setSessionExpired(true);
    setSessionExpiredReason(reason);
  };

  // Handle table settlement cleanup and thank-you notification
  const handleOrderSettled = (orderId?: string, tableNum?: string, orderObj?: TableOrder | null) => {
    // 1. Gather all possible candidate order objects in priority order
    const candidates = [orderObj, activeOrder, successOrderData].filter(Boolean) as TableOrder[];

    let cachedActiveOrder: TableOrder | null = null;
    try {
      const bId = tableParams.businessId || user?.business?.id || 'biz';
      for (const key of getActiveOrderStorageKeys(bId, tableParams.tableId, tableParams.tableNumber)) {
        const stored = localStorage.getItem(key);
        if (stored) {
          cachedActiveOrder = JSON.parse(stored);
          break;
        }
      }
    } catch {}
    if (cachedActiveOrder) {
      candidates.push(cachedActiveOrder);
    }

    let resolvedAmount: number | undefined;
    let resolvedCurrency: string = 'Rs.';
    let resolvedMode: string = 'Cash';

    for (const cand of candidates) {
      if (cand.currency && cand.currency.trim()) {
        resolvedCurrency = cand.currency.trim();
      }
      if (cand.payment_method && cand.payment_method.trim()) {
        resolvedMode = formatPaymentMode(cand.payment_method);
      }

      const rawAmt = cand.total_amount ?? cand.subtotal;
      if (rawAmt !== undefined && rawAmt !== null) {
        const amt = Number(rawAmt);
        if (!isNaN(amt) && amt >= 0) {
          resolvedAmount = amt;
          break;
        }
      }

      // Calculate from items if direct amount was undefined
      if (Array.isArray(cand.items) && cand.items.length > 0) {
        const candPkgComp =
          Boolean((cand as any).is_packaging_comp) ||
          (Number(cand.packaging_qty || 0) > 0 &&
            cand.packaging_charge !== undefined &&
            cand.packaging_charge !== null &&
            Number(cand.packaging_charge) === 0);
        const billable = computeOrderBillableAmounts(cand.items, {
          packagingFeeRate: Number(taxConfig?.packaging_fee ?? 10),
          isPackagingComp: candPkgComp,
          explicitPackagingCharge:
            cand.packaging_charge !== undefined && cand.packaging_charge !== null
              ? Number(cand.packaging_charge)
              : undefined,
        });
        resolvedAmount = billable.itemsMenuTotal + billable.packagingTotal;
        break;
      }
    }

    if (
      (resolvedAmount === undefined || isNaN(resolvedAmount)) &&
      typeof settledPaymentInfo?.amount === 'number' &&
      !isNaN(settledPaymentInfo.amount) &&
      settledPaymentInfo.amount >= 0
    ) {
      resolvedAmount = Number(settledPaymentInfo.amount);
      if (settledPaymentInfo.currency) resolvedCurrency = settledPaymentInfo.currency;
      if (settledPaymentInfo.mode) resolvedMode = settledPaymentInfo.mode;
    }

    if (resolvedAmount === undefined || isNaN(resolvedAmount)) {
      try {
        const cached = localStorage.getItem('serveflow_last_settled_payment');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (typeof parsed?.amount === 'number' && !isNaN(parsed.amount) && parsed.amount >= 0) {
            resolvedAmount = Number(parsed.amount);
            if (parsed.currency) resolvedCurrency = parsed.currency;
            if (parsed.mode) resolvedMode = parsed.mode;
          }
        }
      } catch {}
    }

    const hasResolvedAmount = typeof resolvedAmount === 'number' && !isNaN(resolvedAmount) && resolvedAmount >= 0;
    const info: { mode: string; amount?: number; currency: string } = {
      mode: resolvedMode,
      currency: resolvedCurrency,
      ...(hasResolvedAmount ? { amount: resolvedAmount } : {}),
    };

    setSettledPaymentInfo(info);
    if (hasResolvedAmount) {
      try {
        localStorage.setItem('serveflow_last_settled_payment', JSON.stringify(info));
      } catch {}
    }

    // 1. Wipe local active order and close all sub-modals/pages
    const bId = orderObj?.business_id || tableParams.businessId || activeOrder?.business_id || user?.business?.id;
    const tId = orderObj?.table_id || tableParams.tableId || activeOrder?.table_id;
    const tNum = tableNum || orderObj?.table_number || tableParams.tableNumber || activeOrder?.table_number;

    setActiveOrder(null);
    setIsTrackerOpen(false);
    setIsCartOpen(false);
    setCartItems([]);
    setIsFinalBillPageOpen(false);
    setSuccessOrderData(null);
    lastTargetOrderIdRef.current = null;

    // 2. Clear table session & order cache from storage
    clearStoredSessionData(bId, tId, tNum);
    try {
      localStorage.removeItem(SESSION_EXPIRED_REASON_KEY);
      localStorage.setItem('serveflow_table_bill_concluded', 'true');
    } catch {}

    // 3. Mark session concluded to automatically show thank-you card
    isTableBillConcludedRef.current = true;
    sessionExpiredRef.current = true;
    setIsTableBillConcluded(true);
    setSessionExpired(true);
    setSessionExpiredReason(
      'Your table order and billing process has been concluded. Thank you for dining with us!'
    );
    setThankYouSettledBanner({
      show: true,
      tableNumber: tNum,
    });
  };

  const navStateRef = useRef({
    isDetailModalOpen: false,
    isCartOpen: false,
    isTrackerOpen: false,
    hasSuccessOrderData: false,
    isFinalBillPageOpen: false,
    billRequested: false,
    awaitingPayment: false,
  });
  navStateRef.current = {
    isDetailModalOpen,
    isCartOpen,
    isTrackerOpen,
    hasSuccessOrderData: Boolean(successOrderData),
    isFinalBillPageOpen,
    billRequested: Boolean(activeOrder?.bill_requested),
    awaitingPayment: activeOrder?.status === 'AWAITING_PAYMENT' || successOrderData?.status === 'AWAITING_PAYMENT',
  };

  const recentCancelReasonRef = useRef<{ reason: string; at: number } | null>(null);

  const pushCustomerHistoryGuard = (view?: string) => {
    if (isExplicitAdminPreview) return;
    try {
      const targetUrl = (() => {
        const saved = sessionStorage.getItem('serveflow_customer_last_url');
        if (saved && saved.startsWith('/menu')) return saved;
        return window.location.href;
      })();
      if (view) {
        if (window.history.state?.view !== view) {
          window.history.pushState({ menuView: true, menuGuard: true, view }, '', targetUrl);
        }
      } else if (!window.history.state?.menuGuard) {
        window.history.pushState({ menuView: true, menuGuard: true }, '', targetUrl);
      }
    } catch {}
  };

  // Ensure at least one user-activated history guard exists on first tap/interaction (bypasses Chrome History Manipulation Intervention)
  useEffect(() => {
    if (isExplicitAdminPreview) return;
    const ensureGuardOnInteraction = () => {
      if (!window.history.state?.menuGuard) {
        pushCustomerHistoryGuard();
      }
    };
    window.addEventListener('pointerdown', ensureGuardOnInteraction, { passive: true });
    window.addEventListener('keydown', ensureGuardOnInteraction, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', ensureGuardOnInteraction);
      window.removeEventListener('keydown', ensureGuardOnInteraction);
    };
  }, [isExplicitAdminPreview]);

  // Hardware / Browser Back button interception (Trap popstate to avoid exiting web app or losing customer view)
  useEffect(() => {
    const handlePopState = () => {
      const s = navStateRef.current;
      const safeMenuUrl = (() => {
        try {
          const saved = sessionStorage.getItem('serveflow_customer_last_url');
          if (saved && saved.startsWith('/menu')) return saved;
        } catch {}
        return window.location.pathname.startsWith('/menu') ? window.location.href : '/menu';
      })();

      // If final bill page is open, bill has been requested, or pay-first payment is awaiting confirmation, stay locked!
      if (s.isFinalBillPageOpen || s.billRequested || s.awaitingPayment) {
        window.history.pushState({ billView: true, menuGuard: true }, '', safeMenuUrl);
        return;
      }

      // If modal/drawer is open, close it rather than navigating away
      if (s.isDetailModalOpen) {
        setIsDetailModalOpen(false);
        setSelectedDetailItem(null);
        window.history.pushState({ menuView: true, menuGuard: true }, '', safeMenuUrl);
        return;
      }
      if (s.isCartOpen) {
        setIsCartOpen(false);
        window.history.pushState({ menuView: true, menuGuard: true }, '', safeMenuUrl);
        return;
      }
      if (s.isTrackerOpen || s.hasSuccessOrderData) {
        setIsTrackerOpen(false);
        setSuccessOrderData(null);
        window.history.pushState({ menuView: true, menuGuard: true }, '', safeMenuUrl);
        return;
      }

      // If in Admin Preview mode, allow back button to return to Dashboard!
      if (onNavigateBack) {
        try {
          sessionStorage.removeItem('serveflow_customer_active');
          sessionStorage.removeItem('serveflow_customer_last_url');
          sessionStorage.removeItem(TABLE_SESSION_STORAGE_KEY);
        } catch {}
        onNavigateBack();
        return;
      }

      // Root menu: Keep unauthenticated customers safely on menu without losing progress!
      window.history.pushState({ menuView: true, menuGuard: true }, '', safeMenuUrl);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onNavigateBack]);

  const syncTableSessionAndOrders = async (params: {
    businessId?: string;
    tableId?: string;
    tableNumber?: string;
    sessionId?: string | null;
    cachedOrderId?: string;
  }) => {
    const { businessId, tableId, tableNumber, sessionId, cachedOrderId } = params;
    if (!businessId || !tableId) return;

    try {
      const [tables, orders] = await Promise.all([
        rbacService.getTablesApi(businessId).catch(() => null),
        rbacService.getTableOrdersApi(tableId, businessId).catch(() => null),
      ]);

      const table = Array.isArray(tables) ? tables.find((t) => t.id === tableId) : undefined;
      if (table) {
        setTableParams((prev) => ({
          ...prev,
          creditOnly: Boolean(table.credit_only),
          creditCustomerName: table.credit_customer_name || null,
          creditCustomerPhone: table.credit_customer_phone || null,
          creditPin: table.credit_pin || null,
          creditGlAccountId: table.credit_gl_account_id || null,
          creditGlAccountNumber: table.credit_gl_account_number || null,
          creditGlAccountName: table.credit_gl_account_name || null,
          compEnabled: Boolean(table.comp_enabled),
          compOrdererName: table.comp_orderer_name || null,
          compOrdererPhone: table.comp_orderer_phone || null,
        }));
      }

      const consolidatedActive = Array.isArray(orders) ? consolidateTableOrders(orders, sessionId) : null;
      const targetId = cachedOrderId || lastTargetOrderIdRef.current;

      const isTableSessionInvalid = Boolean(
        table &&
        (
          table.status === 'ACTIVE' ||
          !table.current_session_id ||
          (sessionId && table.current_session_id !== sessionId)
        )
      );

      if (isTableSessionInvalid) {
        const matchesCurrentSession = (o: TableOrder) =>
          Boolean((targetId && o.id === targetId) || (sessionId && o.session_id === sessionId));

        const paidMatch = Array.isArray(orders)
          ? orders.find((o) =>
              matchesCurrentSession(o) &&
              o.status !== 'CANCELLED' &&
              (o.payment_status === 'PAID' || Boolean((o as any).sale_id))
            )
          : undefined;
        if (paidMatch) {
          handleOrderSettled(paidMatch.id, paidMatch.table_number || tableNumber, paidMatch);
          return;
        }

        const cancelledMatch = Array.isArray(orders)
          ? orders.find((o) => matchesCurrentSession(o) && o.status === 'CANCELLED')
          : undefined;
        if (cancelledMatch) {
          const reason = cancelledMatch.payment_rejected_reason
            ? `Order cancelled: ${cancelledMatch.payment_rejected_reason}. Please scan the table QR code to start a new order.`
            : 'Your order was cancelled by the cashier. Please scan the table QR code to start a new order.';
          expireCustomerSession(reason, { businessId, tableId, tableNumber });
          return;
        }

        const expireMsg = (table?.current_session_id && sessionId && table.current_session_id !== sessionId)
          ? `A new session has started on Table #${tableNumber || ''}. Please scan the table QR code to join the current session.`
          : 'This dining table session has ended or was reset by staff. Please scan the table QR code to start a new order.';
        expireCustomerSession(expireMsg, { businessId, tableId, tableNumber });
        return;
      }

      if (consolidatedActive) {
        setActiveOrder(consolidatedActive);
        setSuccessOrderData((prev: any) => (prev && prev.status === 'AWAITING_PAYMENT' ? prev : null));
        persistActiveOrder(consolidatedActive, businessId, tableId, tableNumber);
        if (consolidatedActive.bill_requested) {
          setIsFinalBillPageOpen(true);
        } else if (consolidatedActive.status === 'AWAITING_PAYMENT') {
          setIsTrackerOpen(true);
        }
        return;
      }

      if (Array.isArray(orders) && targetId) {
        const settledMatch = orders.find(
          (o) =>
            o.id === targetId &&
            o.status !== 'CANCELLED' &&
            (o.payment_status === 'PAID' || Boolean((o as any).sale_id))
        );
        if (settledMatch) {
          handleOrderSettled(settledMatch.id, settledMatch.table_number || tableNumber, settledMatch);
          return;
        }
        const cancelledMatch = orders.find((o) => o.id === targetId && o.status === 'CANCELLED');
        if (cancelledMatch) {
          const reason = cancelledMatch.payment_rejected_reason
            ? `Order cancelled: ${cancelledMatch.payment_rejected_reason}. Please scan the table QR code to start a new order.`
            : 'Your order was cancelled by the cashier. Please scan the table QR code to start a new order.';
          expireCustomerSession(reason, { businessId, tableId, tableNumber });
        }
      }
    } catch {}
  };

  // Parse URL query parameters, sanitize history, and bind active table session
  useEffect(() => {
    const isAdminPreview = Boolean(onNavigateBack || user || window.location.pathname === '/menu-preview');
    if (!isAdminPreview) {
      try {
        sessionStorage.setItem('serveflow_customer_active', 'true');
      } catch {}
    } else {
      try {
        sessionStorage.removeItem('serveflow_customer_active');
      } catch {}
    }

    const urlParams = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split('/');
    const pathTableId = (pathParts[1] === 't' && pathParts[2]) ? decodeURIComponent(pathParts[2]) : undefined;
    const urlBizId = urlParams.get('businessId') || user?.business?.id || undefined;
    const urlTableId = urlParams.get('tableId') || urlParams.get('t') || pathTableId || undefined;
    const urlTableNum = urlParams.get('tableNumber') || undefined;
    const urlFloor = urlParams.get('floor') || null;
    const urlBuilding = urlParams.get('building') || null;

    const hasQrScanInUrl = Boolean(urlTableId || urlTableNum);

    let activeBizId = urlBizId;
    let activeTableId = urlTableId;
    let activeTableNum = urlTableNum;
    let activeFloor = urlFloor;
    let activeBuilding = urlBuilding;
    let activeSessionId: string | null = null;
    let cachedActiveId: string | undefined;

    if (hasQrScanInUrl) {
      // 1. Fresh QR Scan: Sanitize URL address bar immediately so search history and bookmarks only store clean /menu
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.pathname = '/menu';
        cleanUrl.searchParams.delete('tableId');
        cleanUrl.searchParams.delete('tableNumber');
        cleanUrl.searchParams.delete('floor');
        cleanUrl.searchParams.delete('building');
        cleanUrl.searchParams.delete('t');
        const remainingQuery = cleanUrl.searchParams.toString();
        const cleanPath = '/menu' + (remainingQuery ? `?${remainingQuery}` : '');
        window.history.replaceState({ menuView: true }, document.title, cleanPath);
        if (!isAdminPreview) {
          sessionStorage.setItem('serveflow_customer_last_url', cleanPath);
        }
      } catch (e) {
        console.warn('URL address bar sanitization note:', e);
      }

      // Initial temporary state while server scan registers
      setTableParams({
        businessId: urlBizId,
        tableId: urlTableId,
        tableNumber: urlTableNum,
        floor: urlFloor,
        building: urlBuilding,
      });
      // Fresh QR scan always resets prior concluded/expired flags from earlier dining visits
      sessionExpiredRef.current = false;
      isTableBillConcludedRef.current = false;
      setSessionExpired(false);
      setSessionExpiredReason(null);
      setIsTableBillConcluded(false);
      setSettledPaymentInfo(null);
      setThankYouSettledBanner({ show: false });
      try {
        localStorage.removeItem('serveflow_table_bill_concluded');
        localStorage.removeItem('serveflow_last_settled_payment');
        localStorage.removeItem(SESSION_EXPIRED_REASON_KEY);
      } catch {}

      // Check if this browser already had a host token for this table
      let existingHostToken: string | undefined = undefined;
      try {
        const savedRaw = sessionStorage.getItem(TABLE_SESSION_STORAGE_KEY) || localStorage.getItem(TABLE_SESSION_STORAGE_KEY);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (
            parsed.hostToken &&
            (parsed.tableId === urlTableId || (urlTableNum && parsed.tableNumber === urlTableNum))
          ) {
            existingHostToken = parsed.hostToken;
          }
        }
        if (!existingHostToken && urlTableId) {
          existingHostToken = localStorage.getItem(`serveflow_host_token_${urlTableId}`) || undefined;
        }
      } catch {}

      // Register live table check-in / mark occupied in database & retrieve authoritative sessionId and Host status
      if (urlTableId) {
        rbacService.scanTableCheckInApi(urlTableId, {
          business_id: urlBizId,
          table_number: urlTableNum,
          floor: urlFloor,
          building: urlBuilding,
          existingHostToken,
        }).then((res: any) => {
          const isUserHost = res.is_host !== false;
          const token = res.host_token || null;
          setIsHost(isUserHost);
          setHostToken(token);
          if (!isUserHost) {
            setCartItems([]);
            try {
              const tKey = res.table?.id || urlTableId;
              sessionStorage.removeItem(`serveflow_table_cart_${tKey}`);
              localStorage.removeItem(`serveflow_table_cart_${tKey}`);
            } catch {}
          }

          const confirmedTableId = res.table?.id || urlTableId;
          const confirmedBizId = res.table?.business_id || urlBizId;
          const confirmedTableNum = res.table?.table_number || urlTableNum || 'Table';
          const generatedSessionId = res.session_id || res.table?.current_session_id || `sess_${Date.now()}`;

          if (res.active_order) {
            setActiveOrder(res.active_order);
            persistActiveOrder(res.active_order, confirmedBizId, confirmedTableId, confirmedTableNum);
            if (res.active_order.bill_requested) {
              setIsFinalBillPageOpen(true);
            } else if (res.active_order.status === 'AWAITING_PAYMENT') {
              setIsTrackerOpen(true);
            }
          }
          if (confirmedTableId && confirmedBizId) {
            rbacService.getTableOrdersApi(confirmedTableId, confirmedBizId).then((orders) => {
              const consolidated = consolidateTableOrders(orders, generatedSessionId);
              if (consolidated) {
                setActiveOrder(consolidated);
                persistActiveOrder(consolidated, confirmedBizId, confirmedTableId, confirmedTableNum);
                if (consolidated.bill_requested) {
                  setIsFinalBillPageOpen(true);
                } else if (consolidated.status === 'AWAITING_PAYMENT') {
                  setIsTrackerOpen(true);
                }
              } else if (!res.active_order) {
                setActiveOrder(null);
                try {
                  for (const k of getActiveOrderStorageKeys(confirmedBizId, confirmedTableId, confirmedTableNum)) {
                    localStorage.removeItem(k);
                  }
                } catch {}
              }
            }).catch(() => {});
          }
          const sessionPayload: CustomerTableSession = {
            businessId: urlBizId || res.table?.business_id || '',
            tableId: confirmedTableId,
            tableNumber: confirmedTableNum,
            floor: res.table?.floor ?? urlFloor,
            building: res.table?.building ?? urlBuilding,
            sessionId: generatedSessionId,
            scannedAt: Date.now(),
            isHost: isUserHost,
            hostToken: token,
            creditOnly: Boolean(res.table?.credit_only),
            creditCustomerName: res.table?.credit_customer_name || null,
            creditCustomerPhone: res.table?.credit_customer_phone || null,
            creditPin: res.table?.credit_pin || null,
            creditGlAccountId: res.table?.credit_gl_account_id || null,
            creditGlAccountNumber: res.table?.credit_gl_account_number || null,
            creditGlAccountName: res.table?.credit_gl_account_name || null,
            compEnabled: Boolean(res.table?.comp_enabled),
            compOrdererName: res.table?.comp_orderer_name || null,
            compOrdererPhone: res.table?.comp_orderer_phone || null,
          };

          try {
            const serialized = JSON.stringify(sessionPayload);
            sessionStorage.setItem(TABLE_SESSION_STORAGE_KEY, serialized);
            localStorage.setItem(TABLE_SESSION_STORAGE_KEY, serialized);
            if (token && sessionPayload.tableId) {
              localStorage.setItem(`serveflow_host_token_${sessionPayload.tableId}`, token);
            }
          } catch {}

          setTableParams({
            businessId: sessionPayload.businessId,
            tableId: sessionPayload.tableId,
            tableNumber: sessionPayload.tableNumber,
            floor: sessionPayload.floor,
            building: sessionPayload.building,
            sessionId: sessionPayload.sessionId,
            creditOnly: sessionPayload.creditOnly,
            creditCustomerName: sessionPayload.creditCustomerName,
            creditCustomerPhone: sessionPayload.creditCustomerPhone,
            creditPin: sessionPayload.creditPin,
            creditGlAccountId: sessionPayload.creditGlAccountId,
            creditGlAccountNumber: sessionPayload.creditGlAccountNumber,
            creditGlAccountName: sessionPayload.creditGlAccountName,
            compEnabled: sessionPayload.compEnabled,
            compOrdererName: sessionPayload.compOrdererName,
            compOrdererPhone: sessionPayload.compOrdererPhone,
          });

          // Successful table check-in clears any prior concluded/expired flags from previous dining
          isTableBillConcludedRef.current = false;
          sessionExpiredRef.current = false;
          setIsTableBillConcluded(false);
          setSessionExpired(false);
          setSessionExpiredReason(null);
          setSettledPaymentInfo(null);
          try {
            localStorage.removeItem('serveflow_table_bill_concluded');
            localStorage.removeItem('serveflow_last_settled_payment');
            localStorage.removeItem(SESSION_EXPIRED_REASON_KEY);
          } catch {}
        }).catch((err) => {
          console.warn('Table check-in scan registration note:', err);
        });
      } else {
        const fallbackSession: CustomerTableSession = {
          businessId: urlBizId || '',
          tableId: urlTableId || '',
          tableNumber: urlTableNum || '',
          floor: urlFloor,
          building: urlBuilding,
          sessionId: `sess_${Date.now()}`,
          scannedAt: Date.now(),
          isHost: true,
        };
        try {
          const serialized = JSON.stringify(fallbackSession);
          sessionStorage.setItem(TABLE_SESSION_STORAGE_KEY, serialized);
          localStorage.setItem(TABLE_SESSION_STORAGE_KEY, serialized);
        } catch {}
      }
    } else if (!isExplicitAdminPreview) {
      // 2. URL has no table parameters (User navigated back, reloaded tab, reopened browser, or returned to /menu)
      try {
        const savedSessionRaw = sessionStorage.getItem(TABLE_SESSION_STORAGE_KEY) || localStorage.getItem(TABLE_SESSION_STORAGE_KEY);
        if (savedSessionRaw) {
          const savedSession: CustomerTableSession = JSON.parse(savedSessionRaw);
          const elapsed = Date.now() - (savedSession.scannedAt || 0);

          if (elapsed > SESSION_TIMEOUT_MS) {
            // Expired via 3-hour timeout
            expireCustomerSession(
              `The dining session for Table #${savedSession.tableNumber || ''} has timed out. If you are seated at this table, please scan the QR code on your table to start a new order.`,
              { businessId: savedSession.businessId, tableId: savedSession.tableId, tableNumber: savedSession.tableNumber }
            );
            activeBizId = savedSession.businessId || activeBizId;
          } else {
            // Re-sync sessionStorage in case browser closed tab / wiped sessionStorage on mobile back
            try {
              sessionStorage.setItem(TABLE_SESSION_STORAGE_KEY, savedSessionRaw);
            } catch {}

            // Restore table parameters and host authority from valid session
            activeBizId = savedSession.businessId || activeBizId;
            activeTableId = savedSession.tableId;
            activeTableNum = savedSession.tableNumber;
            activeFloor = savedSession.floor;
            activeBuilding = savedSession.building;
            activeSessionId = savedSession.sessionId;

            if (savedSession.isHost !== undefined) {
              setIsHost(savedSession.isHost);
            }
            if (savedSession.hostToken) {
              setHostToken(savedSession.hostToken);
            }

            setTableParams({
              businessId: activeBizId,
              tableId: activeTableId,
              tableNumber: activeTableNum,
              floor: activeFloor,
              building: activeBuilding,
              sessionId: activeSessionId,
              creditOnly: savedSession.creditOnly,
              creditCustomerName: savedSession.creditCustomerName,
              creditCustomerPhone: savedSession.creditCustomerPhone,
              creditPin: savedSession.creditPin,
              creditGlAccountId: savedSession.creditGlAccountId,
              creditGlAccountNumber: savedSession.creditGlAccountNumber,
              creditGlAccountName: savedSession.creditGlAccountName,
              compEnabled: savedSession.compEnabled,
              compOrdererName: savedSession.compOrdererName,
              compOrdererPhone: savedSession.compOrdererPhone,
            });
          }
        }
      } catch (err) {
        console.warn('Session parsing error:', err);
      }
    }

    // Check localStorage for previously placed order for this table & verify live session/order with backend
    if (!hasQrScanInUrl && activeBizId && (activeTableNum || activeTableId)) {
      try {
        for (const key of getActiveOrderStorageKeys(activeBizId, activeTableId, activeTableNum)) {
          const cached = localStorage.getItem(key);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.id && parsed.status !== 'COMPLETED' && parsed.status !== 'CANCELLED') {
              cachedActiveId = parsed.id;
              setActiveOrder(parsed);
              if (parsed.bill_requested) {
                setIsFinalBillPageOpen(true);
              } else if (parsed.status === 'AWAITING_PAYMENT') {
                setIsTrackerOpen(true);
              }
              break;
            }
          }
        }
      } catch {}

      if (activeTableId) {
        syncTableSessionAndOrders({
          businessId: activeBizId,
          tableId: activeTableId,
          tableNumber: activeTableNum,
          sessionId: activeSessionId,
          cachedOrderId: cachedActiveId,
        });
      }
    }

    loadData(activeBizId);
  }, [user?.business?.id]);

// Table status is managed securely via session verification

  // Socket.io Real-time WebSocket Subscription for guest table and order events
  useEffect(() => {
    const targetBizId = tableParams.businessId || user?.business?.id || activeOrder?.business_id;
    const tableId = tableParams.tableId;
    if (!targetBizId) return;

    if (tableId) {
      socketService.joinTable(targetBizId, tableId);
    } else if (user) {
      socketService.joinBusiness(targetBizId);
    } else {
      socketService.joinMenu(targetBizId);
    }
    socketService.joinMenu(targetBizId);

    const unsubOrder = socketService.subscribeToOrders((updatedOrder) => {
      const targetOrderId = activeOrder?.id || successOrderData?.id || lastTargetOrderIdRef.current;
      const cleanParamTable = cleanTableNumber(tableParams.tableNumber).toLowerCase();
      const cleanOrderTable = cleanTableNumber(updatedOrder.table_number).toLowerCase();
      const isOurOrder = Boolean(
        (targetOrderId && updatedOrder.id === targetOrderId) ||
        (tableParams.tableId && updatedOrder.table_id === tableParams.tableId) ||
        (cleanParamTable && cleanOrderTable && cleanParamTable === cleanOrderTable)
      );

      if (isOurOrder) {
        if (updatedOrder.status === 'CANCELLED') {
          const cancelReason = updatedOrder.payment_rejected_reason
            ? `Order cancelled: ${updatedOrder.payment_rejected_reason}. Please scan the table QR code to start a new order.`
            : 'Your order was cancelled by the cashier. Please scan the table QR code to start a new order.';
          recentCancelReasonRef.current = { reason: cancelReason, at: Date.now() };
          if (tableId && targetBizId) {
            rbacService.getTableOrdersApi(tableId, targetBizId).then((orders) => {
              const remaining = consolidateTableOrders(orders, tableParams.sessionId);
              if (remaining) {
                setActiveOrder(remaining);
                persistActiveOrder(remaining, targetBizId, tableId, tableParams.tableNumber);
                setSuccessOrderData((prev: any) => (prev && prev.status === 'AWAITING_PAYMENT' ? prev : null));
              } else {
                expireCustomerSession(cancelReason);
              }
            }).catch(() => {
              expireCustomerSession(cancelReason);
            });
          } else {
            expireCustomerSession(cancelReason);
          }
          return;
        }

        const isPayFirst = Boolean(updatedOrder.pay_first ?? activeOrder?.pay_first ?? successOrderData?.pay_first);
        const isSettled = isPayFirst
          ? updatedOrder.status === 'COMPLETED'
          : (updatedOrder.status === 'COMPLETED' ||
             updatedOrder.payment_status === 'PAID' ||
             Boolean((updatedOrder as any).settled));

        if (isSettled) {
          handleOrderSettled(updatedOrder.id, tableParams.tableNumber, {
            ...(activeOrder || successOrderData || {}),
            ...updatedOrder,
          });
          return;
        }

        setActiveOrder((prev) => {
          if (!prev) {
            const single = updatedOrder as any;
            persistActiveOrder(single, targetBizId, tableId, tableParams.tableNumber);
            return single;
          }
          const isSingleMatchingOrder =
            prev.id === updatedOrder.id &&
            !prev.is_follow_up &&
            !(prev.items || []).some((it: any) => (it.round_number || 1) > 1);
          if (isSingleMatchingOrder) {
            const next = { ...prev, ...updatedOrder };
            persistActiveOrder(next, targetBizId, tableId, tableParams.tableNumber);
            return next;
          }
          // Multi-round order: optimistically update matching items by item_key while preserving all rounds
          const updatedItemByKey = new Map<string, any>();
          for (const it of updatedOrder.items || []) {
            if ((it as any).item_key) updatedItemByKey.set((it as any).item_key, it);
          }
          const mergedItems = (prev.items || []).map((it: any) =>
            it.item_key && updatedItemByKey.has(it.item_key) ? { ...it, ...updatedItemByKey.get(it.item_key) } : it
          );
          const next = {
            ...prev,
            bill_requested: prev.bill_requested || updatedOrder.bill_requested,
            items: mergedItems,
          };
          persistActiveOrder(next, targetBizId, tableId, tableParams.tableNumber);
          return next;
        });
        if (tableId && targetBizId && (activeOrder?.id !== updatedOrder.id || (activeOrder?.items || []).some((it: any) => (it.round_number || 1) > 1))) {
          rbacService.getTableOrdersApi(tableId, targetBizId).then((orders) => {
            const consolidated = consolidateTableOrders(orders, tableParams.sessionId);
            if (consolidated) {
              setActiveOrder(consolidated);
              persistActiveOrder(consolidated, targetBizId, tableId, tableParams.tableNumber);
            }
          }).catch(() => {});
        }
        setSuccessOrderData((prev: any) => (prev && prev.id === updatedOrder.id ? { ...prev, ...updatedOrder } : prev));
        if (updatedOrder.bill_requested) {
          setIsFinalBillPageOpen(true);
        }
      }
    });

    const unsubTable = socketService.subscribeToTables((tableData) => {
      if (tableId && tableData.id === tableId) {
        if (tableData.status === 'ACTIVE' && (!tableData.current_session_id || (tableParams.sessionId && tableData.current_session_id !== tableParams.sessionId))) {
          // If order update already handled bill settlement or cancellation, do not overwrite its screen/reason
          if (sessionExpiredRef.current) return;

          if (recentCancelReasonRef.current && Date.now() - recentCancelReasonRef.current.at < 5000) {
            expireCustomerSession(recentCancelReasonRef.current.reason);
            return;
          }

          let cachedActiveOrder: TableOrder | null = null;
          try {
            const bId = tableParams.businessId || user?.business?.id || 'biz';
            for (const key of getActiveOrderStorageKeys(bId, tableParams.tableId, tableParams.tableNumber)) {
              const stored = localStorage.getItem(key);
              if (stored) {
                cachedActiveOrder = JSON.parse(stored);
                break;
              }
            }
          } catch {}

          const existingOrder = activeOrder || successOrderData || cachedActiveOrder;
          const isExistingPaid = Boolean(
            existingOrder &&
            existingOrder.status !== 'CANCELLED' &&
            (existingOrder.payment_status === 'PAID' || Boolean((existingOrder as any).sale_id))
          );

          if (isExistingPaid && existingOrder && (!existingOrder.pay_first || existingOrder.status === 'COMPLETED')) {
            handleOrderSettled(existingOrder.id, tableParams.tableNumber, existingOrder);
          } else if (existingOrder?.status === 'CANCELLED') {
            expireCustomerSession('Your order was cancelled by the cashier. Please scan the table QR code to start a new order.');
          } else {
            expireCustomerSession('This dining table session was reset by staff. Please re-scan table QR to start a new order.');
          }
        }
      }
    });

    const unsubReconnect = socketService.onReconnect(async () => {
      // Re-fetch on reconnect to catch missed events during socket downtime
      const effectiveBizId = tableParams.businessId || user?.business?.id || activeOrder?.business_id;
      const effectiveTableId = tableParams.tableId || activeOrder?.table_id;
      if (!effectiveTableId || !effectiveBizId) return;
      await syncTableSessionAndOrders({
        businessId: effectiveBizId,
        tableId: effectiveTableId,
        tableNumber: tableParams.tableNumber,
        sessionId: tableParams.sessionId,
        cachedOrderId: activeOrder?.id || successOrderData?.id || lastTargetOrderIdRef.current || undefined,
      });
    });

    return () => {
      unsubOrder();
      unsubTable();
      unsubReconnect();
    };
  }, [tableParams.businessId, user?.business?.id, activeOrder?.business_id, tableParams.tableId, activeOrder?.id, successOrderData?.id, tableParams.sessionId, tableParams.tableNumber]);

  // Layer 1: Page Visibility API & bfcache pageshow (handles mobile sleep, tab switching, and back/forward cache)
  useEffect(() => {
    const syncOnResume = async () => {
      if (!socketService.isConnected()) {
        socketService.connect();
      }
      const effectiveBizId = tableParams.businessId || user?.business?.id || activeOrder?.business_id;
      const tableId = tableParams.tableId || activeOrder?.table_id;
      if (!tableId || !effectiveBizId || sessionExpiredRef.current) return;

      await syncTableSessionAndOrders({
        businessId: effectiveBizId,
        tableId,
        tableNumber: tableParams.tableNumber,
        sessionId: tableParams.sessionId,
        cachedOrderId: activeOrder?.id || successOrderData?.id || lastTargetOrderIdRef.current || undefined,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncOnResume();
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        syncOnResume();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [
    activeOrder?.id,
    activeOrder?.business_id,
    activeOrder?.table_id,
    successOrderData?.id,
    tableParams.tableId,
    tableParams.tableNumber,
    tableParams.sessionId,
    tableParams.businessId,
    user?.business?.id,
  ]);

  // Layer 3: Periodic Polling Fallback (Safety Net when socket is disconnected)
  useEffect(() => {
    const effectiveBizId = tableParams.businessId || user?.business?.id || activeOrder?.business_id;
    const tableId = tableParams.tableId || activeOrder?.table_id;

    if (!tableId || !effectiveBizId || sessionExpired) return;

    const intervalId = setInterval(async () => {
      if (socketService.isConnected()) return;
      await syncTableSessionAndOrders({
        businessId: effectiveBizId,
        tableId,
        tableNumber: tableParams.tableNumber,
        sessionId: tableParams.sessionId,
        cachedOrderId: activeOrder?.id || successOrderData?.id || lastTargetOrderIdRef.current || undefined,
      });
    }, 45_000);

    return () => clearInterval(intervalId);
  }, [
    activeOrder?.id,
    activeOrder?.business_id,
    activeOrder?.table_id,
    successOrderData?.id,
    tableParams.tableId,
    tableParams.tableNumber,
    tableParams.sessionId,
    tableParams.businessId,
    user?.business?.id,
    sessionExpired,
  ]);

  // Real-time Socket.io listener for Menu Items, Categories, and Business Profile
  useEffect(() => {
    const targetBizId = tableParams.businessId || user?.business?.id || businessProfile?.id;
    if (!targetBizId) return;

    const unsubMenu = socketService.subscribeToMenu(() => {
      loadData(targetBizId);
    });

    const unsubBiz = socketService.subscribeToBusinessProfile((biz) => {
      if (biz && (biz.id === targetBizId || !biz.id)) {
        setBusinessProfile((prev) => ({ ...(prev || {}), ...biz }));
      }
    });

    return () => {
      unsubMenu();
      unsubBiz();
    };
  }, [tableParams.businessId, user?.business?.id, businessProfile?.id]);

  const loadData = async (bId?: string) => {
    try {
      if (bId && bId !== prevBizIdRef.current) {
        prevBizIdRef.current = bId;
        userManuallySelectedCategoryRef.current = false;
      }
      setLoading(true);
      const [itemsData, catsData, bizData, taxCfgData] = await Promise.all([
        rbacService.getMenusApi(bId).catch(() => []),
        rbacService.getCategoriesApi(bId).catch(() => []),
        rbacService.getBusinessProfileApi(bId).catch(() => null),
        bId ? rbacService.getTaxConfigApi(bId).catch(() => null) : Promise.resolve(null),
      ]);
      setMenuItems(itemsData);
      setCategories(catsData);
      if (taxCfgData) {
        setTaxConfig(taxCfgData);
      }
      if (bizData) {
        setBusinessProfile(bizData);
        try {
          localStorage.setItem('serveflow_customer_business_profile', JSON.stringify(bizData));
          if (bId) {
            localStorage.setItem(`serveflow_biz_${bId}`, JSON.stringify(bizData));
          }
        } catch {}
      }
    } catch (err: any) {
      console.error('Failed to load menu or business profile for preview:', err);
    } finally {
      setLoading(false);
    }
  };

  // Variant / Subcategory helpers
  const getActiveVariant = (item: MenuItem): MenuItemVariant | undefined => {
    if (!Array.isArray(item.variants) || item.variants.length === 0) {
      return undefined;
    }
    const isVariantAvailable = (v: MenuItemVariant) =>
      v.is_available !== false && (v as any).status !== 'out_of_stock' && (v as any).status !== 'unavailable';

    if (selectedVariants[item.id] && isVariantAvailable(selectedVariants[item.id])) {
      return selectedVariants[item.id];
    }
    if (dietaryFilter !== 'all') {
      const matching = item.variants.find(v => (v.food_type || item.food_type) === dietaryFilter && isVariantAvailable(v));
      if (matching) return matching;
    }
    const firstAvailable = item.variants.find(isVariantAvailable);
    return firstAvailable || selectedVariants[item.id] || item.variants[0];
  };

  const handleSelectVariant = (itemId: string, variant: MenuItemVariant, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedVariants((prev) => ({
      ...prev,
      [itemId]: variant,
    }));
  };

  const getItemVariantCartQty = (itemId: string, variantId?: string): number => {
    const matching = cartItems.filter((ci) => {
      if (ci.menuItem.id !== itemId) return false;
      if (variantId) return ci.selected_variant?.id === variantId;
      return !ci.selected_variant;
    });
    return matching.reduce((sum, ci) => sum + ci.quantity, 0);
  };

  // Item Card Modal Trigger: Opens full card for customisation
  const handleOpenItemCard = (item: MenuItem) => {
    pushCustomerHistoryGuard('detail');
    setSelectedDetailItem(item);
    setIsDetailModalOpen(true);
  };

  // Cart Quantity Modifiers: Clicking "+Add" or card opens full modal first
  const handleAddToCart = (item: MenuItem) => {
    handleOpenItemCard(item);
  };

  const handleAddToCartWithDetails = (item: MenuItem, quantity: number, instructions?: string, selectedVariant?: MenuItemVariant) => {
    if (!isHost) return;
    const hasVariants = Boolean(Array.isArray(item.variants) && item.variants.length > 0);
    const areAllVariantsUnavailable = hasVariants && item.variants!.every(
      (v) => v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable'
    );
    if (item.status === 'out_of_stock' || item.status === 'unavailable' || item.is_available === false || areAllVariantsUnavailable) {
      alert(`"${item.name}" is currently out of stock or unavailable.`);
      return;
    }
    if (selectedVariant && (selectedVariant.is_available === false || (selectedVariant as any).status === 'out_of_stock' || (selectedVariant as any).status === 'unavailable')) {
      alert(`Option "${selectedVariant.name}" for "${item.name}" is currently out of stock.`);
      return;
    }
    setCartItems((prev) => {
      const existing = prev.find((ci) => {
        if (ci.menuItem.id !== item.id) return false;
        if (selectedVariant) {
          return ci.selected_variant?.id === selectedVariant.id;
        }
        return !ci.selected_variant;
      });

      if (existing) {
        if (quantity <= 0) {
          return prev.filter((ci) => {
            const isMatch = ci.menuItem.id === item.id && (
              selectedVariant ? ci.selected_variant?.id === selectedVariant.id : !ci.selected_variant
            );
            return !isMatch;
          });
        }
        return prev.map((ci) => {
          const isMatch = ci.menuItem.id === item.id && (
            selectedVariant ? ci.selected_variant?.id === selectedVariant.id : !ci.selected_variant
          );
          return isMatch
            ? {
                ...ci,
                quantity: quantity,
                special_instructions: instructions !== undefined ? instructions : ci.special_instructions,
              }
            : ci;
        });
      }

      if (quantity <= 0) return prev;

      return [
        ...prev,
        {
          menuItem: item,
          quantity: quantity,
          special_instructions: instructions || '',
          selected_variant: selectedVariant,
        },
      ];
    });
  };

  const handleUpdateQuantity = (itemKeyOrId: string, newQuantity: number) => {
    if (!isHost) return;
    setCartItems((prev) => {
      const matchCartItem = (ci: CartItem, idOrKey: string) => {
        const key = ci.selected_variant ? `${ci.menuItem.id}_${ci.selected_variant.id}` : ci.menuItem.id;
        return key === idOrKey || (!ci.selected_variant && ci.menuItem.id === idOrKey);
      };

      if (newQuantity <= 0) {
        return prev.filter((ci) => !matchCartItem(ci, itemKeyOrId));
      }
      const existing = prev.find((ci) => matchCartItem(ci, itemKeyOrId));
      if (existing && newQuantity > existing.quantity) {
        const m = existing.menuItem;
        const hasVariants = Boolean(Array.isArray(m.variants) && m.variants.length > 0);
        const areAllVariantsUnavailable = hasVariants && m.variants!.every(
          (v) => v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable'
        );
        if (m.status === 'out_of_stock' || m.status === 'unavailable' || m.is_available === false || areAllVariantsUnavailable) {
          alert(`"${m.name}" is currently out of stock or unavailable.`);
          return prev;
        }
        const v = existing.selected_variant;
        if (v && (v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable')) {
          alert(`Option "${v.name}" for "${m.name}" is currently out of stock.`);
          return prev;
        }
      }
      return prev.map((ci) => {
        return matchCartItem(ci, itemKeyOrId)
          ? { ...ci, quantity: newQuantity, pack_qty: Math.min(newQuantity, Number(ci.pack_qty) || 0), is_packaged: Math.min(newQuantity, Number(ci.pack_qty) || 0) > 0 }
          : ci;
      });
    });
  };

  const handleUpdateSpecialInstructions = (itemKeyOrId: string, note: string) => {
    if (!isHost) return;
    setCartItems((prev) =>
      prev.map((ci) => {
        const key = ci.selected_variant ? `${ci.menuItem.id}_${ci.selected_variant.id}` : ci.menuItem.id;
        return (key === itemKeyOrId || ci.menuItem.id === itemKeyOrId)
          ? { ...ci, special_instructions: note }
          : ci;
      })
    );
  };

  const handleUpdatePackaging = (itemKeyOrId: string, packQty: number) => {
    if (!isHost) return;
    setCartItems((prev) =>
      prev.map((ci) => {
        const key = ci.selected_variant ? `${ci.menuItem.id}_${ci.selected_variant.id}` : ci.menuItem.id;
        if (key === itemKeyOrId || ci.menuItem.id === itemKeyOrId) {
          const validQty = Math.max(0, Math.min(ci.quantity, packQty));
          return { ...ci, pack_qty: validQty, is_packaged: validQty > 0 };
        }
        return ci;
      })
    );
  };

  const handleClearCart = () => {
    if (!isHost) return;
    setCartItems([]);
  };

  const getItemCartQuantity = (itemId: string): number => {
    const matching = cartItems.filter((ci) => ci.menuItem.id === itemId);
    return matching.reduce((sum, ci) => sum + ci.quantity, 0);
  };

  const getVariantDisplay = (item: MenuItem) => {
    const group = item.variant_group_name?.trim() || '';
    const isPortionOrSize = /size|portion|half|full|peg|volume|bottle|measure/i.test(group);
    const count = item.variants?.length || 0;

    if (isPortionOrSize || (!group && /size/i.test(item.name))) {
      return {
        buttonLabel: 'Select Size',
        badgeLabel: `${count} ${count === 1 ? 'Size' : 'Sizes'}`,
        badgeAvailable: `${count} ${count === 1 ? 'size' : 'sizes'} available`,
      };
    }

    if (group) {
      const primaryWord = group.split('/')[0].trim();
      return {
        buttonLabel: `Select ${primaryWord}`,
        badgeLabel: `${count} Options`,
        badgeAvailable: `${count} options available`,
      };
    }

    return {
      buttonLabel: 'Select Option',
      badgeLabel: `${count} ${count === 1 ? 'Option' : 'Options'}`,
      badgeAvailable: `${count} ${count === 1 ? 'option' : 'options'} available`,
    };
  };

  const handleOpenOrderTracker = () => {
    if (activeOrder) {
      pushCustomerHistoryGuard('tracker');
      setSuccessOrderData(activeOrder.status === 'AWAITING_PAYMENT' ? activeOrder : null);
      setIsTrackerOpen(true);
    } else {
      setNoOrderToast(true);
      setTimeout(() => setNoOrderToast(false), 3500);
    }
  };


  const handleCallWaiter = async () => {
    if (!tableParams.businessId || !tableParams.tableId) {
      alert('Table information is missing. Cannot call waiter.');
      return;
    }
    if (isReadOnlyMode) {
      alert('This is a preview mode. Waiter will not be called.');
      return;
    }
    try {
      await rbacService.createServiceRequestApi({
        business_id: tableParams.businessId,
        table_id: tableParams.tableId,
        table_number: tableParams.tableNumber || '',
        floor: tableParams.floor || null,
        building: tableParams.building || null,
        type: 'WAITER_CALL',
        status: 'PENDING',
        notes: `Guest called waiter at Table #${tableParams.tableNumber || ''}`,
      });
      alert('Waiter called! Please wait a moment.');
    } catch (err: any) {
      console.error('Failed to call waiter:', err);
      alert('Could not call waiter. Please try again.');
    }
  };
  const handleBillSettledOrRequested = () => {
    // 1. Empty the cart
    setCartItems([]);
    // 2. Keep active order state with bill_requested: true so the final bill tab stays open across back/reload until paid
    setActiveOrder((prev) => {
      const next = prev ? { ...prev, bill_requested: true } : null;
      if (next) persistActiveOrder(next);
      return next;
    });
  };

  // Order items based on custom admin sequence from Theme Studio
  const orderedItems = useMemo(() => {
    const order = businessProfile?.menu_theme_config?.itemOrder || [];
    if (order.length === 0) return menuItems;

    const orderMap = new Map<string, number>();
    order.forEach((id, idx) => orderMap.set(id, idx));

    return [...menuItems].sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return idxA - idxB;
    });
  }, [menuItems, businessProfile?.menu_theme_config?.itemOrder]);

  // Order categories dynamically based on custom positioning in Menu Management
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

  // Default selected category dynamically to the first category in the queue (or 'All' if none exist)
  useEffect(() => {
    if (!loading) {
      if (!userManuallySelectedCategoryRef.current) {
        if (orderedCategories.length > 0) {
          if (selectedCategory !== orderedCategories[0].name) {
            setSelectedCategory(orderedCategories[0].name);
          }
        } else if (selectedCategory !== 'All') {
          setSelectedCategory('All');
        }
      } else if (
        selectedCategory !== 'All' &&
        orderedCategories.length > 0 &&
        !orderedCategories.some((c) => c.name.toLowerCase() === selectedCategory.toLowerCase())
      ) {
        setSelectedCategory(orderedCategories[0].name);
      }
    }
  }, [loading, orderedCategories, selectedCategory]);

  // Filter items (accounting for multi-category items and custom sort)
  const filteredItems = useMemo(() => {
    return orderedItems.filter((item) => {
      const matchesCat =
        !selectedCategory ||
        selectedCategory === 'All' ||
        itemMatchesCategory(item, selectedCategory);

      const itemCats = getAllItemCategories(item);
      const matchesSearch =
        searchQuery === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        itemCats.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesDietary = dietaryFilter === 'all';
      if (!matchesDietary) {
        if (item.food_type === dietaryFilter) {
          matchesDietary = true;
        } else if (item.has_variants && Array.isArray(item.variants)) {
          matchesDietary = item.variants.some(v => (v.food_type || item.food_type) === dietaryFilter);
        }
      }

      return matchesCat && matchesSearch && matchesDietary;
    });
  }, [orderedItems, selectedCategory, searchQuery, dietaryFilter]);

  // Calculate category counts (accounting for items in multiple categories)
  const categoryCounts = useMemo(() => {
    return menuItems.reduce<Record<string, number>>((acc, item) => {
      const allCats = getAllItemCategories(item);
      for (const cat of allCats) {
        const key = cat.toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    }, {});
  }, [menuItems]);

  const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cartItems.reduce((sum, item) => {
    const price = item.selected_variant ? Number(item.selected_variant.price) : Number(item.menuItem.price);
    return sum + price * item.quantity;
  }, 0);

  const activeOrderItemsCount = useMemo(() => {
    if (!activeOrder?.items || !Array.isArray(activeOrder.items)) return 0;
    return activeOrder.items
      .filter((i) => i.status !== 'CANCELLED')
      .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  }, [activeOrder?.items]);

  const effectiveCartCount = isHost ? totalCartCount : activeOrderItemsCount;

  // Get Theme Engine settings
  const theme = getThemeClasses(businessProfile?.menu_theme_config);

  // BLOCKING FULL-PAGE DIALOGUE FOR CONCLUDED / EXPIRED DINING SESSION (Requirement 3)
  // When dining session ends, bill is concluded, or waiter/accounts settles table:
  // Customers MUST NOT be able to view the menu; only the centered dialogue box is rendered.
  const isSessionClosed = sessionExpired || isTableBillConcluded || thankYouSettledBanner.show;
  const isDineInGuestOrTableSession = Boolean(
    tableParams.tableId ||
    tableParams.tableNumber ||
    thankYouSettledBanner.tableNumber ||
    sessionStorage.getItem(TABLE_SESSION_STORAGE_KEY) ||
    !user
  );

  if (isSessionClosed) {
    const backdropUrl =
      businessProfile?.menu_theme_config?.backdropUrl ||
      theme.defaultBackdrop ||
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&auto=format&fit=crop&q=80';
    const logoUrl = businessProfile?.menu_theme_config?.logoUrl;
    const tableNumDisplay = tableParams.tableNumber || thankYouSettledBanner.tableNumber;

    return (
      <div
        id="session-concluded-dialogue-page"
        className={`w-full min-h-screen flex flex-col justify-between relative overflow-hidden transition-colors duration-500 ${theme.pageBg} ${theme.fontClass} ${theme.text}`}
      >
        {/* Subtle Ambient Theme Backdrop */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <img
            src={backdropUrl}
            alt="Atmosphere backdrop"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover scale-105 blur-md opacity-25 dark:opacity-20 transition-all duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
        </div>

        {/* Minimal Top Brand Bar */}
        <header className="relative z-10 w-full max-w-full overflow-hidden border-b border-white/10 bg-black/40 backdrop-blur-md px-4 sm:px-6 py-3.5">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {logoUrl ? (
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 border border-white/20 shrink-0 p-0.5 shadow-xs">
                  <img
                    src={logoUrl}
                    alt={businessProfile?.name || 'Restaurant'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded-md"
                  />
                </div>
              ) : (
                <div className={`w-8 h-8 rounded-lg ${theme.accentBg} flex items-center justify-center font-black shrink-0 shadow-xs`}>
                  <UtensilsCrossed className="w-4 h-4" />
                </div>
              )}
              <span className="text-sm font-black text-white truncate">
                {businessProfile?.name || 'Restaurant Dining Service'}
              </span>
            </div>

            {tableNumDisplay && (
              <span className={`px-3 py-1 rounded-full bg-white/10 border border-white/15 ${theme.accent} font-extrabold text-xs shrink-0 flex items-center gap-1.5`}>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Table #{cleanTableNumber(tableNumDisplay)}</span>
              </span>
            )}
          </div>
        </header>

        {/* Centered Dialogue Box in the Middle of the Page */}
        <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
          <div className="w-full max-w-lg mx-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-black/10 dark:border-white/15 rounded-3xl p-6 sm:p-10 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-400">
            {/* Elegant Icon Emblem */}
            <div className="w-20 h-20 rounded-full mx-auto bg-gradient-to-tr from-amber-500/20 via-orange-500/15 to-emerald-500/20 border-2 border-amber-500/40 flex items-center justify-center shadow-inner">
              <Sparkles className={`w-10 h-10 ${theme.accent}`} />
            </div>

            {/* Headline and Main Message */}
            {isTableBillConcluded || thankYouSettledBanner.show ? (
              <>
                <div className="space-y-3">
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
                    Thank You for Dining with Us!
                  </h2>
                  <p className="text-base sm:text-lg font-semibold text-zinc-700 dark:text-zinc-200 max-w-md mx-auto leading-relaxed">
                    {typeof settledPaymentInfo?.amount === 'number' && !isNaN(settledPaymentInfo.amount) ? (
                      Number(settledPaymentInfo.amount) === 0 ? (
                        <>Complimentary Order — <span className="notranslate font-mono font-bold">{(settledPaymentInfo.currency || 'Rs.').trim()} 0.00</span> Paid</>
                      ) : (
                        <>Payment received: {settledPaymentInfo.mode || 'Cash'} <span className="notranslate font-mono font-bold">{(settledPaymentInfo.currency || 'Rs.').trim()} {Number(settledPaymentInfo.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></>
                      )
                    ) : settledPaymentInfo?.mode ? (
                      `Payment received via ${settledPaymentInfo.mode}`
                    ) : (
                      'Payment received successfully'
                    )}
                  </p>
                </div>

                {/* Status Details Box */}
                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs text-zinc-600 dark:text-zinc-300 space-y-2">
                  <div className="flex items-center justify-center gap-2 font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Dining Session Concluded</span>
                  </div>
                  <p className="text-xs leading-relaxed opacity-85">
                    {sessionExpiredReason ||
                      'Your table order and billing process has been concluded. Thank you for dining with us!'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
                    Dining Session Expired
                  </h2>
                  <p className="text-sm sm:text-base font-medium text-zinc-600 dark:text-zinc-300 max-w-md mx-auto leading-relaxed">
                    {sessionExpiredReason ||
                      'This dining session has ended. Please scan the QR code on your table to start a new order.'}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs text-zinc-600 dark:text-zinc-300 space-y-2">
                  <div className="flex items-center justify-center gap-2 font-bold text-amber-600 dark:text-amber-400 text-sm">
                    <QrCode className="w-4 h-4 shrink-0" />
                    <span>Session Ended</span>
                  </div>
                  <p className="text-xs leading-relaxed opacity-85">
                    Scan the table QR code if you would like to begin a new dining session.
                  </p>
                </div>
              </>
            )}
          </div>
        </main>

        {/* Subtle Footer */}
        <footer className="relative z-10 text-center py-4 text-[11px] text-zinc-400 dark:text-zinc-500">
          NamasteQR Hospitality • Real-Time Dining System
        </footer>
      </div>
    );
  }

  // SEPARATE DEDICATED PAGE FOR FINAL TABLE BILL (Requirement: NOT a popup, a standalone separate page)
  if ((isFinalBillPageOpen || Boolean(activeOrder?.bill_requested)) && activeOrder) {
    return (
      <FinalTableBillPage
        order={activeOrder}
        isHost={isHost}
        hostToken={hostToken}
        businessId={tableParams.businessId || user?.business?.id || activeOrder.business_id}
        businessName={businessProfile?.name || 'Restaurant Dining Service'}
        dateFormatBilling={businessProfile?.date_format_billing || user?.business?.date_format_billing || 'ENGLISH'}
        onDoneReturnToMenu={handleDoneReturnToMenu}
        onRequestBillDispatched={() => {
            // Keep customer on the final bill page waiting for waiter. Settlement listener will auto-conclude session.
          }}
      />
    );
  }

  if (!isStoreOpen && (tableParams.tableNumber || !user)) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 text-center ${theme.pageBg} ${theme.text}`}>
        <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
          <Moon className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black mb-2">We Are Currently Closed</h1>
        <p className="text-sm opacity-80 max-w-sm mb-6">
          {businessProfile?.name || 'The restaurant'} is currently not accepting dining orders. 
          {businessProfile?.operations_config?.openTime && ` Our operating hours are ${businessProfile.operations_config.openTime} to ${businessProfile.operations_config.closeTime}.`}
        </p>
        <div className={`p-4 rounded-2xl border ${theme.headerBg} border-white/10 text-xs opacity-90 space-y-1`}>
          <div>For immediate assistance, please contact our staff directly.</div>
        </div>
      </div>
    );
  }

  return (
    <div id="customer-menu-preview-page" className={`w-full max-w-full overflow-x-clip min-h-screen pb-32 transition-colors duration-500 ${theme.pageBg} ${theme.fontClass} ${theme.text} relative`}>
      {/* Top Fixed Sticky Navigation Bar for Table QR Guest or Admin Preview */}
      <nav className={`sticky top-0 z-50 w-full max-w-full overflow-hidden ${theme.headerBg} border-b border-white/10 shadow-md backdrop-blur-md transition-colors duration-500`}>
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-2">
          {/* Table Number & Status Indicator */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2 w-2 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className={`text-xs sm:text-sm font-black ${theme.accent} font-mono tracking-wide truncate`}>
              {tableParams.tableNumber ? (
                `Table #${cleanTableNumber(tableParams.tableNumber)}`
              ) : (
                'Digital Menu'
              )}
            </span>
          </div>

          {/* Action Buttons: Order Tracker & View Cart */}
          {isHost && !isReadOnlyMode ? (
            <div className="flex items-center gap-2 shrink-0">
              {/* Order Tracker button */}
              <button
                id="btn-topbar-track-order"
                type="button"
                onClick={handleOpenOrderTracker}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 border ${
                  activeOrder
                    ? `bg-amber-500/20 hover:bg-amber-500/30 ${theme.accent} hover:text-amber-300 border-amber-500/40`
                    : 'bg-white/10 hover:bg-white/15 text-zinc-300 hover:text-white border-white/10'
                }`}
                title="Track live order preparation status"
              >
                <ChefHat className={`w-3.5 h-3.5 ${activeOrder ? `${theme.accent}` : 'text-zinc-400'}`} />
                <span className="whitespace-nowrap">Track Order</span>
                {activeOrder && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                )}
              </button>

              {/* View Cart button */}
              <button
                id="btn-call-waiter"
                type="button"
                onClick={handleCallWaiter}
                className="px-2.5 py-1 bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 shrink-0"
                title="Call Waiter"
              >
                <Bell className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">Call Waiter</span>
              </button>
              <button
                id="btn-topbar-view-cart"
                type="button"
                onClick={() => { pushCustomerHistoryGuard('cart'); setIsCartOpen(true); }}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 shrink-0"
                title="View Cart"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-zinc-950" />
                <span className="whitespace-nowrap">View Cart</span>
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-white text-zinc-950 rounded-full font-mono text-xs font-black shadow-xs leading-none">
                  {totalCartCount}
                </span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-amber-400" />
                <span>View-Only</span>
              </span>

              {/* Order Tracker for View-Only Guest if activeOrder exists */}
              {activeOrder && (
                <button
                  id="btn-topbar-track-order"
                  type="button"
                  onClick={handleOpenOrderTracker}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 border bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40"
                  title="Track live order preparation status"
                >
                  <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                  <span className="whitespace-nowrap hidden sm:inline">Track Order</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                </button>
              )}

              {/* View Cart button for View-Only Guest */}
              <button
                id="btn-topbar-view-cart"
                type="button"
                onClick={() => { pushCustomerHistoryGuard('cart'); setIsCartOpen(true); }}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 shrink-0"
                title="View Table Cart"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-zinc-950" />
                <span className="whitespace-nowrap">View Cart</span>
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-white text-zinc-950 rounded-full font-mono text-xs font-black shadow-xs leading-none">
                  {effectiveCartCount}
                </span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Thank You Table Settled Banner */}
      {thankYouSettledBanner.show && (
        <div className="bg-emerald-600 text-white px-4 py-3 sm:px-6 shadow-md animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-emerald-100" />
              </div>
              <div>
                <span className="font-extrabold text-sm block text-white">
                  Thank you for dining with us!
                </span>
                <span className="text-emerald-100 text-xs">
                  Your table bill {thankYouSettledBanner.tableNumber ? `for Table #${cleanTableNumber(thankYouSettledBanner.tableNumber)}` : ''} has been settled and concluded. We hope to see you again soon!
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setThankYouSettledBanner({ show: false })}
              className="p-1.5 hover:bg-white/10 rounded-lg text-emerald-100 hover:text-white transition cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Session Expired / Settled Alert Banner (Option A) */}
      {sessionExpired && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 text-xs text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-extrabold text-amber-950 block sm:inline mr-1">Dining Session Concluded:</span>
                <span className="text-amber-800">
                  {sessionExpiredReason || 'The dining session for this table has ended or the bill was settled. If you are seated at this table, please scan the live table QR code to start a new order.'}
                </span>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-900 border border-amber-500/30 shrink-0">
              <QrCode className="w-3.5 h-3.5 text-amber-700" />
              <span>Scan Table QR to Order</span>
            </div>
          </div>
        </div>
      )}

      {/* View-Only Mode Banner for Non-Host Guests (Requirement 4) */}
      {!sessionExpired && tableParams.tableNumber && !isHost && (
        <div id="guest-view-only-banner" className="bg-amber-50 border-b border-amber-200 px-4 py-3 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 text-xs text-amber-950">
              <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-extrabold text-amber-950 block sm:inline mr-1">
                  Table #{cleanTableNumber(tableParams.tableNumber)} • View-Only Mode:
                </span>
                <span className="text-amber-800">
                  You are browsing this menu in view-only mode. Ordering authority is reserved for the first guest who scanned this table's QR code.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                id="btn-banner-view-cart"
                type="button"
                onClick={() => { pushCustomerHistoryGuard('cart'); setIsCartOpen(true); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-zinc-950 border border-amber-600/30 transition cursor-pointer shadow-xs active:scale-95"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-zinc-950" />
                <span>
                  View Table Cart {effectiveCartCount > 0 ? `(${effectiveCartCount})` : ''}
                </span>
              </button>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-200/80 text-amber-900 border border-amber-300 shrink-0">
                <Lock className="w-3 h-3 text-amber-700" />
                <span>Guest (View-Only)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Order Placed Toast notification */}
      {noOrderToast && (
        <div className="fixed top-14 right-4 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="bg-zinc-900 text-white text-xs p-3.5 rounded-2xl shadow-2xl border border-amber-500/40 flex items-center gap-3 max-w-sm">
            <div className={`w-8 h-8 rounded-xl bg-amber-500/20 ${theme.accent} flex items-center justify-center shrink-0`}>
              <ChefHat className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-white block">No active order yet</span>
              <span className="text-[11px] text-zinc-300">Add dishes to your cart and place an order to track live kitchen preparation!</span>
            </div>
          </div>
        </div>
      )}

      {/* Restaurant Header Hero Card (Full Width / Full Length) */}
      <div className="relative w-full max-w-full overflow-hidden border-b border-black/10 min-h-[64px] sm:min-h-[72px] flex items-center">
        {/* Backdrop Background Image */}
        <img
          src={businessProfile?.menu_theme_config?.coverUrl || (businessProfile as any)?.cover_url || theme.defaultBackdrop}
          alt={businessProfile?.name || 'Restaurant Cover'}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center scale-105 transform"
        />
        {/* Ambient Themed Gradient Overlay for Maximum Legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-black/40 backdrop-blur-[1px]" />

        {/* Content Container */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 sm:py-2">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-3 sm:gap-3.5">
                {/* Business Logo or Luxury Initials Monogram */}
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-black/40 border-2 border-white/25 shadow-md backdrop-blur-md flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-white/10">
                  {businessProfile?.menu_theme_config?.logoUrl || (businessProfile as any)?.logo_url ? (
                    <img
                      src={businessProfile?.menu_theme_config?.logoUrl || (businessProfile as any)?.logo_url}
                      alt={businessProfile?.name || 'Business Logo'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-amber-500 to-amber-700 flex flex-col items-center justify-center text-white font-black shadow-inner select-none">
                      <span className="text-base sm:text-lg tracking-wider leading-none">
                        {businessProfile?.name
                          ? businessProfile.name
                              .split(' ')
                              .map((w) => w[0])
                              .filter(Boolean)
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()
                          : 'SF'}
                      </span>
                      <span className="text-[7px] font-bold tracking-widest uppercase opacity-90 mt-0.5">
                        {businessProfile?.type || 'VENUE'}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                      <h1 id="restaurant-display-name" className="text-lg sm:text-xl lg:text-2xl font-black text-white tracking-tight drop-shadow-md notranslate">
                        {businessProfile?.name || 'Restaurant & Kitchen'}
                      </h1>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Modern Language Preference Dropdown */}
                        <div className="relative inline-flex items-center notranslate">
                          <button
                            id="customer-language-picker-btn"
                            type="button"
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-md transition shadow-xs cursor-pointer active:scale-95 notranslate select-none"
                            title="Select Menu Language"
                            aria-label="Select Menu Language"
                          >
                            <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
                            <span className="font-semibold tracking-tight notranslate">
                              {SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage)?.nativeLabel || 'English'}
                            </span>
                            <ChevronDown className="w-3 h-3 text-white/70 shrink-0" />
                          </button>
                          <select
                            id="customer-language-select"
                            value={selectedLanguage}
                            onChange={(e) => handleLanguageChange(e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            aria-label="Choose Language"
                          >
                            {SUPPORTED_LANGUAGES.map((lang) => (
                              <option key={lang.code} value={lang.code} className="bg-zinc-900 text-white py-1">
                                {lang.nativeLabel} ({lang.label})
                              </option>
                            ))}
                          </select>
                        </div>
                        {tableParams.tableNumber && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-zinc-950 border border-amber-400 shadow-sm backdrop-blur-sm notranslate">
                            Table #{cleanTableNumber(tableParams.tableNumber)}
                          </span>
                        )}
                      </div>
                    </div>
                  <p className="text-xs text-zinc-200 font-medium mt-0.5 drop-shadow-xs max-w-xl line-clamp-1 sm:line-clamp-2">
                    {businessProfile?.tagline || 'Authentic Cuisine & Bar • Prepared Fresh to Order'}
                  </p>
                </div>
              </div>
            </div>

            {/* Header Right Actions (Session Concluded or Host Order Actions) */}
            {sessionExpired ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 backdrop-blur-md border border-amber-500/40 text-amber-300 text-xs font-bold shrink-0">
                <Lock className={`w-3.5 h-3.5 ${theme.accent}`} />
                <span>Session Concluded</span>
              </div>
            ) : isReadOnlyMode && activeOrder ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  id="btn-hero-view-final-bill"
                  type="button"
                  onClick={handleOpenFinalBillPage}
                  className="px-3.5 py-1.5 bg-zinc-900/90 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 border border-white/20 shadow-md cursor-pointer group active:scale-95 shrink-0"
                >
                  <Receipt className={`w-3.5 h-3.5 ${theme.accent}`} />
                  <span>View Final Bill Folio</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-4xl mx-auto px-3.5 sm:px-6 pt-1 sm:pt-1.5 space-y-1.5">
        {/* Search and Dietary Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-1.5 w-full max-w-full">
          {/* Search Bar */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-zinc-400" />
            <input
              id="customer-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                if (val.trim()) {
                  setSelectedCategory('');
                }
              }}
              placeholder="Search dishes, ingredients, drinks..."
              className={`w-full pl-8 pr-3 py-1.5 text-xs ${theme.cardBg} ${theme.text} border rounded-lg shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-amber-500 transition font-medium placeholder:text-zinc-400`}
            />
          </div>

          {/* Dietary & Menu Filter Buttons */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-start sm:justify-end overflow-x-auto scrollbar-none flex-nowrap min-w-0 max-w-full py-0">
            {/* All Menu Button */}
            <button
              id="filter-all-menu"
              type="button"
              onClick={() => {
                userManuallySelectedCategoryRef.current = true;
                setSelectedCategory('All');
                setSearchQuery('');
                setDietaryFilter('all');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                selectedCategory === 'All'
                  ? `${theme.categoryActive}`
                  : `${theme.categoryInactive}`
              }`}
            >
              <span>All Menu</span>
              {menuItems.length > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    selectedCategory === 'All' ? theme.categoryActiveBadge : theme.categoryInactiveBadge
                  }`}
                >
                  {menuItems.length}
                </span>
              )}
            </button>

            <button
              id="dietary-filter-veg"
              type="button"
              onClick={() => setDietaryFilter(dietaryFilter === 'veg' ? 'all' : 'veg')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                dietaryFilter === 'veg'
                  ? `${theme.filterActive}`
                  : `${theme.filterInactive}`
              }`}
            >
              <span>Vegetarian</span>
              {menuItems.filter((i) => i.food_type === 'veg').length > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    dietaryFilter === 'veg' ? theme.categoryActiveBadge : theme.categoryInactiveBadge
                  }`}
                >
                  {menuItems.filter((i) => i.food_type === 'veg').length}
                </span>
              )}
            </button>
            <button
              id="dietary-filter-nonveg"
              type="button"
              onClick={() => setDietaryFilter(dietaryFilter === 'non-veg' ? 'all' : 'non-veg')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                dietaryFilter === 'non-veg'
                  ? `${theme.filterActive}`
                  : `${theme.filterInactive}`
              }`}
            >
              <span>Non-Vegetarian</span>
              {menuItems.filter((i) => i.food_type === 'non-veg').length > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    dietaryFilter === 'non-veg' ? theme.categoryActiveBadge : theme.categoryInactiveBadge
                  }`}
                >
                  {menuItems.filter((i) => i.food_type === 'non-veg').length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Concluded Table Bill Banner for View Only Mode */}
        {isReadOnlyMode && (
          <div id="banner-table-bill-concluded" className="p-4 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 text-amber-950 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${theme.accentBg} flex items-center justify-center font-black shrink-0 shadow-xs`}>
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm flex items-center gap-2 flex-wrap">
                  Final Table Bill Settled
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-950 border border-amber-400/40 uppercase">
                    Paid & Cleared
                  </span>
                </h4>
                <p className="text-xs text-amber-900/80 mt-0.5">
                  The host has settled the bill with cashier. You can review the finalized itemized breakdown below.
                </p>
              </div>
            </div>

            {Boolean(activeOrder) && (
              <button
                type="button"
                onClick={handleOpenOrderTracker}
                className="px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-amber-300 font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm shrink-0 cursor-pointer"
              >
                <Receipt className={`w-4 h-4 ${theme.accent}`} />
                <span>View Final Table Bill</span>
              </button>
            )}
          </div>
        )}

        {/* Category Filter Tabs */}
        {orderedCategories.length > 0 && (
          <MinimalistScrollContainer
            trackWidth={130}
            contentClassName="flex items-center gap-1.5 pb-0 w-full min-w-0"
            indicatorClassName="pt-0.5 pb-0"
          >
            {orderedCategories.map((cat) => {
              const count = categoryCounts[cat.name.toLowerCase()] || 0;
              const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    userManuallySelectedCategoryRef.current = true;
                    setSelectedCategory(cat.name);
                    setSearchQuery('');
                    setDietaryFilter('all');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                    isSelected
                      ? `${theme.categoryActive}`
                      : `${theme.categoryInactive}`
                  }`}
                >
                  <span>{cat.name}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        isSelected ? theme.categoryActiveBadge : theme.categoryInactiveBadge
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </MinimalistScrollContainer>
        )}

        {/* Menu Items Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 py-12">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="bg-white rounded-2xl border border-zinc-200 h-80 animate-pulse p-4 space-y-4">
                <div className="w-full h-44 bg-zinc-200 rounded-xl" />
                <div className="h-4 bg-zinc-200 rounded-md w-3/4" />
                <div className="h-3 bg-zinc-200 rounded-md w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center space-y-3">
            <UtensilsCrossed className="w-12 h-12 text-zinc-300 mx-auto stroke-[1.5]" />
            <h3 className="text-base font-bold text-zinc-900">No dishes match your selection</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Try adjusting your search query, switching categories, or clearing the dietary filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                userManuallySelectedCategoryRef.current = false;
                setSelectedCategory(orderedCategories[0]?.name || 'All');
                setDietaryFilter('all');
              }}
              className="mt-4 px-4 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-xs font-bold transition"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          /* ========================================================================= */
          /* Dynamic Layout Grid (Handles Mixed, Bento, and Cards with Smart Fallback)  */
          /* ========================================================================= */
          <div
            className={`grid gap-2.5 sm:gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-2`}
          >
            {filteredItems.map((item, idx) => {
              const hasVariants = Boolean(Array.isArray(item.variants) && item.variants.length > 0);
              const areAllVariantsUnavailable = hasVariants && item.variants!.every(
                (v) => v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable'
              );
              const isItemOutOfStock = item.status === 'out_of_stock' || item.status === 'unavailable' || item.is_available === false || areAllVariantsUnavailable;
              const isOutOfStock = isItemOutOfStock;
              const isAvailable = !isItemOutOfStock;
              const activeVariant = getActiveVariant(item);
              const activeFoodType = activeVariant?.food_type || item.food_type;
              const isVeg = activeFoodType === 'veg';
              const hasDietary = activeFoodType === 'veg' || activeFoodType === 'non-veg';
              const displayImage = activeVariant?.image_url?.trim() ? activeVariant.image_url : item.image_url;
              const displayDescription = activeVariant?.description?.trim() ? activeVariant.description : item.description;
              const displayPrice = activeVariant ? Number(activeVariant.price) : Number(item.price);
              const variantCartQty = getItemVariantCartQty(item.id, activeVariant?.id);
              const minPrice = hasVariants ? Math.min(...item.variants!.map((v) => Number(v.price) || 0)) : Number(item.price);
              const variantDisplay = getVariantDisplay(item);

              const custom = businessProfile?.menu_theme_config?.itemCustomizations?.[item.id] || {};
              const badgeText = custom.promo_badge || item.promo_badge;
              const textAlignClass = custom.textAlign === 'center' ? 'text-center' : custom.textAlign === 'right' ? 'text-right' : 'text-left';

              // Determine effective presentation style
                let effectiveStyle: string = 'cards';
                const hasPhoto = Boolean(displayImage);
                const showPhoto = custom.show_image !== undefined ? custom.show_image : (item.show_image !== undefined ? item.show_image : hasPhoto);
                
                // Column span for layout flow
              const colSpanClass =
                effectiveStyle === 'hero'
                  ? 'col-span-1 sm:col-span-2 lg:col-span-3'
                  : theme.layout === 'mixed' && effectiveStyle === 'bento'
                  ? 'col-span-1 md:col-span-2 lg:col-span-1'
                  : '';

              return (
                <div
                  key={item.id}
                  onClick={(e) => {
                    if (isItemOutOfStock) {
                      e.stopPropagation();
                      return;
                    }
                    if (effectiveStyle !== 'cards') {
                      setSelectedDetailItem(item);
                      setIsDetailModalOpen(true);
                    }
                  }}
                  className={`rounded-2xl border transition-all ${
                    isItemOutOfStock
                      ? 'grayscale contrast-75 opacity-70 cursor-not-allowed select-none relative'
                      : effectiveStyle !== 'cards'
                      ? 'cursor-pointer hover:shadow-lg hover:scale-[1.01]'
                      : 'shadow-xs'
                  } ${theme.cardBg} ${colSpanClass} flex flex-col justify-between overflow-hidden relative`}
                >
                  {/* Foreground Overlay for Unavailable / Out of Stock Item */}
                  {isItemOutOfStock && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      className="absolute inset-0 z-30 bg-zinc-950/25 backdrop-blur-[0.5px] flex items-center justify-center p-3 pointer-events-auto"
                    >
                      <div className="px-3.5 py-1.5 rounded-xl bg-zinc-900/90 text-white border border-white/20 shadow-xl flex items-center gap-1.5 font-black text-xs uppercase tracking-wider">
                        <Ban className="w-3.5 h-3.5 text-rose-400" />
                        <span>{item.status === 'unavailable' ? 'Unavailable' : 'Out of Stock'}</span>
                      </div>
                    </div>
                  )}

                  {/* ------------------------------------------------------------- */}
                  {/* STYLE A: HERO BANNER (Full-width Featured Showcase)           */}
                  {/* ------------------------------------------------------------- */}
                  {effectiveStyle === 'hero' ? (
                      <div className="flex flex-col h-full justify-between cursor-pointer" onClick={() => { if (!isItemOutOfStock) { setSelectedDetailItem(item); setIsDetailModalOpen(true); } }}>
                      {showPhoto && displayImage ? (
                        <div className="relative w-full h-56 sm:h-72 overflow-hidden bg-zinc-900">
                          <img
                            src={displayImage}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                          <div className="absolute top-3.5 left-3.5 flex items-center gap-2">
                            {hasDietary && (
                              <div
                                className={`w-4 h-4 rounded-xs flex items-center justify-center border bg-white shadow-2xs ${
                                  isVeg ? 'border-emerald-600' : 'border-rose-600'
                                }`}
                              >
                                <div className={`w-2 h-2 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                              </div>
                            )}
                            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-zinc-900/80 text-white backdrop-blur-xs">
                              {item.category}
                            </span>
                            {badgeText && (
                              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black ${theme.accentBg} uppercase tracking-wider shadow-sm`}>
                                ★ {badgeText}
                              </span>
                            )}
                          </div>
                          <div className="absolute bottom-3 left-4 right-4 text-white">
                            <h3 className={`text-lg sm:text-2xl font-black leading-tight drop-shadow-md ${textAlignClass}`}>
                              {item.name}
                            </h3>
                            {displayDescription && (
                              <p className="text-xs sm:text-sm text-zinc-200 line-clamp-2 mt-1 drop-shadow-xs max-w-2xl">
                                {displayDescription}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className={`p-5 ${theme.heroHeaderBg || 'bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            {hasDietary && (
                              <div
                                className={`w-4 h-4 rounded-xs flex items-center justify-center border bg-white shadow-2xs ${
                                  isVeg ? 'border-emerald-600' : 'border-rose-600'
                                }`}
                              >
                                <div className={`w-2 h-2 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                              </div>
                            )}
                            <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                              {item.category}
                            </span>
                            {badgeText && (
                              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black ${theme.accentBg} uppercase tracking-wider shadow-2xs`}>
                                ★ {badgeText}
                              </span>
                            )}
                          </div>
                          <h3 className={`text-xl sm:text-2xl font-black ${textAlignClass}`}>{item.name}</h3>
                          {displayDescription && (
                            <p className="text-xs sm:text-sm opacity-80 mt-1 max-w-2xl">{displayDescription}</p>
                          )}
                        </div>
                      )}

                      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-black/5 dark:border-white/5">
                        <div className="space-y-2">
                          <div className="flex items-baseline gap-2">
                            <span className={`font-extrabold font-mono text-lg sm:text-2xl ${theme.priceColor} notranslate`}>
                              {item.currency || 'Rs.'} {displayPrice.toLocaleString()}
                            </span>
                            {hasVariants && activeVariant && (
                              <span className="text-xs font-semibold opacity-70">
                                [{activeVariant.name}]
                              </span>
                            )}
                          </div>

                          {/* Subcategory selection pills (Minimalistic and Easy Navigation) */}
                          {hasVariants && item.variants && item.variants.length > 0 && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <MinimalistScrollContainer
                                trackWidth={48}
                                contentClassName="flex items-center gap-1.5 py-1"
                              >
                                {item.variants.map((v) => {
                                  const isSelected = activeVariant?.id === v.id;
                                  const isVariantUnavailable = isItemOutOfStock || v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable';
                                  return (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={(e) => {
                                        if (isVariantUnavailable) return;
                                        handleSelectVariant(item.id, v, e);
                                      }}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1 border shrink-0 ${
                                        isVariantUnavailable
                                          ? 'grayscale opacity-50 bg-zinc-200/80 border-zinc-300 text-zinc-400 cursor-not-allowed select-none pointer-events-none'
                                          : isSelected
                                            ? theme.variantActive + ' cursor-pointer'
                                            : theme.variantInactive + ' cursor-pointer'
                                      }`}
                                    >
                                      {(v.food_type === 'veg' || v.food_type === 'non-veg') && (
                                    <div className={`w-2 h-2 rounded-[2px] flex flex-shrink-0 items-center justify-center border bg-white ${v.food_type === 'veg' ? 'border-emerald-600' : 'border-rose-600'}`}>
                                      <div className={`w-1 h-1 rounded-full ${v.food_type === 'veg' ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                                    </div>
                                  )}
                                  <span className={isVariantUnavailable ? 'line-through' : ''}>{v.name}</span>
                                      <span className={`font-mono text-[10px] notranslate ${isSelected && !isVariantUnavailable ? 'font-black' : 'opacity-70'}`}>
                                        · {item.currency || 'Rs.'}{Number(v.price).toLocaleString()}
                                      </span>
                                      {isVariantUnavailable && (
                                        <span className="text-[9px] font-bold text-rose-500 bg-rose-50 border border-rose-200 px-1 py-0.2 rounded-xs ml-0.5">
                                          {(v as any).status === 'unavailable' ? 'Unavailable' : 'Out of Stock'}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </MinimalistScrollContainer>
                            </div>
                          )}
                        </div>

                        {isItemOutOfStock ? (
                          <span className="text-xs font-bold text-rose-500 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
                            {item.status === 'unavailable' ? 'Unavailable' : 'Sold Out'}
                          </span>
                        ) : !isReadOnlyMode && isHost && isAvailable ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenItemCard(item);
                            }}
                            className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 shadow-sm ${theme.accentBg} hover:opacity-85 cursor-pointer shrink-0`}
                          >
                            {variantCartQty > 0 ? (
                              <span>{variantCartQty} in cart</span>
                            ) : (
                              <>
                                <Plus className="w-4 h-4" />
                                <span>Add to Order</span>
                              </>
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : effectiveStyle === 'bento' ? (
                      /* ------------------------------------------------------------- */
                      /* STYLE B: BENTO SPLIT CARDS (Compact Photo + Details Beside)   */
                      /* ------------------------------------------------------------- */
                      <div className="p-3 sm:p-3.5 flex flex-col gap-2 cursor-pointer" onClick={() => { if (!isItemOutOfStock) { setSelectedDetailItem(item); setIsDetailModalOpen(true); } }}>
                      <div className="flex items-start gap-3 sm:gap-3.5">
                        {showPhoto && displayImage && (
                          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden shrink-0 bg-zinc-100 relative shadow-2xs">
                            <img
                              src={displayImage}
                              alt={item.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            {hasDietary && (
                              <div className="absolute top-1.5 left-1.5">
                                <div
                                  className={`w-3.5 h-3.5 rounded-xs flex items-center justify-center border bg-white shadow-2xs ${
                                    isVeg ? 'border-emerald-600' : 'border-rose-600'
                                  }`}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className={`flex-1 flex flex-col justify-between min-w-0 min-h-[76px] ${textAlignClass}`}>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {(!showPhoto || !displayImage) && hasDietary && (
                                <div
                                  className={`w-3 h-3 rounded-xs flex items-center justify-center border bg-white shrink-0 ${
                                    isVeg ? 'border-emerald-600' : 'border-rose-600'
                                  }`}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                                </div>
                              )}
                              <h4 className="font-bold text-sm sm:text-base leading-snug truncate">{item.name}</h4>
                              {badgeText && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${theme.accentBg} uppercase tracking-wider`}>
                                  ★ {badgeText}
                                </span>
                              )}
                              {hasVariants && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/60">
                                  {item.variant_group_name || 'Options'}
                                </span>
                              )}
                            </div>
                            {displayDescription && (
                              <p className="text-[11px] sm:text-xs opacity-75 line-clamp-1 mt-0.5">{displayDescription}</p>
                            )}
                          </div>

                          {/* Price and Add button directly beside image */}
                          <div className="pt-1.5 mt-1 flex items-center justify-between gap-2 border-t border-black/5 dark:border-white/5">
                            <div className="min-w-0">
                              <span className={`font-bold font-mono text-sm sm:text-base ${theme.priceColor} notranslate`}>
                                {item.currency || 'Rs.'} {displayPrice.toLocaleString()}
                              </span>
                              {hasVariants && activeVariant && (
                                <span className="ml-1 text-[9px] font-semibold opacity-70 truncate block sm:inline">
                                  [{activeVariant.name}]
                                </span>
                              )}
                            </div>

                            {isItemOutOfStock ? (
                              <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                {item.status === 'unavailable' ? 'Unavailable' : 'Sold Out'}
                              </span>
                            ) : !isReadOnlyMode && isHost && isAvailable ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenItemCard(item);
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-2xs ${theme.accentBg} hover:opacity-85 cursor-pointer shrink-0`}
                              >
                                {variantCartQty > 0 ? (
                                  <span>{variantCartQty} in cart</span>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add</span>
                                  </>
                                )}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Full-width Subcategories Selector Pills (Dedicated Row: 100% visible on mobile) */}
                      {hasVariants && item.variants && item.variants.length > 0 && (
                        <div
                          className="pt-2 border-t border-black/5 dark:border-white/5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MinimalistScrollContainer
                            trackWidth={44}
                            contentClassName="flex items-center gap-1.5 py-1"
                          >
                            <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-75 shrink-0">
                              {item.variant_group_name ? `${item.variant_group_name}:` : 'Option:'}
                            </span>
                            {item.variants.map((v) => {
                              const isSelected = activeVariant?.id === v.id;
                              const isVariantUnavailable = isItemOutOfStock || v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable';
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={(e) => {
                                    if (isVariantUnavailable) return;
                                    handleSelectVariant(item.id, v, e);
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1 border shrink-0 ${
                                    isVariantUnavailable
                                      ? 'grayscale opacity-50 bg-zinc-200/80 border-zinc-300 text-zinc-400 cursor-not-allowed select-none pointer-events-none'
                                      : isSelected
                                        ? theme.variantActive + ' cursor-pointer'
                                        : theme.variantInactive + ' cursor-pointer'
                                  }`}
                                >
                                  {(v.food_type === 'veg' || v.food_type === 'non-veg') && (
                                    <div className={`w-2 h-2 rounded-[2px] flex flex-shrink-0 items-center justify-center border bg-white ${v.food_type === 'veg' ? 'border-emerald-600' : 'border-rose-600'}`}>
                                      <div className={`w-1 h-1 rounded-full ${v.food_type === 'veg' ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                                    </div>
                                  )}
                                  <span className={isVariantUnavailable ? 'line-through' : ''}>{v.name}</span>
                                  <span className={`font-mono text-[10px] notranslate ${isSelected && !isVariantUnavailable ? 'font-black' : 'opacity-70'}`}>
                                    · {item.currency || 'Rs.'}{Number(v.price).toLocaleString()}
                                  </span>
                                  {isVariantUnavailable && (
                                    <span className="text-[9px] font-bold text-rose-500 bg-rose-50 border border-rose-200 px-1 py-0.2 rounded-xs ml-0.5">
                                      {(v as any).status === 'unavailable' ? 'Unavailable' : 'Out of Stock'}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </MinimalistScrollContainer>
                        </div>
                      )}
                    </div>
                  ) : effectiveStyle === 'text_only' ? (
                      /* ------------------------------------------------------------- */
                      /* STYLE C: TEXT ONLY (Classic Luxury Elegance / Fills Space)    */
                      /* ------------------------------------------------------------- */
                      <div className="p-4 sm:p-5 flex flex-col justify-between h-full space-y-3 cursor-pointer" onClick={() => { setSelectedDetailItem(item); setIsDetailModalOpen(true); }}>
                      <div>
                        {/* Top Category & Badge Line */}
                        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-black/5 dark:border-white/5">
                          <div className="flex items-center gap-1.5">
                            {hasDietary && (
                              <div
                                className={`w-3.5 h-3.5 rounded-xs flex items-center justify-center border bg-white shrink-0 ${
                                  isVeg ? 'border-emerald-600' : 'border-rose-600'
                                }`}
                              >
                                <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                              </div>
                            )}
                            <span className="text-xs font-semibold opacity-70">{item.category || 'Specialty'}</span>
                          </div>

                          {badgeText && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${theme.accentBg} uppercase tracking-wider shadow-2xs`}>
                              ★ {badgeText}
                            </span>
                          )}
                        </div>

                        {/* Title and Dot Leader to Price */}
                        <div className={`flex items-baseline justify-between gap-2 ${textAlignClass}`}>
                          <h4 className="font-bold text-base sm:text-lg leading-snug">{item.name}</h4>
                          <div className="hidden sm:inline-block flex-1 border-b border-dotted border-current opacity-30 mx-2 mb-1" />
                          <div className="text-right shrink-0">
                            <span className={`font-bold font-mono text-base sm:text-lg ${theme.priceColor} notranslate`}>
                              {item.currency || 'Rs.'} {displayPrice.toLocaleString()}
                            </span>
                            {hasVariants && activeVariant && (
                              <span className="block text-[10px] font-semibold opacity-70">
                                [{activeVariant.name}]
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Description */}
                        {displayDescription && (
                          <p className={`text-xs opacity-75 mt-1.5 leading-relaxed line-clamp-3 ${textAlignClass}`}>
                            {displayDescription}
                          </p>
                        )}

                        {/* Interactive Subcategory Selector Pills */}
                        {hasVariants && item.variants && item.variants.length > 0 && (
                          <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                            <MinimalistScrollContainer
                              trackWidth={44}
                              contentClassName="flex items-center gap-1.5 py-1"
                            >
                              <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-75 shrink-0">
                                {item.variant_group_name ? `${item.variant_group_name}:` : 'Option:'}
                              </span>
                              {item.variants.map((v) => {
                                const isSelected = activeVariant?.id === v.id;
                                const isVariantUnavailable = isItemOutOfStock || v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable';
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={(e) => {
                                      if (isVariantUnavailable) return;
                                      handleSelectVariant(item.id, v, e);
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1 border shrink-0 ${
                                      isVariantUnavailable
                                        ? 'grayscale opacity-50 bg-zinc-200/80 border-zinc-300 text-zinc-400 cursor-not-allowed select-none pointer-events-none'
                                        : isSelected
                                          ? theme.variantActive + ' cursor-pointer'
                                          : theme.variantInactive + ' cursor-pointer'
                                    }`}
                                  >
                                    {(v.food_type === 'veg' || v.food_type === 'non-veg') && (
                                    <div className={`w-2 h-2 rounded-[2px] flex flex-shrink-0 items-center justify-center border bg-white ${v.food_type === 'veg' ? 'border-emerald-600' : 'border-rose-600'}`}>
                                      <div className={`w-1 h-1 rounded-full ${v.food_type === 'veg' ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                                    </div>
                                  )}
                                  <span className={isVariantUnavailable ? 'line-through' : ''}>{v.name}</span>
                                    <span className={`font-mono text-[10px] notranslate ${isSelected && !isVariantUnavailable ? 'font-black' : 'opacity-70'}`}>
                                      · {item.currency || 'Rs.'}{Number(v.price).toLocaleString()}
                                    </span>
                                    {isVariantUnavailable && (
                                      <span className="text-[9px] font-bold text-rose-500 bg-rose-50 border border-rose-200 px-1 py-0.2 rounded-xs ml-0.5">
                                        {(v as any).status === 'unavailable' ? 'Unavailable' : 'Out of Stock'}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </MinimalistScrollContainer>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                        <span className="text-[11px] opacity-60 font-medium">Prepared Fresh</span>
                        {isItemOutOfStock ? (
                          <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                            {item.status === 'unavailable' ? 'Unavailable' : 'Sold Out'}
                          </span>
                        ) : !isReadOnlyMode && isHost && isAvailable ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenItemCard(item);
                            }}
                            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${theme.accentBg} hover:opacity-85 cursor-pointer`}
                          >
                            {variantCartQty > 0 ? (
                              <span>{variantCartQty} in cart</span>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add to Order</span>
                              </>
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                      /* ------------------------------------------------------------- */
                      /* STYLE D: UPDATED INTERACTIVE CUSTOMER CARD (Compact Mobile + Desktop) */
                      /* ---------------------------------------------------------------------- */
                      <div className="bg-white p-2.5 sm:p-3 flex flex-col gap-1.5 sm:gap-2 relative w-full h-full justify-between rounded-2xl border border-zinc-200 shadow-2xs">
                        {/* Top Right: Cart Pill or Out of Stock Badge */}
                        <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-10 pointer-events-none">
                          {isItemOutOfStock ? (
                            <div className="px-2 sm:px-2.5 py-0.5 rounded-full border border-rose-300 text-rose-600 text-[10px] sm:text-xs font-black bg-rose-50 shadow-2xs">
                              {item.status === 'unavailable' ? 'Unavailable' : 'Out of Stock'}
                            </div>
                          ) : (
                            <div className="px-2 sm:px-2.5 py-0.5 rounded-full border border-[#3b2d24] text-[#3b2d24] text-[10px] sm:text-xs font-black bg-white shadow-2xs">
                              {getItemCartQuantity(item.id)} in cart
                            </div>
                          )}
                        </div>

                        {/* Top Section: Image on left, Name & Price & Thin Description Box beside Image */}
                        <div className="flex flex-row gap-2 sm:gap-2.5 items-start relative">
                          {/* Left: Image */}
                          {showPhoto && displayImage && (
                            <div 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setSelectedDetailItem(item); 
                                setIsDetailModalOpen(true); 
                              }}
                              className="shrink-0 rounded-xl sm:rounded-2xl overflow-hidden relative shadow-2xs bg-zinc-100 cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ width: '4.25rem', height: '4.25rem' }}
                            >
                              <img 
                                src={displayImage} 
                                alt={item.name} 
                                className="w-full h-full object-cover" 
                                referrerPolicy="no-referrer" 
                              />
                            </div>
                          )}

                          {/* Beside Image: Name on top, and beside the price is a thin description box */}
                          <div className="flex flex-col justify-between flex-1 min-w-0" style={{ minHeight: showPhoto && displayImage ? '4.25rem' : 'auto' }}>
                            {/* Dish Name: pr-16 leaves clearance for '0 in cart' pill on top right */}
                            <h3 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setSelectedDetailItem(item); 
                                setIsDetailModalOpen(true); 
                              }}
                              className="font-extrabold text-sm sm:text-base text-[#3b2d24] truncate pr-16 sm:pr-20 leading-tight cursor-pointer hover:text-amber-800"
                            >
                              {item.name}
                            </h3>

                            {/* Row: Price & Thin Description Box beside Price */}
                            <div className="flex flex-row items-center gap-1.5 mt-0.5 sm:mt-1 flex-nowrap">
                              {/* Price */}
                              <div className="shrink-0 flex flex-col justify-center">
                                <div className="font-black text-sm sm:text-base text-[#3b2d24] leading-tight notranslate">
                                  {item.currency || 'Rs.'} {displayPrice.toLocaleString()}
                                </div>
                                {hasVariants && (
                                  <div className="text-[#8c7b6d] text-[10px] sm:text-xs font-semibold truncate leading-tight">
                                    [{activeVariant?.name || 'Base'}]
                                  </div>
                                )}
                              </div>

                              {/* Beside the price: Thin Description Box */}
                              {displayDescription ? (
                                <div className="flex-1 min-w-0 bg-[#e8e4e1]/60 rounded-lg px-2 py-0.5 sm:px-2 sm:py-0.5 relative flex flex-col justify-center border border-[#ded8d2]/70 h-8 sm:h-9 overflow-hidden">
                                  <div className="flex items-center justify-between gap-1 leading-none">
                                    <span className="text-[9px] font-bold text-[#3b2d24] shrink-0">Description</span>
                                    <button 
                                      type="button"
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setSelectedDetailItem(item); 
                                        setIsDetailModalOpen(true); 
                                      }} 
                                      className="text-[9px] font-extrabold text-[#3b2d24] hover:underline cursor-pointer uppercase tracking-wider bg-transparent border-0 p-0 leading-none shrink-0"
                                    >
                                      Read more
                                    </button>
                                  </div>
                                  <p className="text-[10px] text-[#5c4a3d] truncate leading-tight mt-0.5">
                                    {displayDescription}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Divider */}
                        {((hasVariants && item.variants && item.variants.length > 0) || (!isReadOnlyMode && isHost && isAvailable) || isItemOutOfStock) && (
                          <hr className="border-[#e8e4e1] my-0.5" />
                        )}

                        {/* Bottom Section: Variants & Add */}
                        {hasVariants && item.variants && item.variants.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <p className="text-[9px] sm:text-[10px] font-extrabold text-[#8c7b6d] uppercase tracking-wider leading-none">
                                {item.variant_group_name ? `${item.variant_group_name}:` : 'PORTION / SIZE:'}
                              </p>
                              {isItemOutOfStock && (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md">
                                  {item.status === 'unavailable' ? 'Unavailable' : 'Out of Stock'}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 sm:gap-1.5">
                              {item.variants.map((v) => {
                                 const isVariantUnavailable = isItemOutOfStock || v.is_available === false || (v as any).status === 'out_of_stock' || (v as any).status === 'unavailable';
                                 const vQty = getItemVariantCartQty(item.id, v.id);
                                 const isSelected = activeVariant?.id === v.id;
                                 const isExpanded = !isVariantUnavailable && !isReadOnlyMode && isHost && isAvailable && (vQty > 0 || isSelected);
                                 
                                 return (
                                   <div key={v.id} 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isVariantUnavailable) return;
                                        if (!isExpanded) handleSelectVariant(item.id, v, e);
                                      }} 
                                      className={`flex items-center rounded-xl overflow-hidden border transition-all ${
                                        isVariantUnavailable
                                          ? 'grayscale opacity-50 bg-zinc-200/80 border-zinc-300 text-zinc-400 cursor-not-allowed select-none pointer-events-none'
                                          : isExpanded 
                                            ? 'bg-[#5c4a3d] border-[#5c4a3d] text-white shadow-2xs' 
                                            : 'bg-[#faf8f5] border-[#e8e4e1] text-[#3b2d24] cursor-pointer hover:bg-[#f3eee8] hover:border-[#ded8d2]'
                                      }`}
                                   >
                                      <div className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 font-bold text-xs ${isExpanded ? "text-white" : isVariantUnavailable ? "text-zinc-400" : "text-[#3b2d24]"}`}>
                                        {(v.food_type === "veg" || v.food_type === "non-veg") && (
                                          <div className={`w-2.5 h-2.5 rounded-[2px] flex flex-shrink-0 items-center justify-center border ${
                                            isVariantUnavailable
                                              ? "bg-zinc-200 border-zinc-300"
                                              : isExpanded 
                                                ? "bg-transparent border-white/40" 
                                                : "bg-white " + (v.food_type === "veg" ? "border-emerald-600" : "border-rose-600")
                                          }`}>
                                            <div className={`w-1.5 h-1.5 rounded-full ${
                                              isVariantUnavailable
                                                ? "bg-zinc-400"
                                                : isExpanded 
                                                  ? "bg-white" 
                                                  : (v.food_type === "veg" ? "bg-emerald-600" : "bg-rose-600")
                                            }`} />
                                          </div>
                                        )}
                                        <span className={isVariantUnavailable ? 'line-through' : ''}>{v.name}</span>
                                        <span className={`font-mono text-[10px] ml-1 notranslate ${isExpanded ? 'opacity-70' : isVariantUnavailable ? 'text-zinc-400' : 'opacity-70'}`}>
                                          • {item.currency || "Rs."} {Number(v.price).toLocaleString()}
                                        </span>
                                        {isVariantUnavailable && (
                                          <span className="text-[9px] font-bold text-rose-500 bg-rose-50 border border-rose-200/80 px-1.5 py-0.2 rounded-md ml-1 not-italic no-underline inline-block">
                                            Out of Stock
                                          </span>
                                        )}
                                      </div>
                                      {isExpanded && !isVariantUnavailable && (
                                        <div className="flex items-center gap-2 sm:gap-2.5 px-1.5 sm:px-2 py-0.5 bg-[#4a3b30] text-white border-l border-[#6b5849] font-black text-sm">
                                          <button 
                                            type="button"
                                            className="hover:text-amber-300 text-white transition p-0.5 leading-none cursor-pointer"
                                            onClick={(e) => { 
                                              e.stopPropagation(); 
                                              handleUpdateQuantity(`${item.id}_${v.id}`, vQty - 1); 
                                            }}
                                          >
                                            -
                                          </button>
                                          <span className="text-xs min-w-[12px] text-center leading-none text-white font-bold">{vQty}</span>
                                          <button 
                                            type="button"
                                            className="hover:text-amber-300 text-white transition p-0.5 leading-none cursor-pointer"
                                            onClick={(e) => { 
                                              e.stopPropagation(); 
                                              if (vQty === 0) {
                                                handleAddToCartWithDetails(item, 1, '', v);
                                              } else {
                                                handleUpdateQuantity(`${item.id}_${v.id}`, vQty + 1);
                                              }
                                            }}
                                          >
                                            +
                                          </button>
                                        </div>
                                      )}
                                   </div>
                                 );
                              })}
                            </div>
                          </div>
                        ) : isItemOutOfStock ? (
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200/80 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              {item.status === 'unavailable' ? 'Currently Unavailable' : 'Out of Stock'}
                            </span>
                          </div>
                        ) : (
                          !isReadOnlyMode && isHost && isAvailable && (
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap gap-1">
                                {(() => {
                                  const singleQty = getItemCartQuantity(item.id);
                                  return (
                                    <div className="flex items-center rounded-xl overflow-hidden border transition-all cursor-pointer bg-[#5c4a3d] border-[#5c4a3d] text-white shadow-2xs">
                                       <div 
                                         className="px-2 sm:px-2.5 py-1 font-bold text-xs whitespace-nowrap truncate max-w-[170px] sm:max-w-[220px] text-white"
                                         title={singleQty > 0 ? 'Added to Cart' : `Add ${item.name}`}
                                         onClick={(e) => {
                                           e.stopPropagation();
                                           if (singleQty === 0) handleAddToCartWithDetails(item, 1);
                                         }}
                                       >
                                         {singleQty > 0 ? 'Added to Cart' : `Add ${item.name}`}
                                       </div>
                                       <div className="flex items-center gap-2 sm:gap-2.5 px-1.5 sm:px-2 py-0.5 bg-[#4a3b30] text-white border-l border-[#6b5849] font-black text-sm">
                                         <button 
                                           type="button"
                                           aria-label="Decrease quantity"
                                           className="hover:text-amber-300 text-white transition p-0.5 leading-none cursor-pointer"
                                           onClick={(e) => { 
                                             e.stopPropagation(); 
                                             if (singleQty > 0) {
                                               handleUpdateQuantity(item.id, singleQty - 1); 
                                             }
                                           }}
                                         >
                                           -
                                         </button>
                                         <span className="text-xs min-w-[12px] text-center leading-none text-white font-bold">{singleQty}</span>
                                         <button 
                                           type="button"
                                           aria-label="Increase quantity"
                                           className="hover:text-amber-300 text-white transition p-0.5 leading-none cursor-pointer"
                                           onClick={(e) => { 
                                             e.stopPropagation(); 
                                             if (singleQty === 0) {
                                               handleAddToCartWithDetails(item, 1);
                                             } else {
                                               handleUpdateQuantity(item.id, singleQty + 1); 
                                             }
                                           }}
                                         >
                                           +
                                         </button>
                                       </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          )
                        )}
                      </div>

                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Custom Tax Notice / Footer */}
        {businessProfile?.menu_theme_config?.taxNotice && (
          <div className="mt-10 py-4 text-center text-xs opacity-70 border-t border-black/10 dark:border-white/10 font-medium">
            {businessProfile.menu_theme_config.taxNotice}
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar for Active Order / Table Cart (visible when modal is closed) */}
      {!isCartOpen && !isTrackerOpen && !isFinalBillPageOpen && !sessionExpired && (
        (isHost && totalCartCount > 0) ||
        (!isHost && activeOrderItemsCount > 0) ||
        (activeOrder && activeOrderItemsCount > 0)
      ) && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none animate-in slide-in-from-bottom-3 duration-200">
          <button
            id="btn-floating-view-cart"
            type="button"
            onClick={() => { pushCustomerHistoryGuard('cart'); setIsCartOpen(true); }}
            className="pointer-events-auto max-w-md w-full bg-zinc-950 hover:bg-zinc-900 text-white p-3 rounded-2xl shadow-2xl border border-amber-500/40 flex items-center justify-between gap-3 cursor-pointer transition active:scale-[0.98] ring-1 ring-black/10 backdrop-blur-md"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-bold shrink-0">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div className="text-left min-w-0 truncate">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-white truncate">
                    {!isHost ? 'Live Table Cart' : (totalCartCount > 0 ? 'Your Order Cart' : 'Live Table Order')}
                  </span>
                  {!isHost && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      View-Only
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 truncate">
                  {!isHost
                    ? `${activeOrderItemsCount} ${activeOrderItemsCount === 1 ? 'item' : 'items'} ordered by table host`
                    : (totalCartCount > 0 ? `${totalCartCount} items in cart` : `${activeOrderItemsCount} items ordered`)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeOrder && (
                <span className="text-xs font-mono font-bold text-amber-400">
                  {businessProfile?.currency || 'Rs.'} {(activeOrder.total_amount || activeOrder.subtotal || 0).toLocaleString()}
                </span>
              )}
              <span className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold rounded-lg transition flex items-center gap-1">
                <span>View Cart</span>
                <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </button>
        </div>
      )}

      <MenuItemDetailModal
        isOpen={isDetailModalOpen}
        item={selectedDetailItem}
        initialVariant={selectedDetailItem ? getActiveVariant(selectedDetailItem) : undefined}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedDetailItem(null);
        }}
        showImages={theme.layout !== 'list'}
        isHost={isHost}
        isReadOnly={isReadOnlyMode}
        cartItems={cartItems}
        currentCartQuantity={selectedDetailItem ? getItemCartQuantity(selectedDetailItem.id) : 0}
        onAddToCart={(item, quantity, instructions, selectedVariant) => {
          handleAddToCartWithDetails(item, quantity, instructions, selectedVariant);
        }}
        onUpdateCartItem={(item, quantity, instructions, selectedVariant) => {
          handleAddToCartWithDetails(item, quantity, instructions, selectedVariant);
        }}
      />

      <CustomerCartModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        activeOrder={activeOrder}
        tableInfo={{
          tableId: tableParams.tableId,
          tableNumber: tableParams.tableNumber,
          businessId: tableParams.businessId,
          isHost: isHost,
          hostToken: hostToken,
          sessionId: tableParams.sessionId,
          existingOrderId: activeOrder?.id,
          creditOnly: tableParams.creditOnly,
          creditCustomerName: tableParams.creditCustomerName,
          creditCustomerPhone: tableParams.creditCustomerPhone,
          creditPin: tableParams.creditPin,
          creditGlAccountId: tableParams.creditGlAccountId,
          creditGlAccountNumber: tableParams.creditGlAccountNumber,
          creditGlAccountName: tableParams.creditGlAccountName,
          compEnabled: Boolean(tableParams.compEnabled),
          compOrdererName: tableParams.compOrdererName,
          compOrdererPhone: tableParams.compOrdererPhone,
        }}
        packagingFee={taxConfig?.packaging_fee}
        isHost={isHost}
        hostToken={hostToken}
        onUpdateQuantity={handleUpdateQuantity}
        onUpdateSpecialInstructions={handleUpdateSpecialInstructions}
        onUpdatePackaging={handleUpdatePackaging}
        onClearCart={handleClearCart}
        onOrderConfirmed={(orderData) => {
          setIsCartOpen(false);
          pushCustomerHistoryGuard('tracker');
          setSuccessOrderData(orderData.status === 'AWAITING_PAYMENT' ? orderData : null);
          setActiveOrder((prev) => {
            const next = !prev
              ? orderData
              : {
                  ...prev,
                  order_number: prev.order_number || orderData.order_number,
                  items: [...(prev.items || []), ...(orderData.items || [])],
                  subtotal: (Number(prev.subtotal) || 0) + (Number(orderData.subtotal) || 0),
                  packaging_charge: (Number(prev.packaging_charge) || 0) + (Number(orderData.packaging_charge) || 0),
                  packaging_qty: (Number(prev.packaging_qty) || 0) + (Number(orderData.packaging_qty) || 0),
                  total_amount: (Number(prev.total_amount) || 0) + (Number(orderData.total_amount) || 0),
                  tax_amount: (Number(prev.tax_amount) || 0) + (Number(orderData.tax_amount) || 0),
                  bill_requested: prev.bill_requested || orderData.bill_requested,
                };
            persistActiveOrder(next);
            return next;
          });
          setIsTrackerOpen(true);
        }}
        onRequestCompConfirmation={(itemsToComp, notes) => {
          setIsCartOpen(false);
          setPendingCompCartItems(itemsToComp);
          setPendingCompNotes(notes || '');
          setIsCompConfirmOpen(true);
        }}
      />

      <CompConfirmationPage
        isOpen={isCompConfirmOpen}
        onClose={() => setIsCompConfirmOpen(false)}
        cartItems={pendingCompCartItems.length > 0 ? pendingCompCartItems : cartItems}
        generalNotes={pendingCompNotes}
        tableInfo={{
          tableId: tableParams.tableId,
          tableNumber: tableParams.tableNumber,
          floor: tableParams.floor,
          building: tableParams.building,
          businessId: tableParams.businessId,
          businessName: businessProfile?.name,
          existingOrderId: activeOrder?.id,
          sessionId: tableParams.sessionId,
          hostToken: hostToken,
          compOrdererName: tableParams.compOrdererName,
          compOrdererPhone: tableParams.compOrdererPhone,
        }}
        currencySymbol={taxConfig?.currency_symbol || businessProfile?.currency || 'Rs.'}
        packagingFee={taxConfig?.packaging_fee}
        onOrderConfirmed={(orderData) => {
          setIsCompConfirmOpen(false);
          pushCustomerHistoryGuard('tracker');
          setSuccessOrderData(orderData.status === 'AWAITING_PAYMENT' ? orderData : null);
          setActiveOrder((prev) => {
            const next = !prev
              ? orderData
              : {
                  ...prev,
                  order_number: prev.order_number || orderData.order_number,
                  items: [...(prev.items || []), ...(orderData.items || [])],
                  subtotal: (Number(prev.subtotal) || 0) + (Number(orderData.subtotal) || 0),
                  packaging_charge: (Number(prev.packaging_charge) || 0) + (Number(orderData.packaging_charge) || 0),
                  packaging_qty: (Number(prev.packaging_qty) || 0) + (Number(orderData.packaging_qty) || 0),
                  total_amount: (Number(prev.total_amount) || 0) + (Number(orderData.total_amount) || 0),
                  tax_amount: (Number(prev.tax_amount) || 0) + (Number(orderData.tax_amount) || 0),
                  bill_requested: prev.bill_requested || orderData.bill_requested,
                };
            persistActiveOrder(next);
            return next;
          });
          setIsTrackerOpen(true);
        }}
        onClearCart={handleClearCart}
      />

      {(successOrderData || (isTrackerOpen && activeOrder)) && (
        <OrderSuccessModal
          isOpen={true}
          isHost={isHost}
          kdsPrintMode={businessProfile?.kds_print_mode || 'DISPLAY_ONLY'}
          onClose={() => {
            setSuccessOrderData(null);
            setIsTrackerOpen(false);
          }}
          order={successOrderData || activeOrder}
          onOrderMore={() => {
            setSuccessOrderData(null);
            setIsTrackerOpen(false);
          }}
          onOpenFinalBillPage={handleOpenFinalBillPage}
          onClearCart={handleClearCart}
          onRequestBillOrPaid={handleBillSettledOrRequested}
          onSettled={(orderId, tableNum, settledOrder) => handleOrderSettled(orderId, tableNum, settledOrder || activeOrder)}
        />
      )}
    </div>
  );
};





