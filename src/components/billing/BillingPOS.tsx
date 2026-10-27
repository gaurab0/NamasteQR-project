import { CreditAccountSelectionModal } from './CreditAccountSelectionModal';
import { calculateBillTotals } from '../../utils/taxCalculations';
import { renderFormattedDate } from '../../utils/dateFormatter';
import React, { useState, useEffect, useMemo, useRef } from 'react';

import { usePrinter } from '../../contexts/PrinterContext';
import {
  Receipt,
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
  XCircle
} from 'lucide-react';
import { 
  exportSalesToExcel, 
  buildSalesWorkbookData, 
  ExcelSheetData 
} from '../../utils/excelExport';
import { rbacService } from '../../services/rbac.service';
import { socketService } from '../../services/socket.service';
import {
  SaleRecord,
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
  FoodType
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
}

export const BillingPOS: React.FC<BillingPOSProps> = ({
  business,
  user,
  activeRole,
  isViewOnly = false,
  onRequestRoleSignIn,
  onNavigate,
}) => {
  const canSettleBill = !isViewOnly;
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
  const [saleModalMode, setSaleModalMode] = useState<'TABLE' | 'COUNTER' | 'SETTLE_TABLE'>('TABLE');

  const openSaleModal = (mode: 'TABLE' | 'COUNTER' | 'SETTLE_TABLE', orderId?: string) => {
    if (!canSettleBill) {
      if (onRequestRoleSignIn) onRequestRoleSignIn();
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
    new Date().toISOString().split('T')[0]
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
    new Date().toISOString().split('T')[0]
  );
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isCleaningOrders, setIsCleaningOrders] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load initial data
  useEffect(() => {
    loadBillingData();
  }, [business.id]);

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

    const unsettled = liveOrders.filter(
      (o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && !(o as any).settled && o.status !== 'AWAITING_PAYMENT' && !(o.pay_first && o.payment_status === 'PAID')
    );
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
      setSales(salesData || []);
      setTables(tablesData || []);
      setGlAccounts(glData || []);
      if (menuData) setMenuItems(menuData || []);
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
        const effectiveStatus = parsedUpdatedOrder.status !== undefined ? parsedUpdatedOrder.status : existingOrder?.status;

        // An order that is awaiting payment belongs strictly in payFirstOrders, never pendingOrders
        if (effectiveStatus === 'AWAITING_PAYMENT') {
          return prev.filter((o) => o.id !== updatedOrder.id);
        }

        const isPayFirst = parsedUpdatedOrder.pay_first ?? existingOrder?.pay_first ?? false;
        const paymentStatus = parsedUpdatedOrder.payment_status ?? existingOrder?.payment_status;

        const isClosed =
          effectiveStatus === 'COMPLETED' ||
          effectiveStatus === 'CANCELLED' ||
          Boolean((parsedUpdatedOrder as any).settled || (existingOrder as any)?.settled) ||
          (isPayFirst && paymentStatus === 'PAID');

        if (isClosed) {
          return prev.filter((o) => o.id !== updatedOrder.id);
        }

        let next: TableOrder[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = { ...prev[idx], ...parsedUpdatedOrder };
        } else if (effectiveStatus && !isPayFirst) {
          // Only add a brand new active table order if it is NOT a pay_first order awaiting payment
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

    return () => {
      unsubSocket();
    };
  }, [business.id]);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const weekRange = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);
    return start.toISOString().split('T')[0];
  }, []);

  const monthRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return start.toISOString().split('T')[0];
  }, []);

  // Filtered sales based on TimeFilter
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate =
        sale.date_string ||
        (sale.created_at ? new Date(sale.created_at).toISOString().split('T')[0] : '');

      // Time Filter
      if (timeFilter === 'DAY') {
        if (saleDate !== todayStr) return false;
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
  }, [sales, timeFilter, todayStr, weekRange, monthRange, customDate, paymentFilter, searchQuery]);

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
      ONLINE: { count: 0, total: 0 },
      ROOM_CHARGE: { count: 0, total: 0 },
      CREDIT: { count: 0, total: 0 },
    };

    filteredSales.forEach((s) => {
      totalGross += Number(s.total_amount) || 0;
      totalSubtotal += Number(s.subtotal) || 0;
      totalDiscounts += Number(s.discount_amount) || 0;
      totalTaxCollected += Number(s.total_tax) || 0;
      totalServiceCharge += Number(s.service_charge) || 0;

      const method = s.payment_method || 'CASH';
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

  // Today's summary for POS Register View
  const todaySales = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate =
        sale.date_string ||
        (sale.created_at ? new Date(sale.created_at).toISOString().split('T')[0] : '');
      return saleDate === todayStr;
    });
  }, [sales, todayStr]);

  const todayGross = useMemo(() => {
    return todaySales.reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
  }, [todaySales]);

  // Excel (.xlsx) Export Handler
  const handleExportToExcel = (scope: 'filtered' | 'all') => {
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
      exportSalesToExcel(dataToExport, glAccounts, prefix, business.name);
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
  const handleOpenExcelPreview = (scope: 'filtered' | 'all' = 'filtered') => {
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
      const sheets = buildSalesWorkbookData(dataToExport, glAccounts, currencySymbol);
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
          {pendingOrders.length > 0 && (
            <button
              id="btn-settle-table-orders"
              type="button"
              onClick={() => canSettleBill ? setShowNewSaleModal(true) : onRequestRoleSignIn?.()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold hover:bg-amber-100 transition-colors shadow-2xs"
            >
              <Utensils className="w-4 h-4 text-amber-600" />
              Settle Table Bill ({pendingOrders.length})
            </button>
          )}

          {/* Quick POS Register Sale */}
          <button
            id="btn-new-pos-sale"
            type="button"
            onClick={() => canSettleBill ? setShowNewSaleModal(true) : onRequestRoleSignIn?.()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New POS Sale
          </button>

          
        </div>
      </div>

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
                  const pfMenuTotal = pfActiveItems.reduce(
                    (s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1),
                    0
                  );
                  const pfBill = calculateBillTotals({
                    itemsMenuTotal: pfMenuTotal,
                    taxConfig,
                    fallbackTaxes: order.taxes,
                    fallbackTaxAmount: order.tax_amount,
                    flatDiscountAmount: Number(order.promo_discount) || 0,
                  });
                  return (
                  <div key={order.id} className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col gap-3 shadow-xs">
                    <div className="flex justify-between items-start">
                       <div>
                          <div className="font-bold text-sm text-zinc-900">
                            {order.table_number ? (order.table_number.toString().trim().toLowerCase().startsWith('table') ? order.table_number : `Table #${order.table_number}`) : 'Table'}
                          </div>
                          <div className="text-[11px] text-zinc-500 font-mono">{order.order_number || order.id.slice(0,8).toUpperCase()}</div>
                       </div>
                       <div className="text-right">
                          <div className="font-black text-amber-600 text-sm">{order.currency || 'Rs.'} {pfBill.grandTotal.toFixed(2)}</div>
                          <div className="mt-0.5">
                            {order.payment_method === 'QR_CODE' || order.payment_method === 'UPI_QR' ? (
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
                          </div>
                       </div>
                    </div>
                    
                    <div className="text-[11px] text-zinc-600 bg-zinc-50 p-2 rounded-lg border border-zinc-100 max-h-24 overflow-y-auto space-y-1">
                      {pfActiveItems.map((item: any, idx: number) => (
                         <div key={idx} className="flex justify-between">
                            <span className="truncate pr-2">{item.quantity}x {item.name}</span>
                            <span className="shrink-0 font-mono">{(item.price * item.quantity).toFixed(2)}</span>
                         </div>
                      ))}
                    </div>

                    <div className="flex gap-2 mt-auto">
                       <button
                         onClick={async () => {
                           if (isViewOnly) { onRequestRoleSignIn?.(); return; }
                           const cleanTableName = order.table_number ? (order.table_number.toString().trim().toLowerCase().startsWith('table') ? order.table_number : `Table #${order.table_number}`) : 'Table';
                           let method = order.payment_method;
                           if (!method || method === 'PENDING') {
                             method = prompt(`Confirm payment for ${cleanTableName}\nEnter payment method (CASH, QR_CODE, CARD):`, 'CASH');
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
                {pendingOrders.filter((o) => o.folio_delivered || (o as any).bill_acknowledged).length > 0 && (
                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center gap-1.5 animate-pulse">
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    {pendingOrders.filter((o) => o.folio_delivered || (o as any).bill_acknowledged).length} Folio Delivered (Ready to Settle)
                  </span>
                )}
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                  {pendingOrders.length} Active Table{pendingOrders.length === 1 ? '' : 's'}
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

            {pendingOrders.length === 0 ? (
              <div className="p-8 text-center bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                <p className="text-xs font-semibold text-zinc-600">
                  No pending table bills right now.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pendingOrders.map((order) => {
                  const table = tables.find((t) => t.id === order.table_id);
                  const tableName = table ? `Table ${table.table_number}` : (order.table_number ? `Table ${order.table_number}` : 'Table');
                  const activeItems = (order.items || []).filter((i) => i.status !== 'CANCELLED');
                  const orderSubtotal = calculateBillTotals({
                    itemsMenuTotal: activeItems.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0),
                    taxConfig,
                    flatDiscountAmount: Number(order.promo_discount) || 0,
                  }).grandTotal;
                  const isFolioDelivered = Boolean(order.folio_delivered || (order as any).bill_acknowledged);
                  return (
                    <div
                      key={order.id}
                      className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 shadow-2xs ${
                        isFolioDelivered
                          ? 'border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50/80 ring-1 ring-emerald-300'
                          : 'border-amber-200 bg-amber-50/40 hover:bg-amber-50/80'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-black text-zinc-900">{tableName}</span>
                            {isFolioDelivered ? (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1 shadow-2xs">
                                <Check className="w-2.5 h-2.5" />
                                FOLIO DELIVERED
                              </span>
                            ) : order.bill_requested ? (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                                BILL REQUESTED
                              </span>
                            ) : null}
                          </div>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            isFolioDelivered
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border-amber-200'
                          }`}>
                            {isFolioDelivered ? 'READY TO SETTLE' : (order.status || 'UNSETTLED')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-zinc-600 font-semibold">
                            Guest: {order.customer_name || 'Dine-In Customer'}
                          </p>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            Ref: {order.order_number || order.id.slice(0, 8)}
                          </span>
                        </div>
                        {table?.floor && (
                          <p className="text-[11px] text-zinc-400">
                            {table.floor} {table.building ? `• ${table.building}` : ''}
                          </p>
                        )}
                        <div className="mt-2 text-xs text-zinc-600 space-y-1 border-t border-amber-200/60 pt-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500">
                            <span>Items ({activeItems.length}):</span>
                            <span className="text-[10px] text-zinc-400 font-normal">Click × to cancel</span>
                          </div>
                          <div className="text-[11px] text-zinc-700 max-h-36 overflow-y-auto space-y-1 pr-1 divide-y divide-amber-200/40">
                            {(order.items || []).map((i, idx) => {
                              const isCancelled = i.status === 'CANCELLED';
                              const isCancelling = cancellingItemKey === `${order.id}-${idx}`;
                              return (
                                <div key={idx} className={`pt-1 flex items-start justify-between gap-1.5 ${isCancelled ? 'opacity-40 line-through' : ''}`}>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-zinc-900">{i.quantity}x {i.name}</span>
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
                                      {currencySymbol} {(Number(i.price) * Number(i.quantity)).toFixed(2)}
                                    </span>
                                    {!isCancelled && order.status !== 'COMPLETED' && (
                                      <button
                                        type="button"
                                        disabled={isCancelling}
                                        onClick={() => handleCancelOrderItem(order.id, idx, i.name)}
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
                            {currencySymbol} {orderSubtotal.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPrintingOrder(order)}
                            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-bold transition border border-zinc-200 shadow-2xs cursor-pointer flex items-center gap-1"
                            title="Print Table Bill / Check"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Print Bill</span>
                          </button>
                          <button
                            id={`btn-settle-order-${order.id}`}
                            type="button"
                            onClick={() => {
                                if (!canSettleBill) return onRequestRoleSignIn?.();
                                setSelectedOrderToSettle(order.id);
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

          {/* Today's POS Register Snapshot */}
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <Clock className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Today's POS Counter Register</h3>
                  <p className="text-xs text-zinc-500">Real-time settlement metrics for today ({todayStr})</p>
                </div>
              </div>
              <button
                id="btn-goto-records-page"
                type="button"
                onClick={() => { if (onNavigate) { onNavigate('operations'); } else { setActiveSubTab('records'); } }}
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
          onClose={() => {
            setShowNewSaleModal(false);
            setSelectedOrderToSettle(undefined);
          }}
          onGlAccountCreated={(acc) => setGlAccounts(prev => { if (!prev.some(a => a.id === acc.id)) return [...prev, acc]; return prev; })}
          onSaleCreated={(newSale) => {
            setSales((prev) => [newSale, ...prev]);
            setShowNewSaleModal(false);
            setSelectedOrderToSettle(undefined);
            setSelectedSaleForView(newSale); // Automatically preview the new receipt
            showStatus(`Invoice #${newSale.invoice_number} generated successfully!`);
          }}
        />
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
                {pendingOrders.filter((o) => o.folio_delivered || (o as any).bill_acknowledged).length > 0 && (
                  <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5 animate-pulse">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    {pendingOrders.filter((o) => o.folio_delivered || (o as any).bill_acknowledged).length} Folio Delivered (Ready)
                  </span>
                )}
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500 text-zinc-950">
                  {pendingOrders.length} Active Table{pendingOrders.length === 1 ? '' : 's'}
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
              {pendingOrders.length === 0 ? (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-dashed border-zinc-200">
                  <p className="text-sm font-semibold text-zinc-600">No active table bills right now.</p>
                  <p className="text-xs text-zinc-400 mt-1">All dine-in tables are settled or clear.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {pendingOrders.map((order) => {
                    const table = tables.find((t) => t.id === order.table_id);
                    const tableName = table ? `Table ${table.table_number}` : (order.table_number ? `Table ${order.table_number}` : 'Table');
                    const activeItems = (order.items || []).filter((i) => i.status !== 'CANCELLED');
                    const orderSubtotal = calculateBillTotals({
                    itemsMenuTotal: activeItems.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0),
                    taxConfig,
                    flatDiscountAmount: Number(order.promo_discount) || 0,
                  }).grandTotal;
                    const isFolioDelivered = Boolean(order.folio_delivered || (order as any).bill_acknowledged);
                    return (
                      <div
                        key={order.id}
                        className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 shadow-sm ${
                          isFolioDelivered
                            ? 'border-emerald-400 bg-emerald-50/40 hover:border-emerald-500 ring-1 ring-emerald-300'
                            : 'border-amber-200 bg-white hover:border-amber-400'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-black text-zinc-900">{tableName}</span>
                              {isFolioDelivered ? (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1 shadow-2xs">
                                  <Check className="w-2.5 h-2.5" />
                                  FOLIO DELIVERED
                                </span>
                              ) : order.bill_requested ? (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                                  BILL REQUESTED
                                </span>
                              ) : null}
                            </div>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                              isFolioDelivered
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : 'bg-amber-100 text-amber-900 border-amber-200'
                            }`}>
                              {isFolioDelivered ? 'READY TO SETTLE' : (order.status || 'UNSETTLED')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-zinc-600 font-semibold">
                              Guest: {order.customer_name || 'Dine-In Customer'}
                            </p>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              Ref: {order.order_number || order.id.slice(0, 8)}
                            </span>
                          </div>
                          {table?.floor && (
                            <p className="text-[11px] text-zinc-400">
                              {table.floor} {table.building ? `• ${table.building}` : ''}
                            </p>
                          )}
                          <div className="mt-2 text-xs text-zinc-600 space-y-1 border-t border-zinc-100 pt-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500">
                              <span>Items ({activeItems.length}):</span>
                              <span className="text-[10px] text-zinc-400 font-normal">Click × to cancel</span>
                            </div>
                            <div className="text-[11px] text-zinc-700 max-h-48 overflow-y-auto space-y-1 pr-1 divide-y divide-zinc-100">
                              {(order.items || []).map((i, idx) => {
                                const isCancelled = i.status === 'CANCELLED';
                                const isCancelling = cancellingItemKey === `${order.id}-${idx}`;
                                return (
                                  <div key={idx} className={`pt-1 flex items-start justify-between gap-1.5 ${isCancelled ? 'opacity-40 line-through' : ''}`}>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold text-zinc-900">{i.quantity}x {i.name}</span>
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
                                        {currencySymbol} {(Number(i.price) * Number(i.quantity)).toFixed(2)}
                                      </span>
                                      {!isCancelled && order.status !== 'COMPLETED' && (
                                        <button
                                          type="button"
                                          disabled={isCancelling}
                                          onClick={() => handleCancelOrderItem(order.id, idx, i.name)}
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
                              {currencySymbol} {orderSubtotal.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPrintingOrder(order)}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold transition border border-zinc-300 cursor-pointer flex items-center gap-1"
                              title="Print Table Bill / Check"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Print Bill</span>
                            </button>
                            <button
                              id={`btn-settle-order-fs-${order.id}`}
                              type="button"
                              onClick={() => {
                                  if (!canSettleBill) return onRequestRoleSignIn?.();
                                  setIsOrdersFullScreen(false);
                                  setSelectedOrderToSettle(order.id);
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
  onClose: () => void;
  onSaleCreated: (sale: SaleRecord) => void;
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
}

const NewSaleModal: React.FC<NewSaleModalProps> = ({
  business,
  tables,
  pendingOrders,
  taxConfig,
  menuItems: propMenuItems,
  user,
  initialOrderId,
  onClose,
  onSaleCreated,
  onGlAccountCreated,
}) => {
  const [saleType, setSaleType] = useState<SaleType>('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('Walk-in Guest');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customInvoiceNumber, setCustomInvoiceNumber] = useState<string>('');
  const [customOrderNumber, setCustomOrderNumber] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('CASH');
  const [creditGlAccount, setCreditGlAccount] = useState<{id: string, name: string, number: string} | null>(null);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [flatDiscount, setFlatDiscount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // Promo Code State
  const [promoInput, setPromoInput] = useState<string>('');
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountPercent: number;
    description: string;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Line items
  const [items, setItems] = useState<SaleItem[]>([
    {
      id: 'item-1',
      item_id: 'item-1',
      name: '',
      quantity: 1,
      price: 0,
      unit_price: 0,
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
      if (found.order_number) setCustomOrderNumber(found.order_number);

      const activeItems = (found.items || []).filter((i) => i.status !== 'CANCELLED');
      if (activeItems.length > 0) {
        setItems(
          activeItems.map((i, idx) => ({
            id: `item-${idx}`,
            item_id: i.item_id || `item-${idx}`,
            name: i.name,
            category: i.category || (i.station === 'BAR' ? 'Beverages' : undefined),
            quantity: i.quantity,
            price: i.price,
            unit_price: i.price,
            subtotal: i.price * i.quantity,
            total_price: i.price * i.quantity,
          }))
        );
      }

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
        });
      }
    });
    return list;
  }, [availableMenuItems]);

  const [activeDropdownIndex, setActiveDropdownIndex] = useState<number | null>(null);
  const [searchHighlightIndex, setSearchHighlightIndex] = useState<number>(0);
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const highlightedItemRef = useRef<HTMLDivElement | null>(null);
  const itemInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-scroll highlighted menu item into view
  useEffect(() => {
    if (highlightedItemRef.current) {
      highlightedItemRef.current.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [searchHighlightIndex]);

  // Click outside to dismiss autocomplete dropdown (pointerdown works cleanly across mouse and touch devices)
  useEffect(() => {
    const handleOutsideClick = (e: PointerEvent | MouseEvent) => {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(e.target as Node)
      ) {
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
      copy[rowIdx] = {
        ...current,
        id: current.id || `item-${Date.now()}-${rowIdx}`,
        item_id: candidate.menu_item_id || candidate.id,
        menu_item_id: candidate.menu_item_id,
        name: candidate.name,
        price: unitPrice,
        unit_price: unitPrice,
        quantity: qty,
        subtotal: qty * unitPrice,
        total_price: qty * unitPrice,
        category: candidate.category || current.category,
        food_type: candidate.food_type,
        variant_id: candidate.variant_id,
        variant_name: candidate.variant_name,
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
          unit_price: 0,
          subtotal: 0,
          total_price: 0,
        });
      }

      return copy;
    });

    setActiveDropdownIndex(null);
    setSearchHighlightIndex(0);

    // Auto-focus next empty item input smoothly
    setTimeout(() => {
      const nextInput = itemInputRefs.current[rowIdx + 1];
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
      if (field === 'quantity' || field === 'unit_price' || field === 'price') {
        const qty = field === 'quantity' && val === '' ? 1 : Math.max(1, Number(target.quantity) || 1);
        const price = Number(target.unit_price ?? target.price) || 0;
        if (field !== 'quantity' || val !== '') {
          target.quantity = qty;
        }
        target.price = price;
        target.unit_price = price;
        target.subtotal = qty * price;
        target.total_price = qty * price;
      }
      copy[index] = target;
      return copy;
    });
  };

  const handleAddItem = () => {
    const newId = `item-${Date.now()}`;
    setItems((prev) => [
      ...prev,
      {
        id: newId,
        item_id: newId,
        name: '',
        quantity: 1,
        price: 0,
        unit_price: 0,
        subtotal: 0,
        total_price: 0,
      },
    ]);
    setActiveDropdownIndex(null);
    setSearchHighlightIndex(0);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
    if (activeDropdownIndex === index) {
      setActiveDropdownIndex(null);
    } else if (activeDropdownIndex !== null && activeDropdownIndex > index) {
      setActiveDropdownIndex(activeDropdownIndex - 1);
    }
  };

  // Calculations (Supports both Exclusive of VAT% and Inclusive of VAT% modes; Discounts are deducted from Grand Total without combining with VAT)
  const currency = taxConfig?.currency_symbol || taxConfig?.currency || 'Rs.';
  const itemsMenuTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.total_price ?? item.subtotal ?? (item.price * item.quantity)) || 0), 0);
  }, [items]);

  const billCalc = useMemo(() => {
    return calculateBillTotals({
      itemsMenuTotal,
      taxConfig,
      manualDiscountPercent: discountPercent,
      manualFlatDiscount: Number(flatDiscount) || 0,
      promoDiscountPercent: appliedPromo?.discountPercent || 0,
    });
  }, [itemsMenuTotal, taxConfig, discountPercent, flatDiscount, appliedPromo]);

  const subtotal = billCalc.subtotal;
  const taxesList = billCalc.taxesList;
  const totalTax = billCalc.totalTax;
  const serviceChargeAmount = billCalc.serviceChargeAmount;
  const manualDiscountAmount = billCalc.manualDiscountAmount;
  const promoDiscountAmount = billCalc.promoDiscountAmount;
  const totalDiscountAmount = billCalc.totalDiscountAmount;
  const totalDiscountPercent = discountPercent + (appliedPromo?.discountPercent || 0);
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
    if (appliedPromo && appliedPromo.discountPercent === 0 && flatDiscount > 0) {
      setFlatDiscount(0);
    }
    setAppliedPromo(null);
    setPromoError(null);
  };

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleCompleteSale = async () => {
    if (items.length === 0 || subtotal <= 0) {
      alert('Please add at least one item with a valid price.');
      return;
    }

    if (paymentMethod === 'CREDIT' && !creditGlAccount) {
      setIsCreditModalOpen(true);
      return;
    }

    const tableObj = tables.find((t) => t.id === selectedTableId);
    const effectivePromoDiscount =
      promoDiscountAmount > 0
        ? promoDiscountAmount
        : appliedPromo?.code && totalDiscountAmount > 0
        ? totalDiscountAmount
        : undefined;

    const salePayload: Partial<SaleRecord> = {
      business_id: business.id,
      order_id: selectedOrderId || undefined,
      table_id: selectedTableId || undefined,
      table_number: tableObj?.table_number,
      customer_name: customerName.trim() || 'Walk-in Guest',
      customer_phone: customerPhone.trim(),
      invoice_number: customInvoiceNumber.trim() || undefined,
      order_number: customOrderNumber.trim() || undefined,
      sale_type: saleType,
      items,
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
      cashier_name: user?.email ? user.email.split('@')[0] : 'Staff',
      notes,
    };

    try {
      setIsSubmitting(true);
      const created = await rbacService.createSaleApi(salePayload, business.id);

      // Instant server-side resolution of table waiter pings & service requests
      if (selectedTableId) {
        rbacService.acknowledgeTablePingApi(selectedTableId, business.id).catch(() => {});
      }

      onSaleCreated(created);
    } catch (err: any) {
      alert(err.message || 'Failed to record sale');
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
              {pendingOrders.map((ord) => {
                const ordActiveItems = (ord.items || []).filter((i) => i.status !== 'CANCELLED');
                const ordPayable = calculateBillTotals({
                  itemsMenuTotal: ordActiveItems.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0),
                  taxConfig,
                  flatDiscountAmount: Number(ord.promo_discount) || 0,
                }).grandTotal;
                return (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => handleSelectPendingOrder(ord.id)}
                    className={`px-3 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                      selectedOrderId === ord.id
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    Table {ord.table_number || ord.table_id} (
                    {ord.currency || 'Rs.'} {ordPayable.toFixed(2)})
                  </button>
                );
              })}
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
              <option value="ROOM_SERVICE">Hotel Room Service</option>
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

          <div className="border border-zinc-200 rounded-xl overflow-visible">
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

                        {/* Floating Autocomplete Dropdown Pop-up */}
                        {activeDropdownIndex === idx && (item.name || '').trim().length > 0 && (
                          <div className="absolute left-0 top-full mt-1 w-full min-w-[260px] sm:min-w-[320px] max-w-sm max-h-56 overflow-y-auto bg-white rounded-xl border border-zinc-200/90 shadow-xl z-50 divide-y divide-zinc-100 animate-in fade-in zoom-in-95 duration-100">
                            {filteredMenuMatches.length === 0 ? (
                              <div className="p-3 text-center text-xs text-zinc-500">
                                <p className="font-medium text-zinc-700">No menu dishes found</p>
                                <p className="text-[11px] text-zinc-400 mt-0.5">Press Enter to keep "{(item.name || '').trim()}" as custom item</p>
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
                                      ref={isHighlighted ? highlightedItemRef : undefined}
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
                        )}
                      </div>
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
                        value={item.unit_price ?? item.price ?? 0}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          handleItemChange(idx, 'unit_price', parseFloat(e.target.value) || 0)
                        }
                        className="w-20 sm:w-24 px-2 py-1.5 rounded-lg border border-zinc-200 text-right font-bold text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                      />
                    </td>
                    <td className="p-2 text-right font-bold text-zinc-900">
                      {(item.total_price || 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-center">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer"
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
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
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
                    step="1"
                    value={flatDiscount}
                    onChange={(e) => setFlatDiscount(parseFloat(e.target.value) || 0)}
                    className="w-24 px-3 py-1.5 rounded-xl border border-zinc-300 text-xs font-bold text-right focus:ring-2 focus:ring-amber-500"
                    placeholder="0.00"
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

            {manualDiscountAmount > 0 && (
              <div className="flex items-center justify-between text-rose-600 font-semibold">
                <span>
                  Manual Discount{discountPercent > 0 ? ` (${discountPercent}%)` : ''}:
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

            <div className="pt-2 border-t border-zinc-200 flex items-center justify-between text-zinc-950 font-black text-base">
              <span>Grand Total:</span>
              <span className="text-amber-700">
                {currency} {grandTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
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
            disabled={isSubmitting}
            onClick={handleCompleteSale}
            className="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
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
  const { dispatchPrint, printers } = usePrinter();

  const handlePrint = async () => {
    await dispatchPrint('BILL', order);
  };

  const activeItems = (order.items || []).filter((i) => i.status !== 'CANCELLED');
  const cancelledItems = (order.items || []).filter((i) => i.status === 'CANCELLED');
  const itemsMenuTotal = activeItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
  const checkCalc = calculateBillTotals({
    itemsMenuTotal,
    taxConfig,
    flatDiscountAmount: Number(order.promo_discount) || 0,
  });
  const subtotal = checkCalc.subtotal;
  const taxesList = checkCalc.taxesList;
  const taxAmount = checkCalc.totalTax;
  const promoDiscount = checkCalc.totalDiscountAmount;
  const totalAmount = checkCalc.grandTotal;
  const currency = order.currency || taxConfig?.currency_symbol || taxConfig?.currency || 'Rs.';

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
                <span className="font-bold text-zinc-900">{order.order_number || (order.id ? order.id.slice(0, 8).toUpperCase() : 'ORD')}</span>
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
            {activeItems.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start">
                <div className="flex-1 pr-2">
                  <span className="font-bold">{item.name}</span>
                  <span className="text-[10px] text-zinc-500 block">
                    {item.quantity} x {currency} {Number(item.price).toFixed(2)}
                  </span>
                </div>
                <span className="font-bold shrink-0">
                  {currency} {(Number(item.price) * Number(item.quantity)).toFixed(2)}
                </span>
              </div>
            ))}

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
