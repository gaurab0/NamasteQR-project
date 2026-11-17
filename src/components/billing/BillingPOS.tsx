import { CreditAccountSelectionModal } from './CreditAccountSelectionModal';
import { CashierSalesSheet } from './CashierSalesSheet';
import { calculateBillTotals, computeOrderBillableAmounts } from '../../utils/taxCalculations';
import { renderFormattedDate } from '../../utils/dateFormatter';
import { amountToWords } from '../../utils/numberToWords';
import { useSyncedOperationsState } from '../../hooks/useSyncedOperationsState';
import { applySaleDeletion, formatVenueDateStr, isSaleInRevenueWindow } from '../../utils/revenueWindow';
import { normalizeLegacyRole } from '../../utils/tabAccess';
import React, { useState, useEffect, useMemo, useRef } from 'react';

import { usePrinter } from '../../contexts/PrinterContext';
import {
  Receipt,
  Wallet,
  Lock,
  Unlock,
  Play,
  Coins,
  UserCheck,
  DollarSign,
  Calendar,
  Filter,
  Trash2,
  Settings,
  Plus,
  Minus,
  Printer,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  CreditCard,
  QrCode,
  Search,
  FileText,
  X,
  ChevronDown,
  Clock,
  ArrowUpRight,
  Percent,
  RefreshCw,
  ShoppingBag,
  Utensils,
  Eye,
  Tag,
  ShieldAlert,
  Sliders,
  WifiOff,
  Check,
  Building,
  User,
  Phone,
  Database,
  FileSpreadsheet,
  Download,
  ArrowRight,
  BookOpen,
  Layers,
  Maximize2,
  Minimize2,
  XCircle,
  ChefHat,
  Package,
  Bell,
  Activity,
  ChevronRight,
  ShieldCheck,
  Gift
} from 'lucide-react';
import { LiveStationOrdersModal } from '../dashboard/LiveStationOrdersModal';
import { 
  exportSalesToExcel, 
  buildSalesWorkbookData, 
  ExcelSheetData 
} from '../../utils/excelExport';
import { rbacService } from '../../services/rbac.service';
import { socketService } from '../../services/socket.service';
import {
  SaleRecord,
  CashierRegisterSession,
  SaleItem,
  SaleTaxBreakdown,
  BusinessTaxConfig,
  TaxRateItem,
  SalesTimeFilter,
  SalePaymentMethod,
  SaleType,
  RestaurantTable,
  TableOrder,
  GLAccountLink,
  MenuItem,
  FoodType,
  CompRecord
} from '../../types/rbac';
import { Business } from '../../types/auth';
import {
  ReceiptSlipModal,
  formatPanVatDisplay,
  formatDocumentTitleWithPrefix,
  getInvoicePrefix
} from './ReceiptSlipModal';

interface BillingPOSProps {
  business: Business;
  user?: any;
  activeRole?: string;
  isViewOnly?: boolean;
  onRequestRoleSignIn?: () => void;
  onNavigate?: (path: string) => void;
  onNavigateTab?: (tab: any, subTab?: any) => void;
}

export const BillingPOS: React.FC<BillingPOSProps> = ({
  business,
  user,
  activeRole,
  isViewOnly = false,
  onRequestRoleSignIn,
  onNavigate,
  onNavigateTab,
}) => {
  const canSettleBill = !isViewOnly;
  const currentStaffSession = rbacService.getCurrentStaffSession();
  const effectiveRole = normalizeLegacyRole(activeRole || currentStaffSession?.role || user?.role);
  const isManagerOrOwner =
    effectiveRole === 'OWNER' ||
    effectiveRole === 'MANAGER' ||
    effectiveRole === 'RESTAURANT_OWNER' ||
    effectiveRole === 'RESTAURANT_MANAGER' ||
    effectiveRole === 'ADMIN' ||
    Boolean(user?.isOwner && !currentStaffSession);
  const activeCashier = currentStaffSession
    ? { id: currentStaffSession.id, name: currentStaffSession.name, email: currentStaffSession.email }
    : { id: user?.id, name: user?.name, email: user?.email };
  const [posSubTab, setPosSubTab] = useState<'register' | 'cashier_sheet'>('register');
  const { opsConfig, revenueWindow, storeStatus } = useSyncedOperationsState(
    business.id,
    business.operations_config,
    business.current_operational_day
  );

  // Cashier Shift Register & Drawer Float States
  const [cashierSession, setCashierSession] = useState<CashierRegisterSession | null>(null);
  const [allCashierSessions, setAllCashierSessions] = useState<CashierRegisterSession[]>([]);
  const [selectedCashierFilter, setSelectedCashierFilter] = useState<string>('ALL');
  const [drawerFloatInput, setDrawerFloatInput] = useState<string>('0');
  const [closingCashInput, setClosingCashInput] = useState<string>('');
  const [closingNotesInput, setClosingNotesInput] = useState<string>('');
  const [showCloseShiftModal, setShowCloseShiftModal] = useState<boolean>(false);
  const [isSessionOperating, setIsSessionOperating] = useState<boolean>(false);
  // State
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [taxConfig, setTaxConfig] = useState<BusinessTaxConfig | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [pendingOrders, setPendingOrders] = useState<TableOrder[]>([]);
  const [payFirstOrders, setPayFirstOrders] = useState<TableOrder[]>([]);
  const [glAccounts, setGlAccounts] = useState<GLAccountLink[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // Time & search filters
  const [activeSubTab, setActiveSubTab] = useState<'pos' | 'records' | 'gl_accounts'>('pos');
  const [selectedOrderToSettle, setSelectedOrderToSettle] = useState<string | undefined>(undefined);
  const [selectedTableIdToOrder, setSelectedTableIdToOrder] = useState<string | undefined>(undefined);
  const [isStationModalOpen, setIsStationModalOpen] = useState(false);
  const [stationModalTab, setStationModalTab] = useState<'kitchen' | 'waiter' | 'tables' | 'all'>('all');

  const handleOpenStationModal = (tab: 'kitchen' | 'waiter' | 'tables' | 'all') => {
    setStationModalTab(tab);
    setIsStationModalOpen(true);
  };
  const [saleModalMode, setSaleModalMode] = useState<'TABLE' | 'COUNTER' | 'SETTLE_TABLE'>('TABLE');

  const openSaleModal = (mode: 'TABLE' | 'COUNTER' | 'SETTLE_TABLE', orderId?: string) => {
    if (!canSettleBill) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
      return;
    }
    if (!storeStatus.isOpen && mode !== 'SETTLE_TABLE' && !orderId) {
      showStatus(storeStatus.reason || 'Business day is closed. Reopen or start the day to take new orders.', 'error');
      return;
    }
    setSaleModalMode(mode);
    setSelectedOrderToSettle(orderId);
    setShowNewSaleModal(true);
  };
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [excelPreviewOpen, setExcelPreviewOpen] = useState<boolean>(false);
  const [excelPreviewSheets, setExcelPreviewSheets] = useState<ExcelSheetData[]>([]);
  const [excelPreviewPrefix, setExcelPreviewPrefix] = useState<string>('Sales_Register');
  const [timeFilter, setTimeFilter] = useState<SalesTimeFilter>('ALL');
  const [customDate, setCustomDate] = useState<string>(
    formatVenueDateStr(new Date(), business?.operations_config)
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  // Modals state
  const [showNewSaleModal, setShowNewSaleModal] = useState<boolean>(false);
  const [showDeleteDayModal, setShowDeleteDayModal] = useState<boolean>(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState<boolean>(false);
  const [selectedSaleForView, setSelectedSaleForView] = useState<SaleRecord | null>(null);
  const [saleToDelete, setSaleToDelete] = useState<SaleRecord | null>(null);
  const [isOrdersFullScreen, setIsOrdersFullScreen] = useState<boolean>(false);
  const [printingOrder, setPrintingOrder] = useState<TableOrder | null>(null);
  const [cancellingItemKey, setCancellingItemKey] = useState<string | null>(null);

  // Deletion feedback
  const [dayToDelete, setDayToDelete] = useState<string>(
    formatVenueDateStr(new Date(), business?.operations_config)
  );
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isCleaningOrders, setIsCleaningOrders] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { dispatchPrint } = usePrinter();

  // Background Sale Sync & Offline Queue
  const [saleSyncStatus, setSaleSyncStatus] = useState<{
    id: string;
    tableOrCounter: string;
    amount: number;
    status: 'SYNCING' | 'SUCCESS' | 'OFFLINE_RETRY' | 'CONFLICT';
    message: string;
    invoiceNumber?: string;
    errorMessage?: string;
    optimisticSale: SaleRecord;
  } | null>(null);

  const syncBannerTimeoutRef = useRef<any>(null);
  const isProcessingQueueRef = useRef<boolean>(false);

  const getSalesQueueKey = () => `serveflow_sales_sync_queue_${business.id}`;

  const processSalesQueue = async () => {
    if (isProcessingQueueRef.current || !business.id) return;
    const queueKey = getSalesQueueKey();
    let queue: any[] = [];
    try {
      queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
    } catch {}
    if (!queue.length) return;

    isProcessingQueueRef.current = true;
    try {
      while (queue.length > 0) {
        const item = queue[0];
        try {
          const created = await rbacService.createSaleApi(item.salePayload, item.businessId);

          if (item.salePayload.table_id) {
            const tableObj = tables.find((t) => t.id === item.salePayload.table_id);
            rbacService.acknowledgeTablePingApi(item.salePayload.table_id, item.businessId, tableObj?.table_number).catch(() => {});
          }

          // Swap optimistic sale in state with official server created sale
          setSales((prev) => prev.map((s) => (s.id === item.clientQueueId ? created : s)));

          // Remove completed item from queue
          queue.shift();
          localStorage.setItem(queueKey, JSON.stringify(queue));

          if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
          setSaleSyncStatus({
            id: item.clientQueueId,
            status: 'SUCCESS',
            message: `Sale for ${item.optimisticSale.table_number || 'Counter'} recorded! Invoice #${created.invoice_number}`,
            tableOrCounter: item.optimisticSale.table_number || 'Counter',
            amount: Number(created.total_amount) || item.optimisticSale.total_amount || 0,
            invoiceNumber: created.invoice_number,
            optimisticSale: created,
          });

          syncBannerTimeoutRef.current = setTimeout(() => {
            setSaleSyncStatus((curr) => (curr?.id === item.clientQueueId ? null : curr));
          }, 8000);
        } catch (err: any) {
          if (err?.message && /already been settled/i.test(err.message)) {
            // Concurrency conflict
            queue.shift();
            localStorage.setItem(queueKey, JSON.stringify(queue));
            setSales((prev) => prev.filter((s) => s.id !== item.clientQueueId));
            if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
            setSaleSyncStatus({
              id: item.clientQueueId,
              status: 'CONFLICT',
              message: `Order for ${item.optimisticSale.table_number || 'table'} was already settled by another cashier.`,
              tableOrCounter: item.optimisticSale.table_number || 'table',
              amount: item.optimisticSale.total_amount || 0,
              errorMessage: err.message,
              optimisticSale: item.optimisticSale,
            });
          } else {
            // Network/offline error - keep in queue with backoff
            item.retryCount = (item.retryCount || 0) + 1;
            localStorage.setItem(queueKey, JSON.stringify(queue));
            if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
            setSaleSyncStatus({
              id: item.clientQueueId,
              status: 'OFFLINE_RETRY',
              message: `Offline / Network drop. Sale for ${item.optimisticSale.table_number || 'Counter'} queued safely. Retrying automatically...`,
              tableOrCounter: item.optimisticSale.table_number || 'Counter',
              amount: item.optimisticSale.total_amount || 0,
              optimisticSale: item.optimisticSale,
            });
            break;
          }
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  };

  useEffect(() => {
    processSalesQueue();
    const handleOnline = () => processSalesQueue();
    window.addEventListener('online', handleOnline);
    const interval = setInterval(() => {
      const stored = localStorage.getItem(getSalesQueueKey());
      if (stored && stored !== '[]') {
        processSalesQueue();
      }
    }, 12000);
    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
      if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
    };
  }, [business.id]);

  const handleQueueSale = (salePayload: Partial<SaleRecord>, optimisticSale: SaleRecord) => {
    // 1. Optimistic state updates - instant dismissal & table clearing
    setSales((prev) => [optimisticSale, ...prev.filter((s) => s.id !== optimisticSale.id)]);
    if (optimisticSale.order_id) {
      setPendingOrders((prev) => prev.filter((o) => o.id !== optimisticSale.order_id));
      setPayFirstOrders((prev) => prev.filter((o) => o.id !== optimisticSale.order_id));
    }
    if (optimisticSale.table_id) {
      setPendingOrders((prev) => prev.filter((o) => o.table_id !== optimisticSale.table_id));
    }
    setShowNewSaleModal(false);
    setSelectedOrderToSettle(undefined);
    setSelectedTableIdToOrder(undefined);

    // 2. Direct automatic background printing (no preview modal blocking the screen)
    dispatchPrint('BILL', { ...optimisticSale, tax_config: taxConfig }).catch((err) => {
      console.warn('Direct receipt print dispatch:', err);
    });

    // 3. Set top sync status banner
    if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
    setSaleSyncStatus({
      id: optimisticSale.id,
      status: 'SYNCING',
      message: `Syncing sale for ${optimisticSale.table_number || 'Counter'} (Rs. ${(optimisticSale.total_amount || 0).toFixed(2)})...`,
      tableOrCounter: optimisticSale.table_number || 'Counter',
      amount: optimisticSale.total_amount || 0,
      optimisticSale,
    });

    // 4. Enqueue in persistent localStorage
    const queueKey = getSalesQueueKey();
    let queue: any[] = [];
    try {
      queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
    } catch {}
    queue.push({
      clientQueueId: optimisticSale.id,
      businessId: business.id,
      salePayload,
      optimisticSale,
      createdAt: Date.now(),
      retryCount: 0,
    });
    localStorage.setItem(queueKey, JSON.stringify(queue));

    // 5. Trigger background processor
    processSalesQueue();
  };

  // Load initial data
  useEffect(() => {
    loadBillingData();
  }, [business.id]);

  // Reload session when cashier filter or active trading day changes
  useEffect(() => {
    if (!business.id) return;
    const targetCashierId = isManagerOrOwner && selectedCashierFilter !== 'ALL' ? selectedCashierFilter : activeCashier.id;
    if (targetCashierId) {
      rbacService.getCurrentCashierSessionApi(targetCashierId, business.id).then(setCashierSession).catch(() => {});
    }
    rbacService.getAllCashierSessionsApi(business.id).then(setAllCashierSessions).catch(() => {});
  }, [selectedCashierFilter, business.id, isManagerOrOwner, activeCashier.id, revenueWindow.businessDate]);

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4500);
  };

  const handleCancelOrderItem = async (orderId: string, itemIndex: number, itemName: string) => {
    if (!window.confirm(`Are you sure you want to cancel "${itemName}" from this table order?`)) {
      return;
    }
    const cancelKey = `${orderId}-${itemIndex}`;
    try {
      setCancellingItemKey(cancelKey);
      await rbacService.cancelTableOrderItemApi(orderId, { index: itemIndex }, business.id);
      showStatus(`Cancelled "${itemName}" from order`, 'success');
    } catch (err: any) {
      console.error('Failed to cancel order item:', err);
      showStatus(err.message || 'Failed to cancel order item', 'error');
    } finally {
      setCancellingItemKey(null);
    }
  };

  const parseOrderDate = (val: any) => {
    if (!val) return new Date();
    if (val.toDate && typeof val.toDate === 'function') return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const processIncomingOrders = (rawOrders: any[]) => {
    const liveOrders: TableOrder[] = rawOrders.map((d: any) => ({
      id: d.id,
      order_number: d.order_number,
      business_id: d.business_id || business.id,
      table_id: d.table_id || 'table-general',
      table_number: d.table_number || 'Table',
      floor: d.floor ?? null,
      building: d.building ?? null,
      items: d.items || [],
      subtotal: d.subtotal || 0,
      tax_amount: d.tax_amount || 0,
      total_amount: d.total_amount || 0,
      currency: d.currency || 'Rs.',
      customer_name: d.customer_name || 'Guest',
      customer_phone: d.customer_phone || '',
      credit_only: Boolean(d.credit_only),
      credit_pin_verified: Boolean(d.credit_pin_verified || d.pin_verified),
      credit_gl_account_id: d.credit_gl_account_id || null,
      credit_gl_account_number: d.credit_gl_account_number || null,
      credit_gl_account_name: d.credit_gl_account_name || null,
      order_notes: d.order_notes || '',
      status: d.status || 'RECEIVED',
      pay_first: d.pay_first ?? false,
      payment_confirmed_at: d.payment_confirmed_at ? parseOrderDate(d.payment_confirmed_at) : null,
      payment_confirmed_by: d.payment_confirmed_by || null,
      sale_id: d.sale_id || null,
      payment_status: d.payment_status || null,
      payment_rejected_reason: d.payment_rejected_reason || null,
      ready_at: d.ready_at ? parseOrderDate(d.ready_at) : null,
      served_at: d.served_at ? parseOrderDate(d.served_at) : null,
      bill_requested: Boolean(d.bill_requested),
      bill_requested_at: d.bill_requested_at ? parseOrderDate(d.bill_requested_at) : null,
      bill_acknowledged: Boolean(d.bill_acknowledged),
      folio_delivered: Boolean(d.folio_delivered),
      folio_delivered_at: d.folio_delivered_at ? parseOrderDate(d.folio_delivered_at) : null,
      payment_method: d.payment_method || null,
      promo_code: d.promo_code || null,
      promo_discount: d.promo_discount || 0,
      taxes: d.taxes || [],
      created_at: parseOrderDate(d.created_at),
      updated_at: parseOrderDate(d.updated_at),
    } as TableOrder));

    const unsettled = liveOrders.filter((o) => {
      const statusUpper = (o.status || '').toUpperCase();
      const paymentStatusUpper = (o.payment_status || '').toUpperCase();
      if (o.pay_first) return false;
      if (statusUpper === 'AWAITING_PAYMENT') return false;
      if (statusUpper === 'COMPLETED' || statusUpper === 'CANCELLED') return false;
      if ((o as any).settled || paymentStatusUpper === 'PAID' || Boolean(o.sale_id)) return false;
      return true;
    });
    const awaitingPayment = liveOrders.filter(
      (o) => o.status === 'AWAITING_PAYMENT'
    ).sort((a, b) => {
       const timeA = a.created_at instanceof Date ? a.created_at.getTime() : new Date(a.created_at || 0).getTime();
       const timeB = b.created_at instanceof Date ? b.created_at.getTime() : new Date(b.created_at || 0).getTime();
       return timeA - timeB; // Oldest first
    });
    setPayFirstOrders(awaitingPayment);
    unsettled.sort((a, b) => {
      const aFolio = Boolean(a.folio_delivered || (a as any).bill_acknowledged);
      const bFolio = Boolean(b.folio_delivered || (b as any).bill_acknowledged);
      if (aFolio && !bFolio) return -1;
      if (!aFolio && bFolio) return 1;

      if (a.bill_requested && !b.bill_requested) return -1;
      if (!a.bill_requested && b.bill_requested) return 1;

      const timeA = a.created_at instanceof Date ? a.created_at.getTime() : new Date(a.created_at || 0).getTime();
      const timeB = b.created_at instanceof Date ? b.created_at.getTime() : new Date(b.created_at || 0).getTime();
      return timeB - timeA;
    });
    setPendingOrders(unsettled);
  };

  const loadBillingData = async () => {
    try {
      setLoading(true);
      const [configData, salesData, tablesData, glData, ordersData, menuData] = await Promise.all([
        rbacService.getTaxConfigApi(business.id).catch(() => null),
        rbacService.getSalesApi({}, business.id).catch(() => []),
        rbacService.getTablesApi(business.id).catch(() => []),
        rbacService.getGLAccountsApi(business.id).catch(() => []),
        rbacService.getTableOrdersApi(undefined, business.id).catch(() => []),
        rbacService.getMenusApi(business.id).catch(() => []),
      ]);

      if (configData) setTaxConfig(configData);
      setSales((prev) => {
        const serverIds = new Set((salesData || []).map((s) => s.id));
        const pendingOpt = prev.filter((s) => s.id.startsWith('sale-opt-') && !serverIds.has(s.id));
        return [...pendingOpt, ...(salesData || [])];
      });
      setTables(tablesData || []);
      setGlAccounts(glData || []);
      if (menuData) setMenuItems(menuData || []);
      // Load Cashier Session for Today
      const targetCashierId = isManagerOrOwner && selectedCashierFilter !== 'ALL' ? selectedCashierFilter : activeCashier.id;
      if (targetCashierId) {
        rbacService.getCurrentCashierSessionApi(targetCashierId, business.id).then(setCashierSession).catch(() => {});
      }
      rbacService.getAllCashierSessionsApi(business.id).then(setAllCashierSessions).catch(() => {});

      if (ordersData && Array.isArray(ordersData)) {
        processIncomingOrders(ordersData);
      }
    } catch (err: any) {
      console.error('Failed to load billing data:', err);
      showStatus('Failed to load billing data. Please refresh.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Real-time Socket.io listener for instant Folio Delivered & Order updates
  useEffect(() => {
    if (!business.id) return;
    socketService.joinBusiness(business.id);

    const unsubSocket = socketService.subscribeToOrders((updatedOrder: any) => {
      if (!updatedOrder || !updatedOrder.id) return;
      const parsedUpdatedOrder: Partial<TableOrder> = {
        ...updatedOrder,
        ...(updatedOrder.bill_requested !== undefined ? { bill_requested: Boolean(updatedOrder.bill_requested) } : {}),
        ...(updatedOrder.bill_acknowledged !== undefined ? { bill_acknowledged: Boolean(updatedOrder.bill_acknowledged) } : {}),
        ...(updatedOrder.folio_delivered !== undefined ? { folio_delivered: Boolean(updatedOrder.folio_delivered) } : {}),
        ...(updatedOrder.folio_delivered_at !== undefined ? { folio_delivered_at: updatedOrder.folio_delivered_at ? parseOrderDate(updatedOrder.folio_delivered_at) : null } : {}),
        ...(updatedOrder.created_at !== undefined ? { created_at: parseOrderDate(updatedOrder.created_at) } : {}),
        ...(updatedOrder.updated_at !== undefined ? { updated_at: parseOrderDate(updatedOrder.updated_at) } : {}),
      };

      setPayFirstOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === updatedOrder.id);
        const existingOrder = idx >= 0 ? prev[idx] : null;
        const effectiveStatus = parsedUpdatedOrder.status !== undefined ? parsedUpdatedOrder.status : existingOrder?.status;

        if (effectiveStatus === 'AWAITING_PAYMENT') {
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...prev[idx], ...parsedUpdatedOrder };
            return next;
          }
          // Only add a new pay-first order if it was placed as awaiting payment
          return [...prev, parsedUpdatedOrder as TableOrder];
        } else {
          // If status transitioned away from AWAITING_PAYMENT (e.g. verified/PAID or CANCELLED)
          if (idx >= 0) {
            return prev.filter((o) => o.id !== updatedOrder.id);
          }
          return prev;
        }
      });

      setPendingOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === updatedOrder.id);
        const existingOrder = idx >= 0 ? prev[idx] : null;
        const rawStatus = parsedUpdatedOrder.status !== undefined ? parsedUpdatedOrder.status : existingOrder?.status;
        const effectiveStatus = (rawStatus || '').toUpperCase();

        // An order that is awaiting payment belongs strictly in payFirstOrders, never pendingOrders
        if (effectiveStatus === 'AWAITING_PAYMENT') {
          return prev.filter((o) => o.id !== updatedOrder.id);
        }

        const isPayFirst = Boolean(parsedUpdatedOrder.pay_first ?? existingOrder?.pay_first ?? false);
        if (isPayFirst) {
          return prev.filter((o) => o.id !== updatedOrder.id);
        }

        const paymentStatus = ((parsedUpdatedOrder.payment_status ?? existingOrder?.payment_status ?? '') as string).toUpperCase();
        const saleId = parsedUpdatedOrder.sale_id ?? existingOrder?.sale_id;
        const isSettled = Boolean((parsedUpdatedOrder as any).settled || (existingOrder as any)?.settled);

        const isClosed =
          effectiveStatus === 'COMPLETED' ||
          effectiveStatus === 'CANCELLED' ||
          isSettled ||
          paymentStatus === 'PAID' ||
          Boolean(saleId);

        if (isClosed) {
          return prev.filter((o) => o.id !== updatedOrder.id);
        }

        let next: TableOrder[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = { ...prev[idx], ...parsedUpdatedOrder };
        } else if (!isClosed && effectiveStatus) {
          next = [parsedUpdatedOrder as TableOrder, ...prev];
        } else {
          return prev;
        }

        return next.sort((a, b) => {
          const aFolio = Boolean(a.folio_delivered || (a as any).bill_acknowledged);
          const bFolio = Boolean(b.folio_delivered || (b as any).bill_acknowledged);
          if (aFolio && !bFolio) return -1;
          if (!aFolio && bFolio) return 1;

          if (a.bill_requested && !b.bill_requested) return -1;
          if (!a.bill_requested && b.bill_requested) return 1;

          const timeA = a.created_at instanceof Date ? a.created_at.getTime() : new Date(a.created_at || 0).getTime();
          const timeB = b.created_at instanceof Date ? b.created_at.getTime() : new Date(b.created_at || 0).getTime();
          return timeB - timeA;
        });
      });
    });

    // Real-time table updates (QR scans, status changes, session clears)
    const unsubTables = socketService.subscribeToTables((updatedTable: any) => {
      if (!updatedTable || !updatedTable.id) return;
      setTables((prev) => {
        const idx = prev.findIndex((t) => t.id === updatedTable.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...updatedTable };
          return next;
        }
        return [updatedTable, ...prev];
      });
    });

    // Real-time sales sync (keeps POS Register and Dashboard revenue in sync across terminals)
    const unsubSales = socketService.subscribeToSales((newSale: SaleRecord) => {
      if (!newSale?.id || (newSale.business_id && newSale.business_id !== business.id)) return;
      setSales((prev) => (prev.some((s) => s.id === newSale.id) ? prev : [newSale, ...prev]));
    });
    const unsubSalesDel = socketService.subscribeToSalesDeleted((payload) => {
      setSales((prev) => applySaleDeletion(prev, payload));
    });
    const unsubReconnect = socketService.onReconnect(() => {
      loadBillingData();
    });

    // 5-second polling fallback to keep tables & scan check-in sessions fresh
    const tablePollInterval = setInterval(() => {
      rbacService.getTablesApi(business.id).then((fresh) => {
        if (Array.isArray(fresh)) setTables(fresh);
      }).catch(() => {});
    }, 5000);

    return () => {
      unsubSocket();
      unsubTables();
      unsubSales();
      unsubSalesDel();
      unsubReconnect();
      clearInterval(tablePollInterval);
    };
  }, [business.id]);

  // Active occupied tables (customers scanned QR & opened menu)
  const activeOccupiedTables = useMemo(() => {
    return tables.filter((t) => t.status === 'OCCUPIED');
  }, [tables]);

  const sortedActiveTables = useMemo(() => {
    return [...activeOccupiedTables].sort((a, b) => {
      const timeA = new Date(a.last_scanned_at || a.updated_at).getTime();
      const timeB = new Date(b.last_scanned_at || b.updated_at).getTime();
      return timeB - timeA;
    });
  }, [activeOccupiedTables]);

  const allKitchenOrders = useMemo(() => {
    return pendingOrders.filter((o) =>
      o.status === 'PENDING' || o.status === 'RECEIVED' || o.status === 'PREPARING'
    );
  }, [pendingOrders]);

  const allWaiterOrders = useMemo(() => {
    return pendingOrders.filter((o) =>
      o.status === 'READY' || o.status === 'PREPARING' || o.status === 'PENDING' || o.status === 'RECEIVED'
    );
  }, [pendingOrders]);

  const kitchenOrders = useMemo(() => {
    return [...allKitchenOrders]
      .sort((a, b) => {
        const tA = Math.max(0, Date.now() - new Date(a.created_at).getTime());
        const tB = Math.max(0, Date.now() - new Date(b.created_at).getTime());
        return tA - tB;
      })
      .slice(0, 3);
  }, [allKitchenOrders]);

  const waiterOrders = useMemo(() => {
    return [...allWaiterOrders]
      .sort((a, b) => {
        const tA = Math.max(0, Date.now() - new Date(a.created_at).getTime());
        const tB = Math.max(0, Date.now() - new Date(b.created_at).getTime());
        return tA - tB;
      })
      .slice(0, 3);
  }, [allWaiterOrders]);

  // Group pending orders by table for unified table folios & distinct active table counts
  const groupedTableOrders = useMemo(() => {
    const map = new Map<string, TableOrder[]>();
    for (const ord of pendingOrders) {
      const key = ord.table_id || (ord.table_number ? `tbl_${String(ord.table_number).trim().toLowerCase()}` : ord.id);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ord);
    }

    return Array.from(map.values()).map((orders) => {
      const sorted = [...orders].sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeA - timeB;
      });

      const primaryOrder = sorted[0];
      const latestOrder = sorted[sorted.length - 1];
      const table = tables.find((t) => t.id === primaryOrder.table_id);
      const tableName = table ? `Table ${table.table_number}` : (primaryOrder.table_number ? (String(primaryOrder.table_number).toLowerCase().startsWith('table') ? primaryOrder.table_number : `Table ${primaryOrder.table_number}`) : 'Table');

      let maxRound = 1;
      for (const ord of sorted) {
        const m = (ord.order_number || '').match(/\(Round\s*(\d+)\)/i);
        if (m) {
          const r = parseInt(m[1], 10);
          if (r > maxRound) maxRound = r;
        }
        for (const it of ord.items || []) {
          if ((it as any).round_number && Number((it as any).round_number) > maxRound) {
            maxRound = Number((it as any).round_number);
          }
        }
      }
      if (sorted.length > 1 && maxRound === 1) {
        maxRound = sorted.length;
      }

      const cleanRootOrderNumber = (primaryOrder.order_number || (primaryOrder.id ? primaryOrder.id.slice(0, 8).toUpperCase() : 'ORD'))
        .replace(/\s*\(Round\s*\d+\)/gi, '')
        .trim();

      const allActiveItems = sorted.flatMap((ord) => {
        const ordRoundMatch = (ord.order_number || '').match(/\(Round\s*(\d+)\)/i);
        const ordRoundNum = ordRoundMatch ? parseInt(ordRoundMatch[1], 10) : 1;
        return (ord.items || []).map((item, origIdx) => ({
          ...item,
          _orderId: ord.id,
          _origIdx: origIdx,
          round_number: (item as any).round_number || ordRoundNum,
        }));
      });

      const activeUncancelled = allActiveItems.filter((i) => i.status !== 'CANCELLED');

      const packagedOrders = sorted.filter((o) => Number(o.packaging_qty || 0) > 0);
      const ordListPkgComp =
        packagedOrders.length > 0 &&
        packagedOrders.every(
          (o) =>
            Boolean((o as any).is_packaging_comp) ||
            (o.packaging_charge !== undefined &&
              o.packaging_charge !== null &&
              Number(o.packaging_charge) === 0)
        );

      const ordBillable = computeOrderBillableAmounts(activeUncancelled, {
        packagingFeeRate: Math.max(0, Number(taxConfig?.packaging_fee ?? 10) || 0),
        isPackagingComp: ordListPkgComp,
      });

      const totalPromoDiscount = sorted.reduce((sum, o) => sum + (Number(o.promo_discount) || 0), 0);

      const tableTotals = calculateBillTotals({
        itemsMenuTotal: ordBillable.itemsMenuTotal,
        packagingTotal: ordBillable.packagingTotal,
        taxConfig,
        flatDiscountAmount: totalPromoDiscount,
      });

      const isFolioDelivered = sorted.some((o) => o.folio_delivered || (o as any).bill_acknowledged);
      const isBillRequested = sorted.some((o) => o.bill_requested);

      const customerName = sorted.find((o) => o.customer_name?.trim())?.customer_name || 'Guest';

      let overallStatus = 'SERVED';
      if (sorted.some((o) => o.status === 'RECEIVED' || o.status === 'PENDING')) {
        overallStatus = 'RECEIVED';
      } else if (sorted.some((o) => o.status === 'PREPARING')) {
        overallStatus = 'PREPARING';
      } else if (sorted.some((o) => o.status === 'READY')) {
        overallStatus = 'READY';
      }

      return {
        tableGroupKey: primaryOrder.table_id || primaryOrder.table_number || primaryOrder.id,
        primaryOrder,
        latestOrder,
        orders: sorted,
        table,
        tableName,
        cleanRootOrderNumber,
        maxRound,
        allActiveItems,
        activeUncancelled,
        totalPayable: tableTotals.grandTotal,
        itemsMenuTotal: ordBillable.itemsMenuTotal,
        packagingTotal: ordBillable.packagingTotal,
        isFolioDelivered,
        isBillRequested,
        customerName,
        overallStatus,
      };
    }).sort((a, b) => {
      if (a.isFolioDelivered && !b.isFolioDelivered) return -1;
      if (!a.isFolioDelivered && b.isFolioDelivered) return 1;
      if (a.isBillRequested && !b.isBillRequested) return -1;
      if (!a.isBillRequested && b.isBillRequested) return 1;
      const timeA = new Date(a.latestOrder.created_at || 0).getTime();
      const timeB = new Date(b.latestOrder.created_at || 0).getTime();
      return timeB - timeA;
    });
  }, [pendingOrders, tables, taxConfig]);

  const formatTimeElapsed = (date: string | Date | null | undefined) => {
    if (!date) return 'Active now';
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m ago`;
  };

  const todayStr = revenueWindow.businessDate;

  const weekRange = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);
    return formatVenueDateStr(start, opsConfig);
  }, [revenueWindow.businessDate, opsConfig]);

  const monthRange = useMemo(() => {
    const [y, m] = revenueWindow.businessDate.split('-');
    return `${y}-${m}-01`;
  }, [revenueWindow.businessDate]);

  // Filtered sales based on TimeFilter
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate =
        sale.date_string ||
        (sale.created_at ? formatVenueDateStr(new Date(sale.created_at), opsConfig) : '');

      // Time Filter
      if (timeFilter === 'DAY') {
        if (!isSaleInRevenueWindow(sale, revenueWindow)) return false;
      } else if (timeFilter === 'WEEK') {
        if (saleDate < weekRange) return false;
      } else if (timeFilter === 'MONTH') {
        if (saleDate < monthRange) return false;
      } else if (timeFilter === 'CUSTOM') {
        if (saleDate !== customDate) return false;
      }

      // Payment Method Filter
      if (paymentFilter !== 'ALL') {
        if (sale.payment_method !== paymentFilter) return false;
      }

      // Cashier Scope: Cashiers only see their own; Owners/Managers can filter or see all
      if (!isManagerOrOwner) {
        const myId = activeCashier.id;
        const myName = (activeCashier.name || '').toLowerCase();
        const myEmailPrefix = (activeCashier.email ? activeCashier.email.split('@')[0] : '').toLowerCase();
        const saleCashierName = (sale.cashier_name || '').toLowerCase();
        const matchesCashier = sale.cashier_id === myId || (!sale.cashier_id && Boolean(saleCashierName) && (saleCashierName === myName || saleCashierName === myEmailPrefix));
        if (!matchesCashier) return false;
      } else if (selectedCashierFilter !== 'ALL') {
        if (sale.cashier_id !== selectedCashierFilter) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesInvoice = sale.invoice_number.toLowerCase().includes(query);
        const matchesCustomer = (sale.customer_name || '').toLowerCase().includes(query);
        const matchesTable = (sale.table_number || '').toLowerCase().includes(query);
        const matchesCashier = (sale.cashier_name || '').toLowerCase().includes(query);
        const matchesItems = sale.items.some((i) => i.name.toLowerCase().includes(query));
        if (!matchesInvoice && !matchesCustomer && !matchesTable && !matchesCashier && !matchesItems) {
          return false;
        }
      }

      return true;
    });
  }, [sales, timeFilter, todayStr, weekRange, monthRange, customDate, paymentFilter, searchQuery, isManagerOrOwner, activeCashier.id, activeCashier.name, activeCashier.email, selectedCashierFilter]);

  // Earnings and Key Metrics Calculations
  const metrics = useMemo(() => {
    let totalGross = 0;
    let totalSubtotal = 0;
    let totalDiscounts = 0;
    let totalTaxCollected = 0;
    let totalServiceCharge = 0;

    const paymentCounts: Record<string, { count: number; total: number }> = {
      CASH: { count: 0, total: 0 },
      CARD: { count: 0, total: 0 },
      QR_CODE: { count: 0, total: 0 },
      DEDUCT_FROM_DEPOSIT: { count: 0, total: 0 },
      CREDIT: { count: 0, total: 0 },
    };

    filteredSales.forEach((s) => {
      totalGross += Number(s.total_amount) || 0;
      totalSubtotal += Number(s.subtotal) || 0;
      totalDiscounts += Number(s.discount_amount) || 0;
      totalTaxCollected += Number(s.total_tax) || 0;
      totalServiceCharge += Number(s.service_charge) || 0;

      const rawMethod = s.payment_method || 'CASH';
      const method = (rawMethod === 'UPI_QR' || rawMethod === 'QR_CODE' || (rawMethod as string) === 'ONLINE')
        ? 'QR_CODE'
        : rawMethod;
      if (!paymentCounts[method]) {
        paymentCounts[method] = { count: 0, total: 0 };
      }
      paymentCounts[method].count += 1;
      paymentCounts[method].total += Number(s.total_amount) || 0;
    });

    const count = filteredSales.length;
    const aov = count > 0 ? Math.round(totalGross / count) : 0;
    const netRevenue = totalGross - totalTaxCollected;

    return {
      totalGross,
      totalSubtotal,
      totalDiscounts,
      totalTaxCollected,
      totalServiceCharge,
      netRevenue,
      count,
      aov,
      paymentCounts,
    };
  }, [filteredSales]);

  // Today's summary for POS Register View (Cashier-scoped or Manager-selected, synchronized to revenueWindow)
  const todaySales = useMemo(() => {
    return sales.filter((sale) => {
      if (!isSaleInRevenueWindow(sale, revenueWindow)) return false;

      // Cashier scope: Cashiers only see their own settled bills
      if (!isManagerOrOwner) {
        const myId = activeCashier.id;
        const myName = (activeCashier.name || '').toLowerCase();
        const myEmailPrefix = (activeCashier.email ? activeCashier.email.split('@')[0] : '').toLowerCase();
        const saleCashierName = (sale.cashier_name || '').toLowerCase();
        const matchesCashier = sale.cashier_id === myId || (!sale.cashier_id && Boolean(saleCashierName) && (saleCashierName === myName || saleCashierName === myEmailPrefix));
        if (!matchesCashier) return false;
      } else if (selectedCashierFilter !== 'ALL') {
        if (sale.cashier_id !== selectedCashierFilter) return false;
      }

      return true;
    });
  }, [sales, revenueWindow, isManagerOrOwner, activeCashier.id, activeCashier.name, activeCashier.email, selectedCashierFilter]);

  const todayGross = useMemo(() => {
    return todaySales.reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
  }, [todaySales]);

  
  // Dynamic list of cashiers for Manager/Owner filter
  const availableCashiers = useMemo(() => {
    const map = new Map<string, string>();
    allCashierSessions.forEach((sess) => {
      if (sess.cashier_id) map.set(sess.cashier_id, sess.cashier_name || 'Cashier');
    });
    sales.forEach((s) => {
      if (s.cashier_id) {
        map.set(s.cashier_id, s.cashier_name || 'Cashier');
      }
    });
    if (activeCashier.id) {
      map.set(activeCashier.id, activeCashier.name || (activeCashier.email ? activeCashier.email.split('@')[0] : 'Me'));
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allCashierSessions, sales, activeCashier.id, activeCashier.name, activeCashier.email]);

  const isShiftOpen = cashierSession?.status === 'OPEN';
  const currentOpeningFloat = Number(cashierSession?.opening_float) || 0;

  const cashierCashCollected = useMemo(() => {
    return todaySales
      .filter((s) => s.payment_method === 'CASH')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
  }, [todaySales]);

  const cashierNonCashCollected = useMemo(() => {
    return todaySales
      .filter((s) => s.payment_method !== 'CASH')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
  }, [todaySales]);

  const expectedDrawerBalance = currentOpeningFloat + cashierCashCollected;

  const handleOpenShiftDrawer = async () => {
    const floatNum = parseFloat(drawerFloatInput) || 0;
    try {
      setIsSessionOperating(true);
      const sess = await rbacService.openCashierSessionApi(floatNum, 'Shift drawer opened', business.id);
      setCashierSession(sess);
      rbacService.getAllCashierSessionsApi(business.id).then(setAllCashierSessions).catch(() => {});
      showStatus(`Shift register opened with Rs. ${sess.opening_float.toLocaleString()} drawer float!`);
    } catch (err: any) {
      showStatus(err.message || 'Failed to open register', 'error');
    } finally {
      setIsSessionOperating(false);
    }
  };

  const handleCloseShiftDrawer = async () => {
    const closeNum = closingCashInput ? parseFloat(closingCashInput) : undefined;
    try {
      setIsSessionOperating(true);
      const sess = await rbacService.closeCashierSessionApi(closeNum, closingNotesInput, business.id);
      setCashierSession(sess);
      rbacService.getAllCashierSessionsApi(business.id).then(setAllCashierSessions).catch(() => {});
      setShowCloseShiftModal(false);
      setClosingCashInput('');
      setClosingNotesInput('');
      showStatus(`Shift register closed successfully! Reconciled cash: Rs. ${(sess.closing_cash || 0).toLocaleString()}`);
    } catch (err: any) {
      showStatus(err.message || 'Failed to close register', 'error');
    } finally {
      setIsSessionOperating(false);
    }
  };

  // Excel (.xlsx) Export Handler
  const handleExportToExcel = async (scope: 'filtered' | 'all') => {
    try {
      setIsExportingExcel(true);
      const dataToExport = scope === 'filtered' ? filteredSales : sales;
      if (!dataToExport || dataToExport.length === 0) {
        showStatus('No sales records available to export for the selected filter.', 'error');
        return;
      }
      const filterLabel =
        timeFilter === 'DAY'
          ? 'Today'
          : timeFilter === 'WEEK'
          ? 'Week'
          : timeFilter === 'MONTH'
          ? 'Month'
          : timeFilter === 'CUSTOM'
          ? customDate
          : 'All';
      const prefix = scope === 'filtered' ? `Sales_${filterLabel}_Register` : 'Sales_All_Register';
      let compRecords: CompRecord[] = [];
      try {
        let startDate: string | undefined = undefined;
        let endDate: string | undefined = undefined;
        if (scope === 'filtered' && filteredSales.length > 0) {
          const dates = filteredSales.map((s) => s.date_string).filter(Boolean).sort();
          startDate = dates[0];
          endDate = dates[dates.length - 1];
        }
        compRecords = await rbacService.getCompRecordsApi(business.id, { start_date: startDate, end_date: endDate });
      } catch (e) {
        // non-fatal, ledger sheet will be omitted
      }
      exportSalesToExcel(dataToExport, glAccounts, prefix, business.name, compRecords);
      showStatus(
        `Successfully exported ${dataToExport.length} sales record${dataToExport.length === 1 ? '' : 's'} and GL links to Excel (.xlsx)!`,
        'success'
      );
    } catch (err: any) {
      console.error('Failed to export to Excel:', err);
      showStatus(err.message || 'Failed to export sales to Excel.', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Handlers for Deletion
  const handleDeleteSingleSale = async () => {
    if (!saleToDelete) return;
    try {
      setIsDeleting(true);
      await rbacService.deleteSaleApi(saleToDelete.id, business.id);
      setSales((prev) => prev.filter((s) => s.id !== saleToDelete.id));
      showStatus(`Sale #${saleToDelete.invoice_number} successfully deleted.`);
      setSaleToDelete(null);
    } catch (err: any) {
      showStatus(err.message || 'Failed to delete sale record.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteDayHistory = async () => {
    if (!dayToDelete) return;
    try {
      setIsDeleting(true);
      const res = await rbacService.deleteSalesByDateApi(dayToDelete, business.id);
      setSales((prev) => prev.filter((s) => (s.date_string || s.created_at?.split('T')[0]) !== dayToDelete));
      showStatus(`Deleted ${res.deletedCount} sales record(s) for ${dayToDelete}.`);
      setShowDeleteDayModal(false);
    } catch (err: any) {
      showStatus(err.message || 'Failed to delete day sales history.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllHistory = async () => {
    if (deleteAllConfirmText !== 'DELETE ALL') {
      showStatus('Please type DELETE ALL exactly to confirm.', 'error');
      return;
    }
    try {
      setIsDeleting(true);
      const res = await rbacService.deleteAllSalesApi(business.id);
      setSales([]);
      showStatus(`Cleared entire sales history (${res.deletedCount} records deleted).`);
      setShowDeleteAllModal(false);
      setDeleteAllConfirmText('');
    } catch (err: any) {
      showStatus(err.message || 'Failed to clear sales history.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCleanupDailyOrders = async () => {
    try {
      setIsCleaningOrders(true);
      const res = await rbacService.cleanupDailyOrdersApi(business.id);
      await loadBillingData();
      showStatus(
        `Daily cleanup complete: ${res.deletedOrders} past order(s) (>24h) archived from database. Monthly sales history preserved (${res.deletedSales} expired sales purged).`
      );
    } catch (err: any) {
      showStatus(err.message || 'Failed to perform daily order cleanup.', 'error');
    } finally {
      setIsCleaningOrders(false);
    }
  };

  // Currency display helper
  const currencySymbol = taxConfig?.currency_symbol || taxConfig?.currency || 'Rs.';

  // Owner permissions check for GL accounts editing
  const isOwner = !isViewOnly;

  // Open interactive Excel spreadsheet editor & preview
  const handleOpenExcelPreview = async (scope: 'filtered' | 'all' = 'filtered') => {
    try {
      const dataToExport = scope === 'filtered' ? filteredSales : sales;
      if (!dataToExport || dataToExport.length === 0) {
        showStatus('No sales records available to preview.', 'error');
        return;
      }
      const filterLabel =
        timeFilter === 'DAY'
          ? 'Today'
          : timeFilter === 'WEEK'
          ? 'Week'
          : timeFilter === 'MONTH'
          ? 'Month'
          : timeFilter === 'CUSTOM'
          ? customDate
          : 'All';
      const prefix = scope === 'filtered' ? `Sales_${filterLabel}_Register` : 'Sales_All_Register';
      let compRecords: CompRecord[] = [];
      try {
        let startDate: string | undefined = undefined;
        let endDate: string | undefined = undefined;
        if (scope === 'filtered' && filteredSales.length > 0) {
          const dates = filteredSales.map((s) => s.date_string).filter(Boolean).sort();
          startDate = dates[0];
          endDate = dates[dates.length - 1];
        }
        compRecords = await rbacService.getCompRecordsApi(business.id, { start_date: startDate, end_date: endDate });
      } catch (e) {
        // non-fatal, ledger sheet will be omitted
      }
      const sheets = buildSalesWorkbookData(dataToExport, glAccounts, currencySymbol, compRecords);
      setExcelPreviewSheets(sheets);
      setExcelPreviewPrefix(prefix);
      setExcelPreviewOpen(true);
    } catch (err: any) {
      console.error('Failed to prepare Excel preview:', err);
      showStatus(err.message || 'Failed to prepare Excel preview.', 'error');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Background Sale Sync Banner */}
      {saleSyncStatus && (
        <div
          id="billing-sync-banner"
          className={`p-3.5 sm:p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-sm text-xs sm:text-sm font-semibold transition-all border ${
            saleSyncStatus.status === 'SYNCING'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : saleSyncStatus.status === 'SUCCESS'
              ? 'bg-emerald-700 text-white border-emerald-600'
              : saleSyncStatus.status === 'OFFLINE_RETRY'
              ? 'bg-amber-600 text-white border-amber-500'
              : 'bg-rose-700 text-white border-rose-600'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {saleSyncStatus.status === 'SYNCING' && <RefreshCw className="w-4 h-4 animate-spin text-amber-700" />}
            {saleSyncStatus.status === 'SUCCESS' && <CheckCircle2 className="w-4 h-4 text-emerald-200" />}
            {saleSyncStatus.status === 'OFFLINE_RETRY' && <WifiOff className="w-4 h-4 text-amber-200" />}
            {saleSyncStatus.status === 'CONFLICT' && <AlertTriangle className="w-4 h-4 text-rose-200" />}
            <span>{saleSyncStatus.message}</span>
          </div>

          <div className="flex items-center gap-2">
            {saleSyncStatus.status === 'SUCCESS' && saleSyncStatus.optimisticSale && (
              <button
                type="button"
                onClick={() => dispatchPrint('BILL', { ...saleSyncStatus.optimisticSale, tax_config: taxConfig })}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Re-print Receipt
              </button>
            )}
            {saleSyncStatus.status === 'OFFLINE_RETRY' && (
              <button
                type="button"
                onClick={() => processSalesQueue()}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Now
              </button>
            )}
            <button
              type="button"
              onClick={() => setSaleSyncStatus(null)}
              className="p-1 rounded-lg opacity-75 hover:opacity-100 transition-opacity cursor-pointer text-current"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Feedback Toast */}
      {statusMessage && (
        <div
          id="billing-toast"
          className={`p-4 rounded-xl flex items-center justify-between shadow-lg text-sm font-semibold transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-800 text-white border border-emerald-700'
              : 'bg-rose-800 text-white border border-rose-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-300" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-300" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-white/80 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner & Main Actions */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
              <Receipt className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-zinc-900">Billing & POS Register</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">
              {taxConfig?.tax_enabled ? 'Tax System Active' : 'Tax System Off'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl leading-relaxed">
            Record POS counter sales, settle active table tabs with custom business taxes, and manage live cashier registers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Settle Active Table Bill button */}
          {groupedTableOrders.length > 0 && (
            <button
              id="btn-settle-table-orders"
              type="button"
              onClick={() => openSaleModal('SETTLE_TABLE', groupedTableOrders[0]?.primaryOrder.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold hover:bg-amber-100 transition-colors shadow-2xs"
            >
              <Utensils className="w-4 h-4 text-amber-600" />
              Settle Table Bill ({groupedTableOrders.length})
            </button>
          )}

          {/* Quick POS Register Sale */}
          <button
            id="btn-new-pos-sale"
            type="button"
            disabled={!storeStatus.isOpen}
            title={!storeStatus.isOpen ? (storeStatus.reason || 'Business day is closed') : 'Record a new counter POS sale'}
            onClick={() => openSaleModal('COUNTER')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {storeStatus.isOpen ? 'New POS Sale' : 'Day Closed'}
          </button>

          
        </div>
      </div>

      {!storeStatus.isOpen && (
        <div
          id="banner-pos-store-closed"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-rose-900"
        >
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              {storeStatus.reason || 'Business day is currently closed.'} New customer QR &amp; counter POS orders are paused.
              {pendingOrders.length > 0 ? ' Existing open table bills can still be settled.' : ''}
            </span>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('operations', 'shift')}
              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold shrink-0 cursor-pointer"
            >
              Open Operations Hub
            </button>
          )}
        </div>
      )}

      {/* Billing & POS Sub-Tab Switcher */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100 border border-zinc-200/90 shadow-2xs">
        <button
          id="btn-pos-subtab-register"
          type="button"
          onClick={() => setPosSubTab('register')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            posSubTab === 'register'
              ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/80'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Receipt className="w-3.5 h-3.5 text-amber-600" />
          <span>POS Register</span>
        </button>
        <button
          id="btn-pos-subtab-cashier-sheet"
          type="button"
          onClick={() => setPosSubTab('cashier_sheet')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            posSubTab === 'cashier_sheet'
              ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/80'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span>Cashier Sales Sheet</span>
        </button>
      </div>

      {posSubTab === 'cashier_sheet' ? (
        <CashierSalesSheet
          business={business}
          sales={sales}
          initialSessions={allCashierSessions}
          availableCashiers={availableCashiers}
          isManagerOrOwner={isManagerOrOwner}
          activeCashier={activeCashier}
          revenueWindow={revenueWindow}
          opsConfig={opsConfig}
          currencySymbol={currencySymbol}
        />
      ) : (
      <div className="space-y-6 animate-in fade-in duration-150 pt-2">
          {/* Pay-First Orders Queue */}
          {payFirstOrders.length > 0 && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200/80 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-amber-600 text-white">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-amber-900">Pay-First Orders – Awaiting Verification</h3>
                  <p className="text-[11px] text-amber-700/80">
                    These orders will not be sent to the kitchen until you confirm payment.
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                   <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-600 text-white">
                      {payFirstOrders.length} Pending
                   </span>
                </div>
              </div>

              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {payFirstOrders.map((order) => {
                  const pfActiveItems = (order.items || []).filter((i: any) => i.status !== 'CANCELLED');
                  const pfPkgComp =
                    Boolean((order as any).is_packaging_comp) ||
                    (Number(order.packaging_qty || 0) > 0 &&
                      order.packaging_charge !== undefined &&
                      order.packaging_charge !== null &&
                      Number(order.packaging_charge) === 0);
                  const pfBillable = computeOrderBillableAmounts(pfActiveItems, {
                    packagingFeeRate: Math.max(0, Number(taxConfig?.packaging_fee ?? 10) || 0),
                    isPackagingComp: pfPkgComp,
                  });
                  const pfBill = calculateBillTotals({
                    itemsMenuTotal: pfBillable.itemsMenuTotal,
                    packagingTotal: pfBillable.packagingTotal,
                    taxConfig,
                    fallbackTaxes: order.taxes,
                    fallbackTaxAmount: order.tax_amount,
                    flatDiscountAmount: Number(order.promo_discount) || 0,
                  });
                  return (
                  <div key={order.id} className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col gap-3 shadow-xs">
                    <div className="flex justify-between items-start">
                       <div>
                          <div className="font-bold text-sm text-zinc-900 flex items-center gap-1.5 flex-wrap">
                            <span>{order.table_number ? (order.table_number.toString().trim().toLowerCase().startsWith('table') ? order.table_number : `Table #${order.table_number}`) : 'Table'}</span>
                            {order.credit_only && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                💳 Credit Only
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 font-mono">{order.order_number || order.id.slice(0,8).toUpperCase()}</div>
                          {(order.customer_name || order.customer_phone) && (
                            <div className="text-xs text-zinc-700 font-semibold mt-1 flex items-center gap-1.5 flex-wrap">
                              <span>👤 {order.customer_name || 'Guest'}</span>
                              {order.customer_phone && <span className="text-[11px] text-zinc-400 font-mono">({order.customer_phone})</span>}
                            </div>
                          )}
                       </div>
                       <div className="text-right">
                          <div className="font-black text-amber-600 text-sm">{order.currency || 'Rs.'} {pfBill.grandTotal.toFixed(2)}</div>
                          <div className="mt-1 flex flex-col items-end gap-1">
                            {order.payment_method === 'CREDIT' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                <CreditCard className="w-2.5 h-2.5" />
                                Credit
                              </span>
                            ) : order.payment_method === 'DEDUCT_FROM_DEPOSIT' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <Wallet className="w-2.5 h-2.5" />
                                Deduct Deposit
                              </span>
                            ) : order.payment_method === 'QR_CODE' || order.payment_method === 'UPI_QR' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                <QrCode className="w-2.5 h-2.5" />
                                QR Code
                              </span>
                            ) : order.payment_method === 'CASH' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <DollarSign className="w-2.5 h-2.5" />
                                Cash
                              </span>
                            ) : order.payment_method === 'CARD' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                <CreditCard className="w-2.5 h-2.5" />
                                Card
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200">
                                Selecting...
                              </span>
                            )}

                            {(order.credit_pin_verified || (order as any).pin_verified) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                PIN Verified
                              </span>
                            )}
                          </div>
                       </div>
                    </div>
                    
                    <div className="text-[11px] text-zinc-600 bg-zinc-50 p-2 rounded-lg border border-zinc-100 max-h-24 overflow-y-auto space-y-1">
                      {pfActiveItems.map((item: any, idx: number) => {
                        const qty = Number(item.quantity) || 1;
                        const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || (item.is_comp ? qty : 0)));
                        const isComp = Boolean(item.is_comp || compQty >= qty);
                        const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
                        const linePrice = isComp ? 0 : billedQty * (Number(item.price) || 0);
                        return (
                          <div key={idx} className="flex justify-between items-center gap-1">
                            <span className="truncate pr-2">
                              {item.quantity}x {item.name}
                              {isComp ? ' (🎁 Comp)' : compQty > 0 ? ` (${compQty}x Comp)` : ''}
                            </span>
                            <span className="shrink-0 font-mono">{linePrice.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 mt-auto">
                       <button
                         onClick={async () => {
                           if (isViewOnly) { onRequestRoleSignIn?.(); return; }
                           const cleanTableName = order.table_number ? (order.table_number.toString().trim().toLowerCase().startsWith('table') ? order.table_number : `Table #${order.table_number}`) : 'Table';
                           let method = order.payment_method;
                           if (!method || method === 'PENDING') {
                             method = prompt(`Confirm payment for ${cleanTableName}\nEnter payment method (CASH, QR_CODE, CARD, CREDIT, DEDUCT_FROM_DEPOSIT):`, 'CASH');
                             if (!method) return;
                           } else {
                             const isConfirmed = window.confirm(`Confirm ${method} payment of ${order.currency || 'Rs.'} ${pfBill.grandTotal.toFixed(2)} for ${cleanTableName}?`);
                             if (!isConfirmed) return;
                           }
                           
                           try {
                             await rbacService.confirmTableOrderPaymentApi(order.id, business.id, method.toUpperCase());
                           } catch(err: any) { 
                             alert(err.message || 'Error processing payment'); 
                           }
                         }}
                         className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold py-2 rounded-lg transition"
                       >
                         Confirm Payment
                       </button>
                       <button
                         onClick={async () => {
                           if (isViewOnly) { onRequestRoleSignIn?.(); return; }
                           const cleanTableName = order.table_number ? (order.table_number.toString().trim().toLowerCase().startsWith('table') ? order.table_number : `Table #${order.table_number}`) : 'Table';
                           const reason = prompt(`Reject payment for ${cleanTableName}\nEnter reason for rejection:`, 'Payment Failed');
                           if (!reason) return;
                           try {
                             await rbacService.rejectTableOrderPaymentApi(order.id, business.id, reason);
                             alert('Order rejected and cancelled.');
                           } catch(err: any) { alert(err.message); }
                         }}
                         className="flex-1 bg-zinc-100 hover:bg-red-50 text-zinc-600 hover:text-red-600 border border-zinc-200 hover:border-red-200 text-[11px] font-bold py-2 rounded-lg transition"
                       >
                         Reject / Cancel
                       </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}


          {/* Station Monitor: Active Tables & Live Orders */}
          <div className="bg-zinc-50/95 border border-zinc-200/90 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider pr-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Station Monitor</span>
              </div>

              {/* Active Tables Station Pill */}
              <button
                type="button"
                id="btn-pos-active-tables"
                onClick={() => handleOpenStationModal('tables')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-zinc-200/90 hover:border-emerald-300 hover:bg-emerald-50/50 text-xs font-bold text-zinc-800 transition-all shadow-2xs cursor-pointer group"
                title="Click to view live tables currently scanning & browsing the digital menu"
              >
                <div className="w-5 h-5 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <QrCode className="w-3.5 h-3.5" />
                </div>
                <span>Active Tables</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  sortedActiveTables.length > 0
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-zinc-100 text-zinc-500'
                }`}>
                  {sortedActiveTables.length} {sortedActiveTables.length === 1 ? 'table' : 'tables'}
                </span>
              </button>

              {/* Kitchen & Bar Station Pill */}
              <button
                type="button"
                id="btn-pos-kitchen-bar"
                onClick={() => handleOpenStationModal('kitchen')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-zinc-200/90 hover:border-amber-300 hover:bg-amber-50/50 text-xs font-bold text-zinc-800 transition-all shadow-2xs cursor-pointer group"
                title="Click to view live Kitchen & Bar orders"
              >
                <div className="w-5 h-5 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ChefHat className="w-3.5 h-3.5" />
                </div>
                <span>Kitchen & Bar</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  allKitchenOrders.length > 0
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-zinc-100 text-zinc-500'
                }`}>
                  {allKitchenOrders.length} {allKitchenOrders.length === 1 ? 'order' : 'orders'}
                </span>
              </button>

              {/* Waiter Service Station Pill */}
              <button
                type="button"
                id="btn-pos-waiter"
                onClick={() => handleOpenStationModal('waiter')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-zinc-200/90 hover:border-blue-300 hover:bg-blue-50/50 text-xs font-bold text-zinc-800 transition-all shadow-2xs cursor-pointer group"
                title="Click to view live Waiter Service Station orders"
              >
                <div className="w-5 h-5 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Bell className="w-3.5 h-3.5" />
                </div>
                <span>Waiter Station</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  allWaiterOrders.length > 0
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-zinc-100 text-zinc-500'
                }`}>
                  {allWaiterOrders.length} {allWaiterOrders.length === 1 ? 'order' : 'orders'}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleOpenStationModal('all')}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-600 hover:text-zinc-900 transition cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden sm:inline">Inspect Live Orders (Ascending)</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>

          {/* Active Dine-In Table Orders Ready for Billing */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-amber-100 text-amber-800">
                  <Utensils className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Active Dine-In Table Orders</h3>
                  <p className="text-xs text-zinc-500">
                    Live orders submitted by guests or waiters waiting for bill generation & cashier settlement
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {groupedTableOrders.filter((tg) => tg.isFolioDelivered).length > 0 && (
                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center gap-1.5 animate-pulse">
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    {groupedTableOrders.filter((tg) => tg.isFolioDelivered).length} Folio Delivered (Ready to Settle)
                  </span>
                )}
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                  {groupedTableOrders.length} Active Table{groupedTableOrders.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsOrdersFullScreen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 text-zinc-700 bg-white hover:bg-zinc-50 hover:text-zinc-900 text-xs font-semibold shadow-2xs transition cursor-pointer"
                  title="Expand to Full-Screen Cashier View"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Full Screen</span>
                </button>
              </div>
            </div>

            {groupedTableOrders.length === 0 ? (
              <div className="p-8 text-center bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                <p className="text-xs font-semibold text-zinc-600">
                  No pending table bills right now.
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  When diners place table orders or request bill settlement, they will appear here live in real-time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {groupedTableOrders.map((tableGroup) => {
                  return (
                    <div
                      key={tableGroup.tableGroupKey}
                      className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 shadow-2xs ${
                        tableGroup.isFolioDelivered
                          ? 'border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50/80 ring-1 ring-emerald-300'
                          : 'border-amber-200 bg-amber-50/40 hover:bg-amber-50/80'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-black text-zinc-900">{tableGroup.tableName}</span>
                            {tableGroup.maxRound > 1 && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 border border-amber-600/30">
                                Round {tableGroup.maxRound}
                              </span>
                            )}
                            {tableGroup.isFolioDelivered ? (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1 shadow-2xs">
                                <Check className="w-2.5 h-2.5" />
                                FOLIO DELIVERED
                              </span>
                            ) : tableGroup.isBillRequested ? (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                                BILL REQUESTED
                              </span>
                            ) : null}
                          </div>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            tableGroup.isFolioDelivered
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border-amber-200'
                          }`}>
                            {tableGroup.isFolioDelivered ? 'READY TO SETTLE' : tableGroup.overallStatus}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-zinc-600 font-semibold">
                            Guest: {tableGroup.customerName}
                          </p>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            Ref: {tableGroup.cleanRootOrderNumber}
                          </span>
                        </div>
                        {tableGroup.table?.floor && (
                          <p className="text-[11px] text-zinc-400">
                            {tableGroup.table.floor} {tableGroup.table.building ? `• ${tableGroup.table.building}` : ''}
                          </p>
                        )}
                        <div className="mt-2 text-xs text-zinc-600 space-y-1 border-t border-amber-200/60 pt-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500">
                            <span>Items ({tableGroup.activeUncancelled.length}):</span>
                            <span className="text-[10px] text-zinc-400 font-normal">Click × to cancel</span>
                          </div>
                          <div className="text-[11px] text-zinc-700 max-h-36 overflow-y-auto space-y-1 pr-1 divide-y divide-amber-200/40">
                            {tableGroup.allActiveItems.map((i, idx) => {
                              const isCancelled = i.status === 'CANCELLED';
                              const isCancelling = cancellingItemKey === `${i._orderId}-${i._origIdx}`;
                              const qty = Number(i.quantity) || 1;
                              const compQty = Math.max(0, Math.min(qty, Number(i.comp_qty) || (i.is_comp ? qty : 0)));
                              const isComp = Boolean(i.is_comp || compQty >= qty);
                              const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
                              const linePrice = isComp ? 0 : billedQty * (Number(i.price) || 0);

                              return (
                                <div key={`${i._orderId}-${i._origIdx}-${idx}`} className={`pt-1 flex items-start justify-between gap-1.5 ${isCancelled ? 'opacity-40 line-through' : ''}`}>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-zinc-900">{i.quantity}x {i.name}</span>
                                      {i.round_number > 1 && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                          Round {i.round_number}
                                        </span>
                                      )}
                                      {isComp && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-200 text-amber-900">
                                          🎁 Comp
                                        </span>
                                      )}
                                      {!isComp && compQty > 0 && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800">
                                          {compQty}x Comp
                                        </span>
                                      )}
                                      {(Boolean(i.is_packaged) || (Number(i.pack_qty) || 0) > 0) && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-800 border border-amber-500/30 flex items-center gap-0.5">
                                          <Package className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                          {(Number(i.pack_qty) || 0) > 1 && (Number(i.pack_qty) || 0) < (Number(i.quantity) || 1)
                                            ? `${i.pack_qty} of ${i.quantity} Pack`
                                            : (Number(i.pack_qty) || 0) > 1
                                            ? `${i.pack_qty}x Pack`
                                            : 'Pack'}
                                        </span>
                                      )}
                                      {i.station && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-zinc-200 text-zinc-700">
                                          {i.station}
                                        </span>
                                      )}
                                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                        isCancelled
                                          ? 'bg-rose-100 text-rose-700'
                                          : i.status === 'SERVED'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : i.status === 'READY'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}>
                                        {i.status || 'RECEIVED'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="font-mono text-zinc-600 font-semibold text-[11px]">
                                      {currencySymbol} {linePrice.toFixed(2)}
                                    </span>
                                    {!isCancelled && (
                                      <button
                                        type="button"
                                        disabled={isCancelling}
                                        onClick={() => handleCancelOrderItem(i._orderId, i._origIdx, i.name)}
                                        className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                        title={`Cancel ${i.name}`}
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <span className="text-[10px] text-zinc-500 block">Total Payable:</span>
                          <span className="font-black text-sm text-zinc-900">
                            {currencySymbol} {tableGroup.totalPayable.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const printableOrder: TableOrder = {
                                ...tableGroup.primaryOrder,
                                order_number: tableGroup.cleanRootOrderNumber,
                                items: tableGroup.activeUncancelled,
                                total_amount: tableGroup.totalPayable as any,
                                subtotal: tableGroup.itemsMenuTotal as any,
                                packaging_charge: tableGroup.packagingTotal as any,
                              };
                              setPrintingOrder(printableOrder);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-bold transition border border-zinc-200 shadow-2xs cursor-pointer flex items-center gap-1"
                            title="Print Table Bill / Check"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Print Bill</span>
                          </button>
                          <button
                            id={`btn-settle-order-${tableGroup.primaryOrder.id}`}
                            type="button"
                            onClick={() => {
                              if (!canSettleBill) return onRequestRoleSignIn?.();
                              setSelectedOrderToSettle(tableGroup.primaryOrder.id);
                              setShowNewSaleModal(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Settle Bill</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* CASHIER SHIFT REGISTER & CASH DRAWER FLOAT (Per-Cashier Multi-Register)   */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className={`p-2.5 rounded-xl ${isShiftOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  <Wallet className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-zinc-900">
                      {isManagerOrOwner ? 'Cashier Register & Drawer Floats' : 'My Shift Register & Cash Drawer'}
                    </h3>
                    {isShiftOpen ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Shift Open
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-300">
                        <Lock className="w-3 h-3 text-zinc-400" />
                        Register Closed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {isManagerOrOwner
                      ? 'Per-cashier drawer float tracking, cash collection reconciliation, and multi-terminal monitoring.'
                      : `Live drawer float and physical cash reconciliation for ${activeCashier.name || (activeCashier.email ? activeCashier.email.split('@')[0] : 'Cashier')}`}
                  </p>
                </div>
              </div>

              {/* Owner / Manager Cashier Filter Dropdown */}
              {isManagerOrOwner && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-zinc-500">Filter Cashier:</label>
                  <select
                    value={selectedCashierFilter}
                    onChange={(e) => setSelectedCashierFilter(e.target.value)}
                    className="text-xs font-semibold bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-1.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">All Cashiers (Combined View)</option>
                    {availableCashiers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.id === user?.id ? '(You)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Shift Drawer Body */}
            {!isShiftOpen ? (
              /* REGISTER CLOSED: PROMPT FOR OPENING FLOAT */
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Unlock className="w-3.5 h-3.5 text-amber-600" />
                    Open Shift Register for Trading
                  </h4>
                  <p className="text-[11px] text-amber-700">
                    Enter your starting cash drawer float for {todayStr} to begin processing counter sales and bill settlements.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-zinc-400">Rs.</span>
                    <input
                      type="number"
                      min="0"
                      value={drawerFloatInput}
                      onChange={(e) => setDrawerFloatInput(e.target.value)}
                      placeholder="0.00"
                      disabled={isSessionOperating}
                      className="w-32 pl-9 pr-3 py-1.5 text-xs font-bold border border-amber-300 rounded-xl focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none bg-white text-zinc-800"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenShiftDrawer}
                    disabled={isSessionOperating}
                    className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold py-1.5 px-4 rounded-xl shadow-xs transition-all flex items-center gap-1.5 border border-emerald-700/30 text-xs cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>{isSessionOperating ? 'Opening...' : 'Open Shift Register'}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* REGISTER OPEN: 4 METRICS TILES & CLOSE BUTTON */
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/70">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Opening Drawer Float
                    </span>
                    <p className="text-base sm:text-lg font-black text-zinc-800 mt-0.5">
                      {currencySymbol} {currentOpeningFloat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] text-zinc-400">Starting cash at shift open</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/70">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Cash Collected Today
                    </span>
                    <p className="text-base sm:text-lg font-black text-emerald-600 mt-0.5">
                      + {currencySymbol} {cashierCashCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] text-zinc-400">From settled cash bills</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/90">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                      Expected Drawer Cash
                    </span>
                    <p className="text-base sm:text-lg font-black text-emerald-900 mt-0.5">
                      {currencySymbol} {expectedDrawerBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] text-emerald-700">Float + Cash sales to date</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/70">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Digital / Card Sales
                    </span>
                    <p className="text-base sm:text-lg font-black text-zinc-800 mt-0.5">
                      {currencySymbol} {cashierNonCashCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] text-zinc-400">Bank & QR settlements</span>
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-zinc-100">
                  <div className="text-[11px] text-zinc-500">
                    <span>Shift Opened: </span>
                    <strong className="text-zinc-700">
                      {cashierSession?.opened_at ? new Date(cashierSession.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}
                    </strong>
                    {cashierSession?.cashier_name && (
                      <span className="ml-2 text-zinc-400">({cashierSession.cashier_name})</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setClosingCashInput(expectedDrawerBalance.toString());
                      setShowCloseShiftModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition border border-rose-200 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Close Shift & Reconcile Drawer</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Today's POS Register Snapshot */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <Clock className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Today's POS Counter Register</h3>
                  <p className="text-xs text-zinc-500">
                    Real-time settlement metrics for today ({todayStr}) • Resets daily at {revenueWindow.resetTimeLabel}
                  </p>
                </div>
              </div>
              <button
                id="btn-goto-records-page"
                type="button"
                onClick={() => {
                  if (onNavigateTab) {
                    onNavigateTab('operations', 'records');
                  } else if (onNavigate) {
                    onNavigate('/dashboard');
                  }
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl transition border border-amber-200 cursor-pointer"
              >
                <span>Open Sales Records & Excel Export</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Today's Revenue</span>
                <p className="text-xl font-black text-zinc-900 mt-1">
                  {currencySymbol} {todayGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <span className="text-[11px] text-zinc-500">Gross sales collected today</span>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Checks Settled</span>
                <p className="text-xl font-black text-zinc-900 mt-1">
                  {todaySales.length} bills
                </p>
                <span className="text-[11px] text-zinc-500">Invoices cleared today</span>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Average Check</span>
                <p className="text-xl font-black text-zinc-900 mt-1">
                  {currencySymbol} {todaySales.length > 0 ? Math.round(todayGross / todaySales.length) : 0}
                </p>
                <span className="text-[11px] text-zinc-500">Average ticket today</span>
              </div>
            </div>

            {/* Recent bills settled today */}
            <div className="pt-2">
              <span className="text-xs font-bold text-zinc-700 mb-2 block">
                Recently Settled Today ({todaySales.slice(0, 4).length} of {todaySales.length}):
              </span>
              {todaySales.length === 0 ? (
                <p className="text-xs text-zinc-400 italic py-2">No bills settled yet today.</p>
              ) : (
                <div className="space-y-2">
                  {todaySales.slice(0, 4).map((sale) => (
                    <div
                      key={sale.id}
                      className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/60 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-zinc-900">{sale.invoice_number}</span>
                        <span className="text-zinc-600">{sale.table_number || sale.sale_type}</span>
                        <span className="text-zinc-400">• {sale.customer_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-200 text-zinc-800">
                          {sale.payment_method === 'CREDIT' && sale.credit_gl_account_name ? `Credit — ${sale.credit_gl_account_name}` : sale.payment_method}
                        </span>
                        <span className="font-black text-zinc-900">
                          {sale.currency} {sale.total_amount.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedSaleForView(sale)}
                          className="p-1.5 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 transition cursor-pointer"
                          title="View Receipt"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: REGISTER NEW POS SALE / SETTLE TABLE                             */}
      {/* ========================================================================= */}
      {showNewSaleModal && (
        <NewSaleModal
          business={business}
          tables={tables}
          pendingOrders={pendingOrders}
          taxConfig={taxConfig}
          menuItems={menuItems}
          user={user}
          initialOrderId={selectedOrderToSettle}
          initialTableId={selectedTableIdToOrder}
          isStoreOpen={storeStatus.isOpen}
          onClose={() => {
            setShowNewSaleModal(false);
            setSelectedOrderToSettle(undefined);
            setSelectedTableIdToOrder(undefined);
          }}
          onGlAccountCreated={(acc) => setGlAccounts(prev => { if (!prev.some(a => a.id === acc.id)) return [...prev, acc]; return prev; })}
          onQueueSale={handleQueueSale}
          onSaleCreated={(newSale) => {
            setSales((prev) => (prev.some((s) => s.id === newSale.id) ? prev : [newSale, ...prev]));
            if (newSale.order_id) {
              setPendingOrders((prev) => prev.filter((o) => o.id !== newSale.order_id));
              setPayFirstOrders((prev) => prev.filter((o) => o.id !== newSale.order_id));
            }
            if (newSale.table_id) {
              setPendingOrders((prev) => prev.filter((o) => o.table_id !== newSale.table_id));
            }
            setShowNewSaleModal(false);
            setSelectedOrderToSettle(undefined);
            setSelectedTableIdToOrder(undefined);
            setSelectedSaleForView(newSale); // Automatically preview the new receipt
            showStatus(`Invoice #${newSale.invoice_number} generated successfully!`);
            loadBillingData();
          }}
          onOrderSettledConflict={(orderId, tableId) => {
            if (orderId) {
              setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
              setPayFirstOrders((prev) => prev.filter((o) => o.id !== orderId));
            }
            if (tableId) {
              setPendingOrders((prev) => prev.filter((o) => o.table_id !== tableId));
            }
            setShowNewSaleModal(false);
            setSelectedOrderToSettle(undefined);
            setSelectedTableIdToOrder(undefined);
            loadBillingData();
          }}
        />
      )}

      
      {/* ========================================================================= */}
      {/* MODAL 2.5: RECONCILE & CLOSE CASHIER SHIFT REGISTER                       */}
      {/* ========================================================================= */}
      {showCloseShiftModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 border border-zinc-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-rose-100 text-rose-700">
                  <Lock className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-zinc-900">Close Cashier Shift Register</h3>
                  <p className="text-xs text-zinc-500">Reconcile cash drawer float and settlement</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCloseShiftModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-zinc-50 rounded-xl p-3 space-y-2 text-xs border border-zinc-200/60">
              <div className="flex justify-between text-zinc-600">
                <span>Opening Drawer Float:</span>
                <span className="font-bold font-mono">Rs. {currentOpeningFloat.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Total Cash Sales Today:</span>
                <span className="font-bold font-mono text-emerald-600">+ Rs. {cashierCashCollected.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-zinc-900 font-bold pt-2 border-t border-zinc-200">
                <span>Expected Drawer Balance:</span>
                <span className="font-mono text-emerald-700">Rs. {expectedDrawerBalance.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Actual Physical Cash Counted in Drawer (Rs.)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-zinc-400">Rs.</span>
                <input
                  type="number"
                  min="0"
                  value={closingCashInput}
                  onChange={(e) => setClosingCashInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2 text-sm font-bold border border-zinc-300 rounded-xl focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>
              {closingCashInput && (
                <div className="mt-1.5 text-xs font-bold">
                  {parseFloat(closingCashInput) === expectedDrawerBalance ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Drawer is perfectly balanced (0 variance)
                    </span>
                  ) : parseFloat(closingCashInput) > expectedDrawerBalance ? (
                    <span className="text-amber-600">
                      Over by Rs. {(parseFloat(closingCashInput) - expectedDrawerBalance).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-rose-600">
                      Short by Rs. {(expectedDrawerBalance - parseFloat(closingCashInput)).toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Closing Notes / Handover Remarks (Optional)
              </label>
              <textarea
                rows={2}
                value={closingNotesInput}
                onChange={(e) => setClosingNotesInput(e.target.value)}
                placeholder="Notes for handover or variance explanations..."
                className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-xl focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowCloseShiftModal(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseShiftDrawer}
                disabled={isSessionOperating}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-5 rounded-xl shadow-xs transition text-xs flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isSessionOperating ? 'Closing...' : 'Confirm & Close Register'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: VIEW / PRINT RECEIPT SLIP                                        */}
      {/* ========================================================================= */}
      {selectedSaleForView && (
        <ReceiptSlipModal
          sale={selectedSaleForView}
          business={business}
          taxConfig={taxConfig}
          onClose={() => setSelectedSaleForView(null)}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 3.5: VIEW / PRINT GUEST TABLE CHECK SLIP (FOLIO)                   */}
      {/* ========================================================================= */}
      {printingOrder && (
        <TableBillCheckSlipModal
          order={printingOrder}
          business={business}
          taxConfig={taxConfig}
          onClose={() => setPrintingOrder(null)}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: FULL-SCREEN ACTIVE DINE-IN TABLE ORDERS BOARD                      */}
      {/* ========================================================================= */}
      {isOrdersFullScreen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm p-4 sm:p-6 flex flex-col animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl flex-1 flex flex-col overflow-hidden border border-zinc-200">
            <div className="px-6 py-4 bg-zinc-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Utensils className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base font-black tracking-tight">Active Dine-In Table Orders — Cashier Station</h2>
                  <p className="text-xs text-zinc-400">Full-screen live overview: cancel dishes, print guest checks, and settle table tabs</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {groupedTableOrders.filter((tg) => tg.isFolioDelivered).length > 0 && (
                  <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5 animate-pulse">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    {groupedTableOrders.filter((tg) => tg.isFolioDelivered).length} Folio Delivered (Ready)
                  </span>
                )}
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500 text-zinc-950">
                  {groupedTableOrders.length} Active Table{groupedTableOrders.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsOrdersFullScreen(false)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                >
                  <Minimize2 className="w-4 h-4" />
                  <span>Exit Full Screen</span>
                </button>
              </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto bg-zinc-100/60">
              {groupedTableOrders.length === 0 ? (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-dashed border-zinc-200">
                  <p className="text-sm font-semibold text-zinc-600">No active table bills right now.</p>
                  <p className="text-xs text-zinc-400 mt-1">All dine-in tables are settled or clear.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {groupedTableOrders.map((tableGroup) => {
                    return (
                      <div
                        key={tableGroup.tableGroupKey}
                        className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 shadow-sm ${
                          tableGroup.isFolioDelivered
                            ? 'border-emerald-400 bg-emerald-50/40 hover:border-emerald-500 ring-1 ring-emerald-300'
                            : 'border-amber-200 bg-white hover:border-amber-400'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-black text-zinc-900">{tableGroup.tableName}</span>
                              {tableGroup.maxRound > 1 && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 border border-amber-600/30">
                                  Round {tableGroup.maxRound}
                                </span>
                              )}
                              {tableGroup.isFolioDelivered ? (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1 shadow-2xs">
                                  <Check className="w-2.5 h-2.5" />
                                  FOLIO DELIVERED
                                </span>
                              ) : tableGroup.isBillRequested ? (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                                  BILL REQUESTED
                                </span>
                              ) : null}
                            </div>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                              tableGroup.isFolioDelivered
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : 'bg-amber-100 text-amber-900 border-amber-200'
                            }`}>
                              {tableGroup.isFolioDelivered ? 'READY TO SETTLE' : tableGroup.overallStatus}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-zinc-600 font-semibold">
                              Guest: {tableGroup.customerName}
                            </p>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              Ref: {tableGroup.cleanRootOrderNumber}
                            </span>
                          </div>
                          {tableGroup.table?.floor && (
                            <p className="text-[11px] text-zinc-400">
                              {tableGroup.table.floor} {tableGroup.table.building ? `• ${tableGroup.table.building}` : ''}
                            </p>
                          )}
                          <div className="mt-2 text-xs text-zinc-600 space-y-1 border-t border-zinc-100 pt-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500">
                              <span>Items ({tableGroup.activeUncancelled.length}):</span>
                              <span className="text-[10px] text-zinc-400 font-normal">Click × to cancel</span>
                            </div>
                            <div className="text-[11px] text-zinc-700 max-h-48 overflow-y-auto space-y-1 pr-1 divide-y divide-zinc-100">
                              {tableGroup.allActiveItems.map((i, idx) => {
                                const isCancelled = i.status === 'CANCELLED';
                                const isCancelling = cancellingItemKey === `${i._orderId}-${i._origIdx}`;
                                const qty = Number(i.quantity) || 1;
                                const compQty = Math.max(0, Math.min(qty, Number(i.comp_qty) || (i.is_comp ? qty : 0)));
                                const isComp = Boolean(i.is_comp || compQty >= qty);
                                const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
                                const linePrice = isComp ? 0 : billedQty * (Number(i.price) || 0);

                                return (
                                  <div key={`${i._orderId}-${i._origIdx}-${idx}`} className={`pt-1 flex items-start justify-between gap-1.5 ${isCancelled ? 'opacity-40 line-through' : ''}`}>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold text-zinc-900">{i.quantity}x {i.name}</span>
                                        {i.round_number > 1 && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                            Round {i.round_number}
                                          </span>
                                        )}
                                        {isComp && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-200 text-amber-900">
                                            🎁 Comp
                                          </span>
                                        )}
                                        {!isComp && compQty > 0 && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800">
                                            {compQty}x Comp
                                          </span>
                                        )}
                                        {(Boolean(i.is_packaged) || (Number(i.pack_qty) || 0) > 0) && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-800 border border-amber-500/30 flex items-center gap-0.5">
                                            <Package className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                            {(Number(i.pack_qty) || 0) > 1 && (Number(i.pack_qty) || 0) < (Number(i.quantity) || 1)
                                              ? `${i.pack_qty} of ${i.quantity} Pack`
                                              : (Number(i.pack_qty) || 0) > 1
                                              ? `${i.pack_qty}x Pack`
                                              : 'Pack'}
                                          </span>
                                        )}
                                        {i.station && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-zinc-200 text-zinc-700">
                                            {i.station}
                                          </span>
                                        )}
                                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                          isCancelled
                                            ? 'bg-rose-100 text-rose-700'
                                            : i.status === 'SERVED'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : i.status === 'READY'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-amber-100 text-amber-800'
                                        }`}>
                                          {i.status || 'RECEIVED'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="font-mono text-zinc-600 font-semibold text-[11px]">
                                        {currencySymbol} {linePrice.toFixed(2)}
                                      </span>
                                      {!isCancelled && (
                                        <button
                                          type="button"
                                          disabled={isCancelling}
                                          onClick={() => handleCancelOrderItem(i._orderId, i._origIdx, i.name)}
                                          className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                          title={`Cancel ${i.name}`}
                                        >
                                          <XCircle className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <span className="text-[10px] text-zinc-500 block">Total Payable:</span>
                            <span className="font-black text-sm text-zinc-900">
                              {currencySymbol} {tableGroup.totalPayable.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const printableOrder: TableOrder = {
                                  ...tableGroup.primaryOrder,
                                  order_number: tableGroup.cleanRootOrderNumber,
                                  items: tableGroup.activeUncancelled,
                                  total_amount: tableGroup.totalPayable as any,
                                  subtotal: tableGroup.itemsMenuTotal as any,
                                  packaging_charge: tableGroup.packagingTotal as any,
                                };
                                setPrintingOrder(printableOrder);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold transition border border-zinc-300 cursor-pointer flex items-center gap-1"
                              title="Print Table Bill / Check"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Print Bill</span>
                            </button>
                            <button
                              id={`btn-settle-order-fs-${tableGroup.primaryOrder.id}`}
                              type="button"
                              onClick={() => {
                                if (!canSettleBill) return onRequestRoleSignIn?.();
                                setIsOrdersFullScreen(false);
                                setSelectedOrderToSettle(tableGroup.primaryOrder.id);
                                setShowNewSaleModal(true);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Settle Bill</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Station Orders Modal */}
      <LiveStationOrdersModal
        isOpen={isStationModalOpen}
        onClose={() => setIsStationModalOpen(false)}
        kitchenOrders={kitchenOrders}
        totalKitchenOrdersCount={allKitchenOrders.length}
        waiterOrders={waiterOrders}
        totalWaiterOrdersCount={allWaiterOrders.length}
        activeTables={sortedActiveTables}
        liveOrders={pendingOrders}
        initialTab={stationModalTab}
        onNavigateToKDS={() => {
          setIsStationModalOpen(false);
          onNavigateTab?.('kds');
        }}
        onNavigateToWaiter={() => {
          setIsStationModalOpen(false);
          onNavigateTab?.('waiter');
        }}
        onNavigateToTables={() => {
          setIsStationModalOpen(false);
          onNavigateTab?.('checkins');
        }}
        currency={currencySymbol}
      />
    </div>
  );
};

// ============================================================================
// SUB-COMPONENT: TAX CONFIGURATION MODAL
// ============================================================================
// ============================================================================
// SUB-COMPONENT: NEW POS SALE & SETTLE TABLE MODAL
// ============================================================================
interface NewSaleModalProps {
  business: Business;
  tables: RestaurantTable[];
  pendingOrders: TableOrder[];
  taxConfig: BusinessTaxConfig | null;
  menuItems?: MenuItem[];
  user?: any;
  initialOrderId?: string;
  initialTableId?: string;
  isStoreOpen?: boolean;
  onClose: () => void;
  onSaleCreated: (sale: SaleRecord) => void;
  onQueueSale?: (payload: Partial<SaleRecord>, optimisticSale: SaleRecord) => void;
  onOrderSettledConflict?: (orderId?: string, tableId?: string) => void;
  onGlAccountCreated: (acc: any) => void;
}

interface MenuCandidate {
  id: string;
  menu_item_id: string;
  name: string;
  variant_id?: string;
  variant_name?: string;
  price: number;
  category?: string;
  food_type?: FoodType;
  is_available?: boolean;
  is_packageable?: boolean;
}

const NewSaleModal: React.FC<NewSaleModalProps> = ({
  business,
  tables,
  pendingOrders,
  taxConfig,
  menuItems: propMenuItems,
  user,
  initialOrderId,
  initialTableId,
  isStoreOpen = true,
  onClose,
  onSaleCreated,
  onQueueSale,
  onOrderSettledConflict,
  onGlAccountCreated,
}) => {
  const [saleType, setSaleType] = useState<SaleType>('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<string>(initialTableId || '');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('Walk-in Guest');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerPan, setCustomerPan] = useState<string>('');
  const [customInvoiceNumber, setCustomInvoiceNumber] = useState<string>('');
  const [customOrderNumber, setCustomOrderNumber] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('CASH');
  const [creditGlAccount, setCreditGlAccount] = useState<{id: string, name: string, number: string} | null>(null);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [discountPercent, setDiscountPercent] = useState<number | string>('');
  const [flatDiscount, setFlatDiscount] = useState<number | string>('');
  const [notes, setNotes] = useState<string>('');

  // Promo Code State
  const [promoInput, setPromoInput] = useState<string>('');
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountPercent: number;
    description: string;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [compReason, setCompReason] = useState<string>('');
  // null = auto-comp packaging for comped quantities; true = make ALL packaging complimentary; false = bill all packaging
  const [pkgCompOverride, setPkgCompOverride] = useState<boolean | null>(null);

  const compModeActive = useMemo(() => {
    if (saleType !== 'DINE_IN') return false;
    const tableId = selectedTableId || (selectedOrderId ? pendingOrders.find((o) => o.id === selectedOrderId)?.table_id : undefined);
    if (!tableId) return false;
    const tbl = tables.find((t) => t.id === tableId);
    return Boolean(tbl?.comp_enabled);
  }, [saleType, selectedTableId, selectedOrderId, pendingOrders, tables]);

  // Line items
  const [items, setItems] = useState<SaleItem[]>([
    {
      id: 'item-1',
      item_id: 'item-1',
      name: '',
      quantity: 1,
      price: 0,
      unit_price: '' as any,
      comp_qty: 0,
      is_comp: false,
      comp_value: 0,
      subtotal: 0,
      total_price: 0,
    },
  ]);

  // If user chooses an unsettled table order, import its items directly!
  const handleSelectPendingOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    const found = pendingOrders.find((o) => o.id === orderId);
    if (found) {
      if (found.table_id) setSelectedTableId(found.table_id);
      if (found.customer_name) setCustomerName(found.customer_name);
      if (found.customer_phone) setCustomerPhone(found.customer_phone);
      if ((found as any).customer_pan) setCustomerPan((found as any).customer_pan);
      if (found.order_number) setCustomOrderNumber(found.order_number.replace(/\s*\(Round\s*\d+\)/gi, '').trim());

      // Consolidate all unsettled orders for this table so all rounds are billed together!
      const relatedOrders = pendingOrders.filter(
        (o) =>
          o.id === found.id ||
          (found.table_id && o.table_id === found.table_id) ||
          (found.table_number && o.table_number && String(o.table_number).trim().toLowerCase() === String(found.table_number).trim().toLowerCase())
      );
      const activeItems = relatedOrders.flatMap((ord) => ord.items || []).filter((i) => i.status !== 'CANCELLED');
      if (activeItems.length > 0) {
        setItems(
          activeItems.map((i, idx) => {
            const qty = Number(i.quantity) || 1;
            const compQty = Math.max(0, Math.min(qty, Number(i.comp_qty) || (i.is_comp ? qty : 0)));
            const isComp = Boolean(i.is_comp || compQty >= qty);
            const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
            const unitPrice = Number(i.price) || 0;
            const isPkg = (i as any).is_packageable !== false;
            const pQty = isPkg ? Math.max(0, Math.min(qty, Number(i.pack_qty) || (i.is_packaged ? qty : 0))) : 0;
            const compPackQty =
              i.comp_pack_qty !== undefined && i.comp_pack_qty !== null
                ? Math.min(pQty, Math.max(0, Number(i.comp_pack_qty) || 0))
                : undefined;
            return {
              id: `item-${idx}`,
              item_id: i.item_id || `item-${idx}`,
              name: i.name,
              category: i.category || (i.station === 'BAR' ? 'Beverages' : undefined),
              quantity: qty,
              price: unitPrice,
              unit_price: unitPrice,
              comp_qty: compQty,
              is_comp: isComp,
              comp_value: compQty * unitPrice,
              is_packageable: isPkg,
              is_packaged: pQty > 0,
              pack_qty: pQty,
              ...(compPackQty !== undefined ? { comp_pack_qty: compPackQty } : {}),
              ...(i.is_packaging_comp !== undefined ? { is_packaging_comp: Boolean(i.is_packaging_comp) } : {}),
              subtotal: billedQty * unitPrice,
              total_price: billedQty * unitPrice,
            };
          })
        );
      }

      const packagedRelated = relatedOrders.filter((o) => Number(o.packaging_qty || 0) > 0);
      const orderHasAllCompPkg =
        packagedRelated.length > 0 &&
        packagedRelated.every(
          (o) =>
            Boolean((o as any).is_packaging_comp) ||
            (o.packaging_charge !== undefined &&
              o.packaging_charge !== null &&
              Number(o.packaging_charge) === 0)
        );
      setPkgCompOverride(orderHasAllCompPkg ? true : null);

      const savedPromoCode = (found.promo_code || '').trim().toUpperCase();
      const savedPromoDiscount = Number(found.promo_discount) || 0;
      if (savedPromoCode) {
        if (
          taxConfig?.active_promo_enabled !== false &&
          taxConfig?.active_promo_code &&
          savedPromoCode === taxConfig.active_promo_code.trim().toUpperCase()
        ) {
          setAppliedPromo({
            code: savedPromoCode,
            discountPercent: Number(taxConfig.active_promo_percent) || 10,
            description:
              taxConfig.active_promo_description ||
              `${taxConfig.active_promo_percent || 10}% Off Promo`,
          });
          setFlatDiscount(0);
        } else if (savedPromoCode === 'WELCOME10') {
          setAppliedPromo({
            code: 'WELCOME10',
            discountPercent: 10,
            description: 'First Dine-In Courtesy 10% Discount',
          });
          setFlatDiscount(0);
        } else if (savedPromoCode === 'VIP20') {
          setAppliedPromo({
            code: 'VIP20',
            discountPercent: 20,
            description: 'VIP Dining Club 20% Discount',
          });
          setFlatDiscount(0);
        } else if (savedPromoDiscount > 0) {
          setAppliedPromo({
            code: savedPromoCode,
            discountPercent: 0,
            description: 'Applied Order Promo Discount',
          });
          setFlatDiscount(savedPromoDiscount);
        } else {
          setAppliedPromo(null);
          setFlatDiscount(0);
        }
      } else if (savedPromoDiscount > 0) {
        setAppliedPromo(null);
        setFlatDiscount(savedPromoDiscount);
      } else {
        setAppliedPromo(null);
        setFlatDiscount(0);
      }
    } else {
      setAppliedPromo(null);
      setFlatDiscount(0);
    }
  };

  useEffect(() => {
    if (initialOrderId) {
      handleSelectPendingOrder(initialOrderId);
    }
  }, [initialOrderId]);

  // Menu items autocomplete state & loading
  const [availableMenuItems, setAvailableMenuItems] = useState<MenuItem[]>(propMenuItems || []);

  useEffect(() => {
    if (propMenuItems && propMenuItems.length > 0) {
      setAvailableMenuItems(propMenuItems);
    } else if (business.id) {
      const fetcher = rbacService.getMenuItems
        ? rbacService.getMenuItems.bind(rbacService)
        : rbacService.getMenusApi.bind(rbacService);
      fetcher(business.id)
        .then((data) => {
          if (data && Array.isArray(data)) {
            setAvailableMenuItems(data);
          }
        })
        .catch((err) => {
          console.error('Failed to load menu items:', err);
        });
    }
  }, [propMenuItems, business.id]);

  const menuCandidates = useMemo<MenuCandidate[]>(() => {
    const list: MenuCandidate[] = [];
    (availableMenuItems || []).forEach((item) => {
      if (item.has_variants && Array.isArray(item.variants) && item.variants.length > 0) {
        item.variants.forEach((v) => {
          list.push({
            id: `${item.id}_${v.id}`,
            menu_item_id: item.id,
            name: `${item.name} (${v.name})`,
            variant_id: v.id,
            variant_name: v.name,
            price: Number(v.price) || Number(item.price) || 0,
            category: item.category,
            food_type: (v.food_type || item.food_type || 'none') as FoodType,
            is_available: v.is_available !== false && item.is_available !== false && item.status !== 'out_of_stock' && item.status !== 'unavailable',
            is_packageable: item.is_packageable !== false,
          });
        });
      } else {
        list.push({
          id: item.id,
          menu_item_id: item.id,
          name: item.name,
          price: Number(item.price) || 0,
          category: item.category,
          food_type: (item.food_type || 'none') as FoodType,
          is_available: item.is_available !== false && item.status !== 'out_of_stock' && item.status !== 'unavailable',
          is_packageable: item.is_packageable !== false,
        });
      }
    });
    return list;
  }, [availableMenuItems]);

  const [activeDropdownIndex, setActiveDropdownIndex] = useState<number | null>(null);
  const [searchHighlightIndex, setSearchHighlightIndex] = useState<number>(0);
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileDropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const highlightedItemRef = useRef<HTMLDivElement | null>(null);
  const mobileHighlightedItemRef = useRef<HTMLDivElement | null>(null);
  const itemInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const mobileItemInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-scroll highlighted menu item into view
  useEffect(() => {
    const el = highlightedItemRef.current || mobileHighlightedItemRef.current;
    if (el) {
      el.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [searchHighlightIndex]);

  // Click outside to dismiss autocomplete dropdown (pointerdown works cleanly across mouse and touch devices)
  useEffect(() => {
    const handleOutsideClick = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node;
      const inDesktop = dropdownContainerRef.current && dropdownContainerRef.current.contains(target);
      const inMobile = mobileDropdownContainerRef.current && mobileDropdownContainerRef.current.contains(target);
      if (!inDesktop && !inMobile) {
        setActiveDropdownIndex(null);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  const filteredMenuMatches = useMemo(() => {
    if (activeDropdownIndex === null || !items[activeDropdownIndex]) return [];
    const rawQuery = (items[activeDropdownIndex].name || '').trim().toLowerCase();

    // Keep closed when nothing is typed yet
    if (!rawQuery) {
      return [];
    }

    const tokens = rawQuery.split(/\s+/).filter(Boolean);

    const matches = menuCandidates.filter((c) => {
      const cName = c.name.toLowerCase();
      const cCat = (c.category || '').toLowerCase();
      return tokens.every((token) => cName.includes(token) || cCat.includes(token));
    });

    matches.sort((a, b) => {
      const aLower = a.name.toLowerCase();
      const bLower = b.name.toLowerCase();
      if (aLower === rawQuery && bLower !== rawQuery) return -1;
      if (bLower === rawQuery && aLower !== rawQuery) return 1;
      const aStarts = aLower.startsWith(rawQuery);
      const bStarts = bLower.startsWith(rawQuery);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      if (a.is_available && !b.is_available) return -1;
      if (!a.is_available && b.is_available) return 1;
      return aLower.localeCompare(bLower);
    });

    return matches.slice(0, 15);
  }, [activeDropdownIndex, items, menuCandidates]);

  const handleSelectMenuItem = (rowIdx: number, candidate: MenuCandidate) => {
    setItems((prev) => {
      const copy = [...prev];
      const current: Partial<SaleItem> = copy[rowIdx] || {};
      const qty = Math.max(1, Number(current.quantity) || 1);
      const unitPrice = Number(candidate.price) || 0;
      const compQty = Math.max(0, Math.min(qty, Number(current.comp_qty) || 0));
      const billedQty = Math.max(0, qty - compQty);
      copy[rowIdx] = {
        ...current,
        id: current.id || `item-${Date.now()}-${rowIdx}`,
        item_id: candidate.menu_item_id || candidate.id,
        menu_item_id: candidate.menu_item_id,
        name: candidate.name,
        price: unitPrice,
        unit_price: unitPrice,
        quantity: qty,
        comp_qty: compQty,
        is_comp: compQty >= qty,
        comp_value: compQty * unitPrice,
        subtotal: billedQty * unitPrice,
        total_price: billedQty * unitPrice,
        category: candidate.category || current.category,
        food_type: candidate.food_type,
        variant_id: candidate.variant_id,
        variant_name: candidate.variant_name,
        is_packageable: (candidate as any).packaging_type ? (candidate as any).packaging_type === 'packageable' : (candidate as any).is_packageable !== false,
        packaging_type: (candidate as any).packaging_type || ((candidate as any).is_packageable === false ? 'dine_in_only' : 'packageable'),
        is_packaged: current.is_packaged,
        pack_qty: current.pack_qty,
      } as any;

      // Automatically add another empty item space if this is the last row or no empty row exists at the end
      const lastRow = copy[copy.length - 1];
      if (!lastRow || (lastRow.name && lastRow.name.trim() !== '')) {
        const newId = `item-${Date.now()}-${copy.length}`;
        copy.push({
          id: newId,
          item_id: newId,
          name: '',
          quantity: 1,
          price: 0,
          unit_price: '' as any,
          comp_qty: 0,
          is_comp: false,
          comp_value: 0,
          subtotal: 0,
          total_price: 0,
        });
      }

      return copy;
    });

    setActiveDropdownIndex(null);
    setSearchHighlightIndex(0);

    // Auto-focus next empty item input smoothly on either mobile or desktop
    setTimeout(() => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      const nextInput = isMobile
        ? mobileItemInputRefs.current[rowIdx + 1]
        : itemInputRefs.current[rowIdx + 1];
      if (nextInput) {
        nextInput.focus();
      }
    }, 60);
  };

  const handleInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number
  ) => {
    const hasQuery = (items[rowIdx]?.name || '').trim().length > 0;
    if (activeDropdownIndex !== rowIdx || !hasQuery) {
      if (e.key === 'ArrowDown' && hasQuery) {
        setActiveDropdownIndex(rowIdx);
        setSearchHighlightIndex(0);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (filteredMenuMatches.length > 0) {
        e.preventDefault();
        setSearchHighlightIndex((prev) => (prev + 1) % filteredMenuMatches.length);
      }
    } else if (e.key === 'ArrowUp') {
      if (filteredMenuMatches.length > 0) {
        e.preventDefault();
        setSearchHighlightIndex((prev) =>
          prev <= 0 ? filteredMenuMatches.length - 1 : prev - 1
        );
      }
    } else if (e.key === 'Enter') {
      if (filteredMenuMatches.length > 0 && filteredMenuMatches[searchHighlightIndex]) {
        e.preventDefault();
        handleSelectMenuItem(rowIdx, filteredMenuMatches[searchHighlightIndex]);
      } else {
        setActiveDropdownIndex(null);
      }
    } else if (e.key === 'Escape') {
      setActiveDropdownIndex(null);
    }
  };

  // Line item manipulation
  const handleItemChange = (index: number, field: keyof SaleItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev];
      const target = { ...copy[index], [field]: val };
      if (field === 'quantity' || field === 'unit_price' || field === 'price' || (field as string) === 'comp_qty') {
        const qty = field === 'quantity' && val === '' ? 1 : Math.max(1, Number(target.quantity) || 1);
        const price = (field === 'unit_price' || field === 'price') && val === '' ? 0 : (Number(target.unit_price ?? target.price) || 0);
        const compQty = Math.max(0, Math.min(qty, Number(target.comp_qty) || 0));
        const billedQty = Math.max(0, qty - compQty);
        if (field !== 'quantity' || val !== '') {
          target.quantity = qty;
        }
        target.price = price;
        target.unit_price = (field === 'unit_price' || field === 'price') && val === '' ? ('' as any) : (target.unit_price ?? price);
        target.comp_qty = (field as string) === 'comp_qty' && val === '' ? ('' as any) : compQty;
        target.is_comp = compQty >= qty;
        target.comp_value = compQty * price;
        target.subtotal = billedQty * price;
        target.total_price = billedQty * price;
        if (target.pack_qty !== undefined && (target.pack_qty as any) !== '') {
          target.pack_qty = Math.min(qty, Number(target.pack_qty) || 0);
          target.is_packaged = Boolean(Number(target.pack_qty) > 0);
        }
        delete target.comp_pack_qty;
        delete target.is_packaging_comp;
      }
      if ((field as string) === 'pack_qty' || field === 'is_packaged') {
        const qty = Math.max(1, Number(target.quantity) || 1);
        const pQty = field === 'is_packaged'
          ? (val ? qty : 0)
          : (val === '' ? ('' as any) : Math.max(0, Math.min(qty, Number(val) || 0)));
        target.pack_qty = pQty;
        target.is_packaged = Boolean(Number(pQty) > 0);
        delete target.comp_pack_qty;
        delete target.is_packaging_comp;
      }
      copy[index] = target;
      return copy;
    });
  };

  const handleCompQtyInputChange = (
    idx: number,
    raw: string,
    currentCompQty: any,
    itemQuantity: any
  ) => {
    if (raw === '') {
      handleItemChange(idx, 'comp_qty' as any, '' as any);
      return;
    }
    let clean = raw;
    const prevVal = Number(currentCompQty) || 0;
    // When previous value was 0, typing any digit (either before or after the 0) cleanly replaces the 0
    if (prevVal === 0 && raw.length === 2) {
      if (raw.endsWith('0')) {
        clean = raw[0];
      } else if (raw.startsWith('0')) {
        clean = raw.slice(1);
      }
    }
    // Strip any remaining leading zeros before digits (e.g. '001' -> '1')
    clean = clean.replace(/^0+(?=\d)/, '');
    const val = parseInt(clean, 10);
    const maxQty = Number(itemQuantity) || 1;
    handleItemChange(
      idx,
      'comp_qty' as any,
      isNaN(val) ? 0 : Math.min(Math.max(0, val), maxQty)
    );
  };

  const handleAddItem = () => {
    const newId = `item-${Date.now()}`;
    const nextIdx = items.length;
    setItems((prev) => [
      ...prev,
      {
        id: newId,
        item_id: newId,
        name: '',
        quantity: 1,
        price: 0,
        unit_price: 0,
        comp_qty: 0,
        is_comp: false,
        comp_value: 0,
        subtotal: 0,
        total_price: 0,
      },
    ]);
    setActiveDropdownIndex(null);
    setSearchHighlightIndex(0);

    setTimeout(() => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      const el = isMobile ? mobileItemInputRefs.current[nextIdx] : itemInputRefs.current[nextIdx];
      if (el) el.focus();
    }, 60);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      const newId = `item-${Date.now()}-0`;
      setItems([
        {
          id: newId,
          item_id: newId,
          name: '',
          quantity: 1,
          price: 0,
          unit_price: '' as any,
          comp_qty: 0,
          is_comp: false,
          comp_value: 0,
          subtotal: 0,
          total_price: 0,
        },
      ]);
      setActiveDropdownIndex(null);
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
    if (activeDropdownIndex === index) {
      setActiveDropdownIndex(null);
    } else if (activeDropdownIndex !== null && activeDropdownIndex > index) {
      setActiveDropdownIndex(activeDropdownIndex - 1);
    }
  };

  const renderMenuDropdown = (idx: number, isMobile = false) => {
    if (activeDropdownIndex !== idx || !(items[idx]?.name || '').trim().length) return null;

    return (
      <div
        className={`absolute left-0 top-full mt-1.5 w-full ${
          isMobile ? 'min-w-[280px] max-w-full' : 'min-w-[260px] sm:min-w-[320px] max-w-sm'
        } max-h-56 overflow-y-auto bg-white rounded-xl border border-zinc-200/90 shadow-xl z-50 divide-y divide-zinc-100 animate-in fade-in zoom-in-95 duration-100`}
      >
        {filteredMenuMatches.length === 0 ? (
          <div className="p-3 text-center text-xs text-zinc-500">
            <p className="font-medium text-zinc-700">No menu dishes found</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Press Enter to keep "{(items[idx]?.name || '').trim()}" as custom item
            </p>
          </div>
        ) : (
          <>
            <div className="px-2.5 py-1 bg-zinc-50 flex items-center justify-between text-[10px] font-semibold text-zinc-500 tracking-wider border-b border-zinc-100 sticky top-0 z-10">
              <span className="flex items-center gap-1">
                <Utensils className="w-3 h-3 text-amber-600" />
                Menu Matches
              </span>
              <span className="text-zinc-400 font-normal">
                {filteredMenuMatches.length} {filteredMenuMatches.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            {filteredMenuMatches.map((cand, candIdx) => {
              const isHighlighted = searchHighlightIndex === candIdx;
              return (
                <div
                  key={cand.id}
                  ref={isHighlighted ? (isMobile ? mobileHighlightedItemRef : highlightedItemRef) : undefined}
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectMenuItem(idx, cand);
                  }}
                  onClick={() => handleSelectMenuItem(idx, cand)}
                  onMouseEnter={() => setSearchHighlightIndex(candIdx)}
                  className={`px-3 py-2 flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                    isHighlighted
                      ? 'bg-amber-50 text-amber-950 font-medium'
                      : 'hover:bg-zinc-50 text-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        cand.food_type === 'veg'
                          ? 'bg-emerald-500 ring-2 ring-emerald-100'
                          : cand.food_type === 'non-veg'
                          ? 'bg-rose-500 ring-2 ring-rose-100'
                          : 'bg-zinc-300'
                      }`}
                      title={
                        cand.food_type === 'veg'
                          ? 'Vegetarian'
                          : cand.food_type === 'non-veg'
                          ? 'Non-Vegetarian'
                          : 'Dish'
                      }
                    />
                    <div className="truncate">
                      <div className="text-xs leading-snug truncate font-medium text-zinc-900">
                        {cand.name}
                      </div>
                      {cand.category && (
                        <div className="text-[10px] text-zinc-400 font-normal truncate">
                          {cand.category}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-xs text-amber-700">
                      {currency} {cand.price.toFixed(2)}
                    </span>
                    {!cand.is_available && (
                      <div className="text-[9px] text-rose-500 font-medium">Out of stock</div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  };

  // Calculations (Supports both Exclusive of VAT% and Inclusive of VAT% modes; Discounts are deducted from Grand Total without combining with VAT)
  const currency = taxConfig?.currency_symbol || taxConfig?.currency || 'Rs.';
  const packagingFeeRate = Math.max(0, Number(taxConfig?.packaging_fee ?? 10) || 0);

  const defaultBillableSummary = useMemo(() => {
    const namedItems = items.filter((item) => (item.name || '').trim().length > 0);
    return computeOrderBillableAmounts(namedItems, { packagingFeeRate });
  }, [items, packagingFeeRate]);

  const billableSummary = useMemo(() => {
    if (pkgCompOverride === null) return defaultBillableSummary;
    const namedItems = items.filter((item) => (item.name || '').trim().length > 0);
    const grossPkg = namedItems
      .filter((it) => it.is_packageable !== false)
      .reduce((sum, it) => {
        const qty = Number(it.quantity) || 1;
        const pQty = Math.max(0, Math.min(qty, Number(it.pack_qty) || (it.is_packaged ? qty : 0)));
        return sum + pQty * packagingFeeRate;
      }, 0);
    return computeOrderBillableAmounts(namedItems, {
      packagingFeeRate,
      isPackagingComp: pkgCompOverride === true ? true : undefined,
      ...(pkgCompOverride === false ? { explicitPackagingCharge: grossPkg } : {}),
    });
  }, [items, packagingFeeRate, pkgCompOverride, defaultBillableSummary]);

  const isDefaultAllPkgComp =
    defaultBillableSummary.packagingQty > 0 && defaultBillableSummary.packagingTotal === 0;

  const itemsMenuTotal = billableSummary.itemsMenuTotal;
  const packagingTotal = billableSummary.packagingTotal;
  const packagingQtyTotal = billableSummary.packagingQty;
  const compPackagingQty = pkgCompOverride === false ? 0 : billableSummary.compPackagingQty;
  const grossPackagingTotal = billableSummary.grossPackagingTotal;
  const isAllPkgComp = packagingQtyTotal > 0 && packagingTotal === 0;

  const billCalc = useMemo(() => {
    return calculateBillTotals({
      itemsMenuTotal,
      packagingTotal,
      taxConfig,
      manualDiscountPercent: Number(discountPercent) || 0,
      manualFlatDiscount: Number(flatDiscount) || 0,
      promoDiscountPercent: appliedPromo?.discountPercent || 0,
    });
  }, [itemsMenuTotal, packagingTotal, taxConfig, discountPercent, flatDiscount, appliedPromo]);

  const subtotal = billCalc.subtotal;
  const taxesList = billCalc.taxesList;
  const totalTax = billCalc.totalTax;
  const serviceChargeAmount = billCalc.serviceChargeAmount;
  const manualDiscountAmount = billCalc.manualDiscountAmount;
  const promoDiscountAmount = billCalc.promoDiscountAmount;
  const totalDiscountAmount = billCalc.totalDiscountAmount;
  const totalDiscountPercent = (Number(discountPercent) || 0) + (appliedPromo?.discountPercent || 0);
  const grandTotal = billCalc.grandTotal;
  const isInclusiveTax = billCalc.isInclusive;

  // Promo Code Actions
  const handleApplyPromo = () => {
    const clean = promoInput.trim().toUpperCase();
    if (!clean) {
      setPromoError('Please enter a promo code.');
      return;
    }

    // If active promo is configured and enabled in taxConfig
    if (taxConfig?.active_promo_enabled && taxConfig.active_promo_code) {
      if (clean === taxConfig.active_promo_code.toUpperCase()) {
        setAppliedPromo({
          code: clean,
          discountPercent: taxConfig.active_promo_percent || 10,
          description: taxConfig.active_promo_description || `${taxConfig.active_promo_percent || 10}% Off Promo`,
        });
        setPromoError(null);
        setPromoInput('');
        return;
      }
    }

    if (clean === 'WELCOME10') {
      setAppliedPromo({
        code: 'WELCOME10',
        discountPercent: 10,
        description: 'First Dine-In Courtesy 10% Discount',
      });
      setPromoError(null);
      setPromoInput('');
      return;
    }

    if (clean === 'VIP20') {
      setAppliedPromo({
        code: 'VIP20',
        discountPercent: 20,
        description: 'VIP Dining Club 20% Discount',
      });
      setPromoError(null);
      setPromoInput('');
      return;
    }

    if (taxConfig?.active_promo_enabled && taxConfig.active_promo_code) {
      setPromoError(`Invalid promo code. Active code is ${taxConfig.active_promo_code}.`);
      return;
    }

    // If no active promo is enabled
    setPromoError('No active promotional discounts are currently configured.');
  };

  const handleQuickApplyCode = (code: string) => {
    if (taxConfig?.active_promo_enabled && taxConfig.active_promo_code === code) {
      setAppliedPromo({
        code,
        discountPercent: taxConfig.active_promo_percent || 10,
        description: taxConfig.active_promo_description || `${taxConfig.active_promo_percent || 10}% Off Promo`,
      });
      setPromoError(null);
      setPromoInput('');
    }
  };

  const handleRemovePromo = () => {
    if (appliedPromo && appliedPromo.discountPercent === 0 && Number(flatDiscount) > 0) {
      setFlatDiscount(0);
    }
    setAppliedPromo(null);
    setPromoError(null);
  };

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleCompleteSale = async () => {
    // Exclude any empty item placeholder slots (unfilled dish rows)
    const validItems = items
      .filter((item) => (item.name || '').trim().length > 0)
      .map((item) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || (item.is_comp ? qty : 0)));
        const billedQty = Math.max(0, qty - compQty);
        const price = Number(item.unit_price ?? item.price) || 0;
        const isPkg = item.is_packageable !== false;
        const pQty = isPkg ? Math.max(0, Math.min(qty, Number(item.pack_qty) || (item.is_packaged ? qty : 0))) : 0;
        const itemCompPack = pkgCompOverride === true
          ? pQty
          : pkgCompOverride === false
            ? 0
            : item.is_packaging_comp
              ? pQty
              : item.comp_pack_qty !== undefined && item.comp_pack_qty !== null
                ? Math.min(pQty, Math.max(0, Number(item.comp_pack_qty) || 0))
                : Math.min(pQty, compQty);
        const billedPackQty = Math.max(0, pQty - itemCompPack);
        return {
          ...item,
          quantity: qty,
          price,
          unit_price: price,
          comp_qty: compQty,
          is_comp: compQty >= qty,
          comp_value: compQty * price,
          is_packageable: isPkg,
          is_packaged: pQty > 0,
          pack_qty: pQty,
          comp_pack_qty: itemCompPack,
          is_packaging_comp: pQty > 0 && itemCompPack >= pQty,
          packaging_charge: billedPackQty * packagingFeeRate,
          subtotal: billedQty * price,
          total_price: billedQty * price,
        };
      });

    const hasCompItems = validItems.some((i) => (i.comp_qty ?? 0) > 0);

    if (validItems.length === 0 || (subtotal <= 0 && !hasCompItems && compPackagingQty <= 0)) {
      alert('Please add at least one dish with a valid name and price.');
      return;
    }

    if (paymentMethod === 'CREDIT' && !creditGlAccount) {
      setIsCreditModalOpen(true);
      return;
    }

    const tableObj = tables.find((t) => t.id === selectedTableId);
    let resolvedTableNumber: string | undefined = undefined;
    if (tableObj?.table_number) {
      resolvedTableNumber = String(tableObj.table_number).toLowerCase().startsWith('table')
        ? tableObj.table_number
        : `Table ${tableObj.table_number}`;
    } else {
      if (saleType === 'DINE_IN') {
        resolvedTableNumber = 'Dine-In Restaurant';
      } else if (saleType === 'TAKEAWAY') {
        resolvedTableNumber = 'Takeaway';
      } else if (saleType === 'DELIVERY') {
        resolvedTableNumber = 'Delivery';
      } else {
        resolvedTableNumber = 'Dine-In Restaurant';
      }
    }

    const effectivePromoDiscount =
      promoDiscountAmount > 0
        ? promoDiscountAmount
        : appliedPromo?.code && totalDiscountAmount > 0
        ? totalDiscountAmount
        : undefined;

    const modalStaffSession = rbacService.getCurrentStaffSession();
    const activeCashierId = modalStaffSession?.id || user?.id;
    const activeCashierName =
      modalStaffSession?.name ||
      (modalStaffSession?.email ? modalStaffSession.email.split('@')[0] : undefined) ||
      user?.name ||
      (user?.email ? user.email.split('@')[0] : 'Cashier');

    const salePayload: Partial<SaleRecord> = {
      business_id: business.id,
      order_id: selectedOrderId || undefined,
      table_id: selectedTableId || undefined,
      table_number: resolvedTableNumber,
      customer_name: customerName.trim() || 'Walk-in Guest',
      customer_phone: customerPhone.trim(),
      customer_pan: customerPan.trim() || undefined,
      invoice_number: customInvoiceNumber.trim() || undefined,
      order_number: customOrderNumber.trim() || undefined,
      sale_type: saleType,
      items: validItems,
      is_packaging_comp: isAllPkgComp,
      packaging_charge: packagingTotal,
      packaging_qty: packagingQtyTotal,
      subtotal,
      discount_percent: totalDiscountPercent,
      discount_amount: totalDiscountAmount,
      promo_code: appliedPromo?.code || undefined,
      promo_discount: effectivePromoDiscount,
      taxes: taxesList,
      total_tax: totalTax,
      service_charge: serviceChargeAmount,
      total_amount: grandTotal,
      currency,
      payment_method: paymentMethod,
      credit_gl_account_id: paymentMethod === 'CREDIT' ? creditGlAccount?.id : undefined,
      credit_gl_account_name: paymentMethod === 'CREDIT' ? creditGlAccount?.name : undefined,
      credit_gl_account_number: paymentMethod === 'CREDIT' ? creditGlAccount?.number : undefined,
      payment_status: 'PAID',
      cashier_name: activeCashierName,
      cashier_id: activeCashierId,
      notes,
      comp_reason: compModeActive && compReason.trim() ? compReason.trim() : undefined,
    };

    if (onQueueSale) {
      const tempId = `sale-opt-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const tempInvoiceNo = customInvoiceNumber.trim() || `INV-${Date.now().toString().slice(-4)}`;
      const tempOrderNo = customOrderNumber.trim() || (selectedOrderId ? selectedOrderId.slice(0, 8).toUpperCase() : `ORD-${Date.now().toString().slice(-4)}`);

      const optimisticSale: SaleRecord = {
        id: tempId,
        business_id: business.id,
        order_id: selectedOrderId || undefined,
        table_id: selectedTableId || undefined,
        table_number: resolvedTableNumber,
        customer_name: customerName.trim() || 'Walk-in Guest',
        customer_phone: customerPhone.trim(),
        customer_pan: customerPan.trim() || undefined,
        invoice_number: tempInvoiceNo,
        order_number: tempOrderNo,
        sale_type: saleType,
        items: validItems,
        is_packaging_comp: isAllPkgComp,
        packaging_charge: packagingTotal,
        packaging_qty: packagingQtyTotal,
        subtotal,
        discount_percent: totalDiscountPercent,
        discount_amount: totalDiscountAmount,
        promo_code: appliedPromo?.code || undefined,
        promo_discount: effectivePromoDiscount,
        taxes: taxesList,
        total_tax: totalTax,
        service_charge: serviceChargeAmount,
        total_amount: grandTotal,
        currency,
        payment_method: paymentMethod,
        credit_gl_account_id: paymentMethod === 'CREDIT' ? creditGlAccount?.id : undefined,
        credit_gl_account_name: paymentMethod === 'CREDIT' ? creditGlAccount?.name : undefined,
        credit_gl_account_number: paymentMethod === 'CREDIT' ? creditGlAccount?.number : undefined,
        payment_status: 'PAID',
        cashier_name: activeCashierName,
        cashier_id: activeCashierId,
        notes,
        comp_reason: compModeActive && compReason.trim() ? compReason.trim() : undefined,
        created_at: new Date().toISOString(),
      };

      onQueueSale(salePayload, optimisticSale);
      return;
    }

    try {
      setIsSubmitting(true);
      const created = await rbacService.createSaleApi(salePayload, business.id);

      // Instant server-side resolution of table waiter pings & service requests
      if (selectedTableId) {
        const tableObj = tables.find((t) => t.id === selectedTableId);
        rbacService.acknowledgeTablePingApi(selectedTableId, business.id, tableObj?.table_number).catch(() => {});
      }

      onSaleCreated(created);
    } catch (err: any) {
      alert(err?.message || 'Failed to record sale');
      if (err?.message && /already been settled/i.test(err.message)) {
        onOrderSettledConflict?.(selectedOrderId || undefined, selectedTableId || undefined);
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-3.5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 border border-zinc-200 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Receipt className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-base text-zinc-900">POS Register & Bill Settlement</h3>
              <p className="text-xs text-zinc-500">
                Process order, apply discount & tax breakdown, and generate receipt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Unsettled Table Orders Fast Selector */}
        {pendingOrders.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1.5">
            <span className="font-bold text-amber-900 flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5 text-amber-700" />
              Settle Active Table Dine-In Order:
            </span>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const tableMap = new Map<string, TableOrder[]>();
                for (const ord of pendingOrders) {
                  const key = ord.table_id || ord.table_number || ord.id;
                  if (!tableMap.has(key)) tableMap.set(key, []);
                  tableMap.get(key)!.push(ord);
                }
                return Array.from(tableMap.entries()).map(([key, ordList]) => {
                  const primaryOrd = ordList[0];
                  const allActive = ordList.flatMap((o) => o.items || []).filter((i) => i.status !== 'CANCELLED');
                  const isMultiRound = ordList.length > 1;
                  const packagedInList = ordList.filter((o) => Number(o.packaging_qty || 0) > 0);
                  const ordListPkgComp =
                    packagedInList.length > 0 &&
                    packagedInList.every(
                      (o) =>
                        Boolean((o as any).is_packaging_comp) ||
                        (o.packaging_charge !== undefined &&
                          o.packaging_charge !== null &&
                          Number(o.packaging_charge) === 0)
                    );
                  const ordListBillable = computeOrderBillableAmounts(allActive, {
                    packagingFeeRate: Math.max(0, Number(taxConfig?.packaging_fee ?? 10) || 0),
                    isPackagingComp: ordListPkgComp,
                  });
                  const totalPayable = calculateBillTotals({
                    itemsMenuTotal: ordListBillable.itemsMenuTotal,
                    packagingTotal: ordListBillable.packagingTotal,
                    taxConfig,
                    flatDiscountAmount: ordList.reduce((s, o) => s + (Number(o.promo_discount) || 0), 0),
                  }).grandTotal;
                  const isSelected = ordList.some((o) => o.id === selectedOrderId);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectPendingOrder(primaryOrd.id)}
                      className={`px-3 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100'
                      }`}
                    >
                      Table {primaryOrd.table_number || primaryOrd.table_id}
                      {isMultiRound ? ` (${ordList.length} Rounds)` : ''} (
                      {primaryOrd.currency || 'Rs.'} {totalPayable.toFixed(2)})
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Basic Info: Sale Type, Table, Customer, Orders */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <div className={saleType !== 'DINE_IN' ? 'col-span-1' : ''}>
            <label className="text-xs font-bold text-zinc-700 block mb-1">Sale Type</label>
            <select
              id="select-sale-type"
              value={saleType}
              onChange={(e) => setSaleType(e.target.value as SaleType)}
              className="w-full px-2.5 sm:px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
            >
              <option value="DINE_IN">Dine-In Restaurant</option>
              <option value="TAKEAWAY">Takeaway / Counter</option>
              <option value="DELIVERY">Home Delivery</option>
            </select>
          </div>

          {saleType === 'DINE_IN' && (
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">
                Restaurant Table
              </label>
              <select
                id="select-sale-table"
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
                className="w-full px-2.5 sm:px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="">Select Table #</option>
                {tables.map((tbl) => (
                  <option key={tbl.id} value={tbl.id}>
                    Table {tbl.table_number} ({tbl.capacity} seats)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={saleType !== 'DINE_IN' ? 'col-span-1' : 'col-span-2 sm:col-span-1'}>
            <label className="text-xs font-bold text-zinc-700 block mb-1">
              Customer Name
            </label>
            <input
              id="input-sale-customer"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Guest name"
              className="w-full px-2.5 sm:px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-700 block mb-1">
              Start Order # (Opt)
            </label>
            <input
              type="text"
              value={customOrderNumber}
              onChange={(e) => setCustomOrderNumber(e.target.value)}
              placeholder="e.g. ORD-01"
              className="w-full px-2.5 sm:px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-700 block mb-1">
              Start Invoice # (Opt)
            </label>
            <input
              type="text"
              value={customInvoiceNumber}
              onChange={(e) => setCustomInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-100"
              className="w-full px-2.5 sm:px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-700 block mb-1">
              Customer PAN # (Opt)
            </label>
            <input
              id="input-sale-customer-pan"
              type="text"
              value={customerPan}
              onChange={(e) => setCustomerPan(e.target.value)}
              placeholder="e.g. 600123456"
              className="w-full px-2.5 sm:px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Line Items Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
              Ordered Items
            </span>
            <button
              id="btn-add-item-row"
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item
            </button>
          </div>

          {/* Mobile Ordered Items List (sm:hidden) */}
          <div className="sm:hidden space-y-2.5">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl border transition-all ${
                  activeDropdownIndex === idx
                    ? 'border-amber-400 ring-2 ring-amber-100 bg-white relative z-40'
                    : 'border-zinc-200 bg-zinc-50/70 hover:bg-zinc-50'
                }`}
              >
                {/* Row 1: Item Name Search + Delete */}
                <div className="flex items-center gap-2">
                  <div
                    ref={activeDropdownIndex === idx ? mobileDropdownContainerRef : undefined}
                    className="relative flex-1"
                  >
                    <input
                      ref={(el) => {
                        mobileItemInputRefs.current[idx] = el;
                      }}
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        handleItemChange(idx, 'name', e.target.value);
                        setActiveDropdownIndex(idx);
                        setSearchHighlightIndex(0);
                      }}
                      onFocus={() => {
                        if ((item.name || '').trim().length > 0) {
                          setActiveDropdownIndex(idx);
                          setSearchHighlightIndex(0);
                        }
                      }}
                      onKeyDown={(e) => handleInputKeyDown(e, idx)}
                      placeholder="Type dish name (e.g. Chicken...)"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-200 font-medium text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white shadow-2xs"
                    />

                    {renderMenuDropdown(idx, true)}
                  </div>

                  {(items.length > 1 || (item.name && item.name.trim() !== '') || (Number(item.price) || 0) > 0) && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-2 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors shrink-0 cursor-pointer"
                      title="Remove item"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {((Number(item.comp_qty) || 0) > 0 || item.is_comp) && (
                  <div className="flex items-center gap-1.5 mt-1.5 py-1 px-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold w-fit">
                    <Gift className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Complimentary (Qty: {item.comp_qty || item.quantity})</span>
                  </div>
                )}

                {item.is_packageable !== false && (item.name || '').trim().length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5 py-1 px-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-amber-950 text-xs font-semibold w-fit">
                    <Package className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Pack:</span>
                    <div className="inline-flex items-center border border-zinc-200 rounded-md bg-white shadow-2xs overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          const cur = Math.max(0, Math.min(Number(item.quantity) || 1, Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)));
                          handleItemChange(idx, 'pack_qty' as any, Math.max(0, cur - 1));
                        }}
                        disabled={(Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)) <= 0}
                        className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-30 cursor-pointer"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="w-5 text-center font-bold text-[11px] text-zinc-900 font-mono">
                        {Math.max(0, Math.min(Number(item.quantity) || 1, Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)))}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const cur = Math.max(0, Math.min(Number(item.quantity) || 1, Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)));
                          handleItemChange(idx, 'pack_qty' as any, Math.min(Number(item.quantity) || 1, cur + 1));
                        }}
                        disabled={(Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)) >= (Number(item.quantity) || 1)}
                        className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-30 cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    <span className="text-[10px] text-zinc-500">of {item.quantity || 1}</span>
                    {(() => {
                      const pQty = Math.max(0, Math.min(Number(item.quantity) || 1, Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)));
                      if (pQty <= 0) return null;
                      const itemPkg = computeOrderBillableAmounts([item], {
                        packagingFeeRate,
                        isPackagingComp: pkgCompOverride === true ? true : undefined,
                        ...(pkgCompOverride === false ? { explicitPackagingCharge: pQty * packagingFeeRate } : {}),
                      });
                      return (
                        <span className={`text-[10px] font-bold font-mono ${itemPkg.packagingTotal === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {itemPkg.packagingTotal === 0 ? '(🎁 Comp)' : `(+${currency} ${itemPkg.packagingTotal})`}
                        </span>
                      );
                    })()}
                  </div>
                )}

                {/* Row 2: Qty Stepper, Price, Subtotal */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-200/60">
                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Qty
                    </span>
                    <div className="inline-flex items-center justify-center border border-zinc-200 rounded-lg bg-white shadow-2xs overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          handleItemChange(
                            idx,
                            'quantity',
                            Math.max(1, (Number(item.quantity) || 1) - 1)
                          )
                        }
                        disabled={(Number(item.quantity) || 1) <= 1}
                        className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-amber-700 hover:bg-amber-50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer select-none touch-manipulation"
                        title="Decrease quantity"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={item.quantity}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            handleItemChange(idx, 'quantity', '' as any);
                          } else {
                            const val = parseInt(raw, 10);
                            handleItemChange(idx, 'quantity', isNaN(val) ? 1 : val);
                          }
                        }}
                        onBlur={() => {
                          const val = parseInt(String(item.quantity), 10);
                          handleItemChange(idx, 'quantity', isNaN(val) || val < 1 ? 1 : val);
                        }}
                        className="w-9 py-1 text-center font-bold text-xs bg-white text-zinc-900 border-x border-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none select-all"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleItemChange(idx, 'quantity', (Number(item.quantity) || 1) + 1)
                        }
                        className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-amber-700 hover:bg-amber-50 active:scale-95 transition-all cursor-pointer select-none touch-manipulation"
                        title="Increase quantity"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Price
                    </span>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-zinc-400 pointer-events-none">
                        {currency}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={item.unit_price ?? ''}
                        onFocus={(e) => {
                          const t = e.currentTarget;
                          setTimeout(() => t.select(), 0);
                        }}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            handleItemChange(idx, 'unit_price', '');
                          } else {
                            const clean = raw.replace(/^0+(?=\d)/, '');
                            handleItemChange(idx, 'unit_price', clean);
                          }
                        }}
                        onBlur={() => {
                          if ((item.unit_price as any) === '' || isNaN(Number(item.unit_price))) {
                            handleItemChange(idx, 'unit_price', 0);
                          } else {
                            handleItemChange(idx, 'unit_price', Number(item.unit_price));
                          }
                        }}
                        className="w-20 pl-6 pr-2 py-1.5 rounded-lg border border-zinc-200 text-right font-bold text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                      />
                    </div>
                  </div>

                  {/* Subtotal */}
                  <div className="text-right pl-1 min-w-[70px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block leading-none mb-0.5">
                      Total
                    </span>
                    <span className="font-bold text-xs text-zinc-900">
                      {currency} {(item.total_price || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Ordered Items Table (hidden sm:block) */}
          <div className="hidden sm:block border border-zinc-200 rounded-xl overflow-visible">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-100 text-zinc-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2 px-2.5 sm:px-3 rounded-tl-xl min-w-[130px]">Item Description</th>
                  <th className="py-2 px-1 sm:px-2 w-24 sm:w-28 text-center">Qty</th>
                  <th className="py-2 px-1.5 sm:px-2 w-20 sm:w-24 text-right">Price ({currency})</th>
                  <th className="py-2 px-1.5 sm:px-2 w-20 sm:w-24 text-right">Total ({currency})</th>
                  <th className="py-2 px-1 w-8 sm:w-10 text-center rounded-tr-xl"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={activeDropdownIndex === idx ? 'relative z-40' : 'relative z-1'}
                  >
                    <td className={`p-2 relative ${activeDropdownIndex === idx ? 'z-40' : 'z-1'}`}>
                      <div
                        ref={activeDropdownIndex === idx ? dropdownContainerRef : undefined}
                        className={`relative ${activeDropdownIndex === idx ? 'z-40' : 'z-1'}`}
                      >
                        <input
                          ref={(el) => { itemInputRefs.current[idx] = el; }}
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            handleItemChange(idx, 'name', e.target.value);
                            setActiveDropdownIndex(idx);
                            setSearchHighlightIndex(0);
                          }}
                          onFocus={() => {
                            if ((item.name || '').trim().length > 0) {
                              setActiveDropdownIndex(idx);
                              setSearchHighlightIndex(0);
                            }
                          }}
                          onKeyDown={(e) => handleInputKeyDown(e, idx)}
                          placeholder="Type dish name (e.g. Chicken...)"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-medium text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                        />

                        {renderMenuDropdown(idx, false)}
                      </div>

                      {((Number(item.comp_qty) || 0) > 0 || item.is_comp) && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded-md w-fit">
                          <Gift className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>Complimentary (Qty: {item.comp_qty || item.quantity})</span>
                        </div>
                      )}

                      {item.is_packageable !== false && (item.name || '').trim().length > 0 && (
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] font-semibold text-zinc-700 bg-amber-50/70 border border-amber-200 px-1.5 py-0.5 rounded-md w-fit">
                          <Package className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>Pack:</span>
                          <div className="inline-flex items-center border border-zinc-200 rounded-sm bg-white shadow-2xs">
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Math.max(0, Math.min(Number(item.quantity) || 1, Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)));
                                handleItemChange(idx, 'pack_qty' as any, Math.max(0, cur - 1));
                              }}
                              disabled={(Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)) <= 0}
                              className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-amber-700 disabled:opacity-30 cursor-pointer"
                            >
                              <Minus className="w-2 h-2" />
                            </button>
                            <span className="w-4 text-center font-bold text-[10px] text-zinc-900 font-mono">
                              {Math.max(0, Math.min(Number(item.quantity) || 1, Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)))}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Math.max(0, Math.min(Number(item.quantity) || 1, Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)));
                                handleItemChange(idx, 'pack_qty' as any, Math.min(Number(item.quantity) || 1, cur + 1));
                              }}
                              disabled={(Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)) >= (Number(item.quantity) || 1)}
                              className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-amber-700 disabled:opacity-30 cursor-pointer"
                            >
                              <Plus className="w-2 h-2" />
                            </button>
                          </div>
                          <span className="text-[9px] text-zinc-500">of {item.quantity || 1}</span>
                          {(() => {
                            const pQty = Math.max(0, Math.min(Number(item.quantity) || 1, Number(item.pack_qty) || (item.is_packaged ? Number(item.quantity) || 1 : 0)));
                            if (pQty <= 0) return null;
                            const itemPkg = computeOrderBillableAmounts([item], {
                              packagingFeeRate,
                              isPackagingComp: pkgCompOverride === true ? true : undefined,
                              ...(pkgCompOverride === false ? { explicitPackagingCharge: pQty * packagingFeeRate } : {}),
                            });
                            return (
                              <span className={`text-[10px] font-bold font-mono ${itemPkg.packagingTotal === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {itemPkg.packagingTotal === 0 ? '(🎁 Comp)' : `(+${currency} ${itemPkg.packagingTotal})`}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </td>

                    <td className="p-2 text-center">
                      <div className="inline-flex items-center justify-center border border-zinc-200 rounded-lg bg-zinc-50 shadow-2xs overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            handleItemChange(
                              idx,
                              'quantity',
                              Math.max(1, (Number(item.quantity) || 1) - 1)
                            )
                          }
                          disabled={(Number(item.quantity) || 1) <= 1}
                          className="w-7 h-7 sm:w-7 sm:h-7 flex items-center justify-center text-zinc-500 hover:text-amber-700 hover:bg-amber-50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer select-none touch-manipulation"
                          title="Decrease quantity"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          inputMode="numeric"
                          value={item.quantity}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              handleItemChange(idx, 'quantity', '' as any);
                            } else {
                              const val = parseInt(raw, 10);
                              handleItemChange(idx, 'quantity', isNaN(val) ? 1 : val);
                            }
                          }}
                          onBlur={() => {
                            const val = parseInt(String(item.quantity), 10);
                            handleItemChange(idx, 'quantity', isNaN(val) || val < 1 ? 1 : val);
                          }}
                          className="w-10 sm:w-11 py-1 text-center font-bold text-xs bg-white text-zinc-900 border-x border-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none select-all"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleItemChange(idx, 'quantity', (Number(item.quantity) || 1) + 1)
                          }
                          className="w-7 h-7 sm:w-7 sm:h-7 flex items-center justify-center text-zinc-500 hover:text-amber-700 hover:bg-amber-50 active:scale-95 transition-all cursor-pointer select-none touch-manipulation"
                          title="Increase quantity"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>

                    <td className="p-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={item.unit_price ?? ''}
                        onFocus={(e) => {
                          const t = e.currentTarget;
                          setTimeout(() => t.select(), 0);
                        }}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            handleItemChange(idx, 'unit_price', '');
                          } else {
                            const clean = raw.replace(/^0+(?=\d)/, '');
                            handleItemChange(idx, 'unit_price', clean);
                          }
                        }}
                        onBlur={() => {
                          if ((item.unit_price as any) === '' || isNaN(Number(item.unit_price))) {
                            handleItemChange(idx, 'unit_price', 0);
                          } else {
                            handleItemChange(idx, 'unit_price', Number(item.unit_price));
                          }
                        }}
                        className="w-20 sm:w-24 px-2 py-1.5 rounded-lg border border-zinc-200 text-right font-bold text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                      />
                    </td>

                    <td className="p-2 text-right font-bold text-zinc-900">
                      {(item.total_price || 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-center">
                      {(items.length > 1 || (item.name && item.name.trim() !== '') || (Number(item.price) || 0) > 0) && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                          title="Remove item"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>


        </div>

        {/* Bill Calculations & Payment Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Payment Method & Discount */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">
                Payment Method
              </label>
              <div className="grid grid-cols-4 gap-2">
                {paymentMethod === 'CREDIT' && creditGlAccount && (
                  <div className="col-span-full mb-2 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="text-xs text-rose-600 font-medium uppercase tracking-wider">Selected Credit Account</p>
                      <p className="font-bold text-zinc-900 mt-0.5">{creditGlAccount.name} <span className="text-zinc-500 font-normal">({creditGlAccount.number})</span></p>
                    </div>
                    <button onClick={() => setIsCreditModalOpen(true)} className="text-sm font-medium text-rose-600 hover:text-rose-700">Change</button>
                  </div>
                )}
                {(['CASH', 'CARD', 'QR_CODE', 'CREDIT'] as SalePaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => {
                      if (method === 'CREDIT') {
                        // Credit needs a customer GL account: open the picker first
                        setIsCreditModalOpen(true);
                      } else {
                        setPaymentMethod(method);
                        setCreditGlAccount(null);
                      }
                    }}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      paymentMethod === method
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    {method === 'CASH' && <DollarSign className="w-3.5 h-3.5" />}
                    {method === 'CARD' && <CreditCard className="w-3.5 h-3.5" />}
                    {method === 'QR_CODE' && <QrCode className="w-3.5 h-3.5" />}
                    {method === 'CREDIT' && <BookOpen className="w-3.5 h-3.5" />}
                    {method === 'CREDIT' ? 'CREDIT' : method.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">
                  Customer Discount (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="input-sale-discount"
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    placeholder="0"
                    value={discountPercent}
                    onFocus={(e) => {
                      const t = e.currentTarget;
                      setTimeout(() => t.select(), 0);
                    }}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setDiscountPercent('');
                      } else {
                        const clean = raw.replace(/^0+(?=\d)/, '');
                        const num = parseFloat(clean);
                        setDiscountPercent(isNaN(num) ? '' : clean);
                      }
                    }}
                    onBlur={() => {
                      if (discountPercent === '' || isNaN(Number(discountPercent))) {
                        setDiscountPercent(0);
                      } else {
                        setDiscountPercent(Math.min(100, Math.max(0, Number(discountPercent))));
                      }
                    }}
                    className="w-20 px-3 py-1.5 rounded-xl border border-zinc-300 text-xs font-bold text-right focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-xs font-semibold text-zinc-500">%</span>
                </div>
              </div>
              
              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">
                  Flat Discount ({currency})
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="input-sale-discount-flat"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={flatDiscount}
                    onFocus={(e) => {
                      const t = e.currentTarget;
                      setTimeout(() => t.select(), 0);
                    }}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setFlatDiscount('');
                      } else {
                        const clean = raw.replace(/^0+(?=\d)/, '');
                        const num = parseFloat(clean);
                        setFlatDiscount(isNaN(num) ? '' : clean);
                      }
                    }}
                    onBlur={() => {
                      if (flatDiscount === '' || isNaN(Number(flatDiscount))) {
                        setFlatDiscount(0);
                      } else {
                        setFlatDiscount(Math.max(0, Number(flatDiscount)));
                      }
                    }}
                    className="w-24 px-3 py-1.5 rounded-xl border border-zinc-300 text-xs font-bold text-right focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-xs font-semibold text-zinc-500">flat</span>
                </div>
              </div>
            </div>
          </div>

          {/* Totals Summary Card (Final Billing Card) */}
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-2.5 text-xs">
            {/* Promo Code Section */}
            <div className="pb-2.5 border-b border-zinc-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-zinc-700 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-amber-600" />
                  Promo Code
                </label>
                {appliedPromo && (
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                    <Check className="w-2.5 h-2.5" />
                    Applied
                  </span>
                )}
              </div>

              {!appliedPromo ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <input
                        id="input-promo-code"
                        type="text"
                        value={promoInput}
                        onChange={(e) => {
                          setPromoInput(e.target.value.toUpperCase());
                          if (promoError) setPromoError(null);
                        }}
                        placeholder="e.g. WELCOME10, FESTIVE20"
                        className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-zinc-300 text-xs font-mono uppercase font-bold text-zinc-900 placeholder:text-zinc-400 focus:ring-1 focus:ring-amber-500 bg-white"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApplyPromo();
                          }
                        }}
                      />
                      <Tag className="w-3 h-3 text-zinc-400 absolute left-2 top-2" />
                    </div>
                    <button
                      id="btn-apply-promo"
                      type="button"
                      onClick={handleApplyPromo}
                      disabled={!promoInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-bold text-xs cursor-pointer transition-all shadow-2xs shrink-0"
                    >
                      Apply
                    </button>
                  </div>

                  {promoError && (
                    <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                      {promoError}
                    </p>
                  )}

                  {/* Configured Active Promo Suggestion Chip */}
                  {taxConfig?.active_promo_enabled && taxConfig.active_promo_code && (
                    <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                      <span className="text-[9px] text-zinc-400 font-semibold">Active Code:</span>
                      <button
                        type="button"
                        onClick={() => handleQuickApplyCode(taxConfig.active_promo_code!)}
                        className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-850 border border-amber-300 cursor-pointer transition-colors"
                      >
                        {taxConfig.active_promo_code} <span className="text-emerald-600 font-extrabold">-{taxConfig.active_promo_percent || 10}%</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center gap-1.5">
                    <span className="p-1 rounded bg-emerald-100 text-emerald-800">
                      <Tag className="w-3 h-3" />
                    </span>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-bold text-emerald-900 text-xs">
                          {appliedPromo.code}
                        </span>
                        <span className="text-[10px] bg-emerald-200/70 text-emerald-900 px-1 rounded font-bold">
                          -{appliedPromo.discountPercent}%
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-700 block">
                        {appliedPromo.description}
                      </span>
                    </div>
                  </div>
                  <button
                    id="btn-remove-promo"
                    type="button"
                    onClick={handleRemovePromo}
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Remove Promo Code"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Calculations */}
            {packagingQtyTotal > 0 && (
              <div className="space-y-1.5 pb-1.5 border-b border-zinc-200/70">
                <label
                  htmlFor="toggle-pos-comp-packaging"
                  className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition select-none ${
                    isAllPkgComp
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-amber-50/70 border-amber-200 text-amber-950 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      id="toggle-pos-comp-packaging"
                      type="checkbox"
                      checked={isAllPkgComp}
                      onChange={() => {
                        if (isAllPkgComp) {
                          setPkgCompOverride(pkgCompOverride === true && !isDefaultAllPkgComp ? null : false);
                        } else {
                          setPkgCompOverride(true);
                        }
                      }}
                      className="w-3.5 h-3.5 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 cursor-pointer shrink-0"
                    />
                    <span className="text-[11px] font-bold truncate">Complimentary Packaging</span>
                  </div>
                  <span className={`text-[10px] font-bold font-mono shrink-0 ${isAllPkgComp ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {isAllPkgComp ? 'WAIVED' : `${compPackagingQty}/${packagingQtyTotal} Comp`}
                  </span>
                </label>

                <div className="flex items-center justify-between text-zinc-600">
                  <span className="flex items-center gap-1 text-zinc-700 font-semibold">
                    <Package className="w-3.5 h-3.5 text-amber-600" />
                    <span>
                      Packaging ({packagingQtyTotal} {packagingQtyTotal === 1 ? 'item' : 'items'}
                      {compPackagingQty > 0 && !isAllPkgComp ? `, ${compPackagingQty} comp` : ''}):
                    </span>
                  </span>
                  {packagingTotal === 0 ? (
                    <span className="font-semibold text-emerald-700 flex items-center gap-1.5">
                      {grossPackagingTotal > 0 && (
                        <span className="line-through text-zinc-400 font-normal">
                          +{currency} {grossPackagingTotal.toFixed(2)}
                        </span>
                      )}
                      <span>Complimentary ({currency} 0.00)</span>
                    </span>
                  ) : (
                    <span className="font-semibold text-zinc-800">
                      +{currency} {packagingTotal.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-zinc-600">
              <span className="flex items-center gap-1.5">
                <span>Subtotal:</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-200/80 text-zinc-700">
                  {isInclusiveTax ? 'Inclusive of VAT%' : 'Exclusive of VAT%'}
                </span>
              </span>
              <span className="font-semibold">
                {currency} {subtotal.toFixed(2)}
              </span>
            </div>

            {manualDiscountAmount > 0 && (
              <div className="flex items-center justify-between text-rose-600 font-semibold">
                <span>
                  Manual Discount{(Number(discountPercent) || 0) > 0 ? ` (${discountPercent}%)` : ''}:
                </span>
                <span>
                  -{currency} {manualDiscountAmount.toFixed(2)}
                </span>
              </div>
            )}

            {appliedPromo && promoDiscountAmount > 0 && (
              <div className="flex items-center justify-between text-emerald-700 font-semibold">
                <span className="flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  Promo ({appliedPromo.code} -{appliedPromo.discountPercent}%):
                </span>
                <span>
                  -{currency} {promoDiscountAmount.toFixed(2)}
                </span>
              </div>
            )}

            {(manualDiscountAmount > 0 || (appliedPromo && promoDiscountAmount > 0)) && (
              <div className="flex items-center justify-between text-zinc-700 font-semibold border-t border-dashed border-zinc-200 pt-1">
                <span>Taxable Subtotal:</span>
                <span>
                  {currency} {billCalc.taxableSubtotal.toFixed(2)}
                </span>
              </div>
            )}

            {/* Itemized Taxes */}
            {taxesList.map((tax, tIdx) => (
              <div key={tax.id || `${tax.name}-${tIdx}`} className="flex items-center justify-between text-zinc-500">
                <span>
                  {tax.name} ({tax.rate_percent}%):
                </span>
                <span className="font-medium">
                  +{currency} {tax.amount.toFixed(2)}
                </span>
              </div>
            ))}

            <div className="pt-2 border-t border-zinc-200 flex items-center justify-between text-zinc-950 font-black text-base">
              <span>Grand Total:</span>
              <span className="text-amber-700">
                {currency} {grandTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        {!isStoreOpen && !selectedOrderId && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold">
            Business day is closed — select an open unsettled table order above to close out, or reopen the day before recording a new counter sale.
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="btn-confirm-complete-sale"
            type="button"
            disabled={isSubmitting || (!isStoreOpen && !selectedOrderId)}
            onClick={handleCompleteSale}
            className="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
            Complete Sale & Print Receipt
          </button>
        </div>
      </div>

      <CreditAccountSelectionModal
        isOpen={isCreditModalOpen}
        businessId={business?.id}
        onClose={() => setIsCreditModalOpen(false)}
        onSelect={(acc) => {
          setCreditGlAccount({ id: acc.id, name: acc.account_name, number: acc.account_number });
          setPaymentMethod('CREDIT');
          if (acc.customer_name && /^(walk-in guest|guest)?$/i.test((customerName || '').trim())) {
            setCustomerName(acc.customer_name);
          }
          onGlAccountCreated(acc);
          setIsCreditModalOpen(false);
        }}
      />
    </div>
  );
};

// ============================================================================
// SUB-COMPONENT: TABLE BILL CHECK / GUEST FOLIO SLIP MODAL
// ============================================================================
interface TableBillCheckSlipModalProps {
  order: TableOrder;
  business: Business;
  taxConfig: BusinessTaxConfig | null;
  onClose: () => void;
}

const TableBillCheckSlipModal: React.FC<TableBillCheckSlipModalProps> = ({
  order,
  business,
  taxConfig,
  onClose,
}) => {
  const { dispatchPrint } = usePrinter();
  const activeItems = (order.items || []).filter((i) => i.status !== 'CANCELLED');
  const cancelledItems = (order.items || []).filter((i) => i.status === 'CANCELLED');
  const slipPkgComp =
    Boolean((order as any).is_packaging_comp) ||
    (Number(order.packaging_qty || 0) > 0 &&
      order.packaging_charge !== undefined &&
      order.packaging_charge !== null &&
      Number(order.packaging_charge) === 0);
  const slipBillable = computeOrderBillableAmounts(activeItems, {
    packagingFeeRate: Math.max(0, Number(taxConfig?.packaging_fee ?? 10) || 0),
    isPackagingComp: slipPkgComp,
    explicitPackagingCharge:
      order.packaging_charge !== undefined && order.packaging_charge !== null
        ? Number(order.packaging_charge)
        : undefined,
    explicitPackagingQty:
      order.packaging_qty !== undefined && order.packaging_qty !== null
        ? Number(order.packaging_qty)
        : undefined,
  });
  const itemsMenuTotal = slipBillable.itemsMenuTotal;
  const packagingCharge = slipBillable.packagingTotal;
  const packagingQty = slipBillable.packagingQty;
  const checkCalc = calculateBillTotals({
    itemsMenuTotal,
    packagingTotal: packagingCharge,
    taxConfig,
    flatDiscountAmount: Number(order.promo_discount) || 0,
  });
  const subtotal = checkCalc.subtotal;
  const taxesList = checkCalc.taxesList;
  const taxAmount = checkCalc.totalTax;
  const promoDiscount = checkCalc.totalDiscountAmount;
  const totalAmount = checkCalc.grandTotal;
  const currency = order.currency || taxConfig?.currency_symbol || taxConfig?.currency || 'Rs.';

  const handlePrint = async () => {
    const printableOrder = {
      ...order,
      items: activeItems,
      subtotal,
      tax_amount: taxAmount,
      total_tax: taxAmount,
      total_amount: totalAmount,
    };
    await dispatchPrint('BILL', printableOrder);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-zinc-200 max-h-[90vh] overflow-y-auto">
        {/* Actions Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 print:hidden">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            Guest Table Check / Folio
          </span>
          <div className="flex items-center gap-2">
            <button
              id="btn-print-table-check"
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Slip
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Thermal Check Slip */}
        <div className="bg-zinc-50/50 p-6 rounded-xl border border-zinc-200 font-mono text-xs text-zinc-800 space-y-4 shadow-inner">
          {/* Header */}
          <div className="text-center space-y-1">
            <h2 className="text-base font-black text-zinc-950 uppercase tracking-tight">
              {taxConfig?.invoice_display_name || business.name}
            </h2>
            {taxConfig?.invoice_subtitle ? (
              <p className="text-[10px] text-zinc-500 whitespace-pre-line">
                {taxConfig.invoice_subtitle}
              </p>
            ) : (
              <p className="text-[10px] text-zinc-500">
                {business.location || 'Dine-In Guest Check'}
              </p>
            )}
            {taxConfig?.invoice_address && (
              <p className="text-[10px] text-zinc-500 whitespace-pre-line">
                {taxConfig.invoice_address}
              </p>
            )}
            {formatPanVatDisplay(taxConfig) && (
              <p className="text-[10px] text-zinc-600 font-bold">
                {formatPanVatDisplay(taxConfig)}
              </p>
            )}
            <div className="border-b border-dashed border-zinc-300 my-2" />
          </div>

          {/* Meta */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-zinc-500">Order #:</span>
                <span className="font-bold text-zinc-900">{String(order.order_number || (order.id ? order.id.slice(0, 8).toUpperCase() : 'ORD')).replace(/\s*\(Round\s*\d+\)/gi, '').trim()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Table:</span>
              <span className="font-bold text-amber-700">Table #{order.table_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Guest:</span>
              <span className="font-bold">{order.customer_name || 'Guest'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Date:</span>
              <span>{renderFormattedDate(order.created_at || new Date(), business?.date_format_billing || 'ENGLISH')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Status:</span>
              <span className="font-bold uppercase text-amber-800">{order.status}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-zinc-300 my-2" />

          {/* Items List */}
          <div className="space-y-1.5 text-[11px]">
            {activeItems.map((item, idx) => {
              const qty = Number(item.quantity) || 1;
              const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || (item.is_comp ? qty : 0)));
              const isComp = Boolean(item.is_comp || compQty >= qty);
              const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
              const unitPrice = Number(item.price) || 0;
              const linePrice = isComp ? 0 : billedQty * unitPrice;

              return (
                <div key={idx} className="flex justify-between items-start">
                  <div className="flex-1 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold">{item.name}</span>
                      {isComp && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800">
                          🎁 Comp
                        </span>
                      )}
                      {!isComp && compQty > 0 && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800">
                          {compQty}x Comp
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-500 block">
                      {isComp ? (
                        `${item.quantity} x ${currency} 0.00 (Complimentary)`
                      ) : compQty > 0 ? (
                        `${billedQty} x ${currency} ${unitPrice.toFixed(2)} (+${compQty}x Comp)`
                      ) : (
                        `${item.quantity} x ${currency} ${unitPrice.toFixed(2)}`
                      )}
                    </span>
                  </div>
                  <span className="font-bold shrink-0">
                    {currency} {linePrice.toFixed(2)}
                  </span>
                </div>
              );
            })}

            {cancelledItems.length > 0 && (
              <div className="pt-1 text-[10px] text-zinc-400 space-y-0.5">
                <span className="font-bold uppercase text-[9px] text-rose-500 block">Cancelled Items:</span>
                {cancelledItems.map((ci, cIdx) => (
                  <div key={cIdx} className="flex justify-between line-through">
                    <span>{ci.quantity}x {ci.name}</span>
                    <span>{currency} {(Number(ci.price) * Number(ci.quantity)).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-b border-dashed border-zinc-300 my-2" />

          {/* Calculations */}
          <div className="space-y-1 text-[11px]">
            {packagingQty > 0 && (
              <div className="flex justify-between text-zinc-700 font-semibold">
                <span>Packaging ({packagingQty} pkgs):</span>
                <span>{packagingCharge === 0 ? `Complimentary (${currency} 0.00)` : `+${currency} ${packagingCharge.toFixed(2)}`}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal:</span>
              <span>{currency} {subtotal.toFixed(2)}</span>
            </div>
            {taxesList.length > 0 ? (
              taxesList.map((t, idx) => (
                <div key={t.id || `${t.name}-${idx}`} className="flex justify-between text-zinc-600">
                  <span>{t.name} ({t.rate_percent}%):</span>
                  <span>+{currency} {t.amount.toFixed(2)}</span>
                </div>
              ))
            ) : taxAmount > 0 ? (
              <div className="flex justify-between text-zinc-600">
                <span>Tax:</span>
                <span>+{currency} {taxAmount.toFixed(2)}</span>
              </div>
            ) : null}
            {promoDiscount > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Discount{order.promo_code ? ` (${order.promo_code})` : ''}:</span>
                <span>-{currency} {promoDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-b border-zinc-800 pt-1 my-1" />
            <div className="flex justify-between text-sm font-black text-zinc-950">
              <span>TOTAL DUE:</span>
              <span>{currency} {totalAmount.toFixed(2)}</span>
            </div>
            <div className="text-[10px] text-zinc-600 italic pt-0.5 leading-snug">
              In words: {amountToWords(totalAmount, currency)}
            </div>
          </div>

          <div className="border-b border-dashed border-zinc-300 my-2" />

          {/* Footer */}
          <div className="text-center text-[10px] text-zinc-500 space-y-1 pt-1">
            <p className="font-semibold">
              Please present this check at the cashier counter or settle digitally.
            </p>
            <p className="text-[9px] text-zinc-400">Thank you for dining with us!</p>
          </div>
        </div>
      </div>
    </div>
  );
};
