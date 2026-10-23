import { CreditAccountSelectionModal } from './CreditAccountSelectionModal';
import { calculateBillTotals } from '../../utils/taxCalculations';
import { renderFormattedDate } from '../../utils/dateFormatter';
import React, { useState, useEffect, useMemo } from 'react';

import { usePrinter } from '../../contexts/PrinterContext';
import {
  Receipt,
  DollarSign,
  Calendar,
  Filter,
  Trash2,
  Settings,
  Plus,
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
  GLAccountLink
} from '../../types/rbac';
import { Business } from '../../types/auth';
import { GLAccountsTable } from './GLAccountsTable';
import { ExcelSheetPreviewModal } from './ExcelSheetPreviewModal';

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
      const [configData, salesData, tablesData, glData, ordersData] = await Promise.all([
        rbacService.getTaxConfigApi(business.id).catch(() => null),
        rbacService.getSalesApi({}, business.id).catch(() => []),
        rbacService.getTablesApi(business.id).catch(() => []),
        rbacService.getGLAccountsApi(business.id).catch(() => []),
        rbacService.getTableOrdersApi(undefined, business.id).catch(() => []),
      ]);

      if (configData) setTaxConfig(configData);
      setSales(salesData || []);
      setTables(tablesData || []);
      setGlAccounts(glData || []);
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
            Record POS counter sales, settle table invoices with custom business taxes, track manager earnings with per-day/week/month filters, and manage sales audit records.
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

      {/* Sub-Page Navigation inside Billing & POS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-200 pb-3 gap-3">
        <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200">
          <button
            id="subtab-pos-counter"
            type="button"
            onClick={() => setActiveSubTab('pos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              activeSubTab === 'pos'
                ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Receipt className="w-4 h-4 text-amber-600" />
            <span>POS Register & Counter</span>
            {pendingOrders.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white animate-pulse">
                {pendingOrders.length} to settle
              </span>
            )}
          </button>

          <button
            id="subtab-sales-records"
            type="button"
            onClick={() => setActiveSubTab('records')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              activeSubTab === 'records'
                ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Sales Records & Excel Export</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-200 text-zinc-700">
              {sales.length}
            </span>
          </button>

          <button
            id="subtab-gl-accounts"
            type="button"
            onClick={() => setActiveSubTab('gl_accounts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              activeSubTab === 'gl_accounts'
                ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span>GL Links & Accounts</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-200 text-zinc-700">
              {glAccounts.length}
            </span>
          </button>
        </div>

        {/* Quick Excel Export & Preview CTA visible when in records or gl_accounts tab */}
        {(activeSubTab === 'records' || activeSubTab === 'gl_accounts') && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-preview-excel-spreadsheet"
              type="button"
              onClick={() => handleOpenExcelPreview(activeSubTab === 'records' ? 'filtered' : 'all')}
              disabled={sales.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              title="Preview and edit spreadsheet before downloading"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>Preview & Edit Excel (.xlsx)</span>
            </button>

            {activeSubTab === 'records' && (
              <>
                <button
                  id="btn-export-excel-filtered"
                  type="button"
                  onClick={() => handleExportToExcel('filtered')}
                  disabled={isExportingExcel || filteredSales.length === 0}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                  title="Export currently filtered sales records to Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Export Filtered ({filteredSales.length}) to .xlsx</span>
                </button>

                <button
                  id="btn-export-excel-all"
                  type="button"
                  onClick={() => handleExportToExcel('all')}
                  disabled={isExportingExcel || sales.length === 0}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-300 text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
                  title="Export all lifetime sales records to Excel (.xlsx)"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>Export All ({sales.length})</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PAGE 1: POS REGISTER & COUNTER (COUNTER SALE & ACTIVE TABLE SETTLEMENT)   */}
      {/* ========================================================================= */}
      {activeSubTab === 'pos' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Database Storage Retention Banner */}
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-950 flex items-center gap-2">
                  <span>Automatic Daily Database Pruning Active</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 text-emerald-900">
                    24h Retention for Orders • 30 Days for Sales History
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Live table orders and ordered item payloads are automatically deleted daily to keep the system responsive. Monthly business sales records are safely preserved for the History reports.
                </p>
              </div>
            </div>
            <button
              id="btn-trigger-cleanup"
              type="button"
              onClick={handleCleanupDailyOrders}
              disabled={isCleaningOrders}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-2xs shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCleaningOrders ? 'animate-spin' : ''}`} />
              <span>{isCleaningOrders ? 'Cleaning...' : 'Purge Past Orders Now'}</span>
            </button>
          </div>

          
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
                <p className="text-[11px] text-zinc-400 mt-1">
                  All guest tables have been settled or no active orders are awaiting checkout.
                </p>
                <button
                  id="btn-quick-new-pos"
                  type="button"
                  onClick={() => {
                    setSelectedOrderToSettle(undefined);
                    setShowNewSaleModal(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Counter POS Sale
                </button>
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
                onClick={() => setActiveSubTab('records')}
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
      {/* PAGE 2: SALES RECORDS & EXCEL (.XLSX) EXPORT                               */}
      {/* ========================================================================= */}
      {activeSubTab === 'records' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Records & Export Header Card */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-white border border-emerald-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-600 text-white shadow-2xs">
                  <FileSpreadsheet className="w-5 h-5" />
                </span>
                <h3 className="text-base font-bold text-zinc-900">
                  Sales Records & Financial Audit Register
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Excel Export Ready
                </span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed max-w-2xl">
                Audit trail of settled invoices with item-level data, VAT, service charges, discounts, and payment methods. Export directly to formatted Excel (.xlsx) spreadsheets.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap shrink-0">
              <button
                id="btn-export-records-filtered-main"
                type="button"
                onClick={() => handleExportToExcel('filtered')}
                disabled={isExportingExcel || filteredSales.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Filtered ({filteredSales.length}) to .xlsx</span>
              </button>

              <button
                id="btn-export-records-all-main"
                type="button"
                onClick={() => handleExportToExcel('all')}
                disabled={isExportingExcel || sales.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-300 text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Export All ({sales.length}) .xlsx</span>
              </button>
            </div>
          </div>

          {/* Time & Earnings Filter Bar */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Time Filter Pills */}
          <div className="flex items-center gap-1.5 bg-zinc-100/80 p-1 rounded-xl border border-zinc-200/60 overflow-x-auto">
            <button
              id="filter-day"
              type="button"
              onClick={() => setTimeFilter('DAY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                timeFilter === 'DAY'
                  ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Today (Per Day)
            </button>
            <button
              id="filter-week"
              type="button"
              onClick={() => setTimeFilter('WEEK')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                timeFilter === 'WEEK'
                  ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              This Week (Per Week)
            </button>
            <button
              id="filter-month"
              type="button"
              onClick={() => setTimeFilter('MONTH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                timeFilter === 'MONTH'
                  ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              This Month (Per Month)
            </button>
            <button
              id="filter-all"
              type="button"
              onClick={() => setTimeFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                timeFilter === 'ALL'
                  ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              All Records
            </button>
            <button
              id="filter-custom"
              type="button"
              onClick={() => setTimeFilter('CUSTOM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                timeFilter === 'CUSTOM'
                  ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Pick Day
            </button>
          </div>

          {/* Manager History Management Actions (Delete One Day / Delete All) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-open-delete-day"
              type="button"
              onClick={() => setShowDeleteDayModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-bold transition-colors cursor-pointer"
              title="Delete one specific day's records"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              Delete Day's History
            </button>

            <button
              id="btn-open-delete-all"
              type="button"
              onClick={() => setShowDeleteAllModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 text-zinc-600 border border-zinc-200 hover:bg-rose-600 hover:text-white hover:border-rose-600 text-xs font-bold transition-colors cursor-pointer"
              title="Wipe entire saved sales history"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Delete All Records
            </button>

            <button
              id="btn-refresh-sales"
              type="button"
              onClick={loadBillingData}
              className="p-2 rounded-xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors cursor-pointer"
              title="Refresh sales list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Custom date picker row when CUSTOM is selected */}
        {timeFilter === 'CUSTOM' && (
          <div className="flex items-center gap-3 pt-2 border-t border-zinc-100">
            <span className="text-xs font-semibold text-zinc-600">Select Specific Date:</span>
            <input
              id="input-custom-date"
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-xs text-zinc-400">
              Showing earnings and records exclusively for {customDate}
            </span>
          </div>
        )}
      </div>

      {/* Manager Earnings Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Gross Revenue */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-white border border-amber-200/80 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-bold mb-2">
            <span>TOTAL GROSS EARNINGS</span>
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-zinc-900 tracking-tight">
            {currencySymbol} {metrics.totalGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-zinc-500 flex items-center justify-between">
            <span>{metrics.count} sales registered</span>
            <span className="font-semibold text-amber-700">
              {timeFilter === 'DAY' ? 'Today' : timeFilter === 'WEEK' ? 'This Week' : timeFilter === 'MONTH' ? 'This Month' : timeFilter === 'CUSTOM' ? customDate : 'All Time'}
            </span>
          </div>
        </div>

        {/* Net Sales & Discounts */}
        <div className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-bold mb-2">
            <span>NET FOOD & BEVERAGE</span>
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-800 tracking-tight">
            {currencySymbol} {metrics.totalSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-zinc-500 flex items-center justify-between">
            <span>Discounts Allowed:</span>
            <span className="font-bold text-rose-600">
              -{currencySymbol} {metrics.totalDiscounts.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Taxes & Service Charges Collected */}
        <div className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-bold mb-2">
            <span>TAXES & CHARGES</span>
            <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
              <Percent className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-purple-900 tracking-tight">
            {currencySymbol} {metrics.totalTaxCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-zinc-500 flex items-center justify-between">
            <span>Govt VAT / Sales Tax</span>
            <span className="font-semibold text-purple-700">
              SC: {currencySymbol} {metrics.totalServiceCharge.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Average Order Value (AOV) */}
        <div className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-bold mb-2">
            <span>AVERAGE ORDER VALUE</span>
            <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
              <ShoppingBag className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-zinc-900 tracking-tight">
            {currencySymbol} {metrics.aov.toLocaleString()}
          </div>
          <div className="mt-2 text-xs text-zinc-500 flex items-center justify-between">
            <span>Transactions Count</span>
            <span className="font-bold text-zinc-700">{metrics.count} checks</span>
          </div>
        </div>
      </div>

      {/* Payment Methods Breakdown Strip */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">
            Payment Methods Breakdown
          </span>
          <span className="text-[11px] text-zinc-400">Calculated over current filter</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/60">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Cash</span>
            <p className="text-sm font-black text-zinc-800 mt-0.5">
              {currencySymbol} {(metrics.paymentCounts['CASH']?.total || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-zinc-400">
              {metrics.paymentCounts['CASH']?.count || 0} bills
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/60">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Card / POS</span>
            <p className="text-sm font-black text-zinc-800 mt-0.5">
              {currencySymbol} {(metrics.paymentCounts['CARD']?.total || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-zinc-400">
              {metrics.paymentCounts['CARD']?.count || 0} bills
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/60">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Fonepay / QR</span>
            <p className="text-sm font-black text-zinc-800 mt-0.5">
              {currencySymbol} {(metrics.paymentCounts['QR_CODE']?.total || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-zinc-400">
              {metrics.paymentCounts['QR_CODE']?.count || 0} bills
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/60">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Online Pay</span>
            <p className="text-sm font-black text-zinc-800 mt-0.5">
              {currencySymbol} {(metrics.paymentCounts['ONLINE']?.total || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-zinc-400">
              {metrics.paymentCounts['ONLINE']?.count || 0} bills
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/60 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Room Charge</span>
            <p className="text-sm font-black text-zinc-800 mt-0.5">
              {currencySymbol} {(metrics.paymentCounts['ROOM_CHARGE']?.total || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-zinc-400">
              {metrics.paymentCounts['ROOM_CHARGE']?.count || 0} bills
            </span>
          </div>

          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/60 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-rose-600 uppercase">Credit</span>
            <p className="text-sm font-black text-zinc-800 mt-0.5">
              {currencySymbol} {(metrics.paymentCounts['CREDIT']?.total || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-zinc-400">
              {metrics.paymentCounts['CREDIT']?.count || 0} bills
            </span>
          </div>
        </div>
      </div>

      {/* Sales Records Register Table */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
        {/* Table Filter Controls */}
        <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              id="search-sales"
              type="text"
              placeholder="Search invoice #, customer, table, item, or staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-zinc-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-zinc-500 font-semibold">Payment:</span>
            <select
              id="filter-payment-method"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-zinc-300 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Payment Types</option>
              <option value="CASH">Cash Only</option>
              <option value="CARD">Card / Machine</option>
              <option value="QR_CODE">QR Code (Fonepay)</option>
              <option value="ONLINE">Online Portal</option>
              <option value="ROOM_CHARGE">Room Charge</option>
              <option value="CREDIT">Credit</option>
            </select>
            <span className="text-xs font-bold text-zinc-400 px-1">
              ({filteredSales.length} records)
            </span>
            <button
              id="btn-preview-excel-table"
              type="button"
              onClick={() => handleOpenExcelPreview('filtered')}
              disabled={filteredSales.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              title="Preview and edit spreadsheet before downloading"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
              <span>Preview & Edit</span>
            </button>

            <button
              id="btn-export-excel-table"
              type="button"
              onClick={() => handleExportToExcel('filtered')}
              disabled={isExportingExcel || filteredSales.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              title="Download currently filtered records as Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .xlsx</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-12 text-center text-zinc-400 text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-600" />
            <span>Loading billing history and sales records...</span>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
              <Receipt className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm text-zinc-800">No Sales Records Found</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              {searchQuery || paymentFilter !== 'ALL' || timeFilter !== 'ALL'
                ? 'Try adjusting your filters or date selection to see other sales records.'
                : 'No sales have been recorded yet. Click "New POS Sale" or settle an active dine-in table order to create the first invoice!'}
            </p>
            <button
              type="button"
              onClick={() => setShowNewSaleModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Record First Sale
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200/80 bg-zinc-100/60 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Invoice # & Date</th>
                  <th className="py-3 px-4">Type / Table</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Items Summary</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-right">Subtotal</th>
                  <th className="py-3 px-4 text-right">Taxes & Charges</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredSales.map((sale) => {
                  const currentBillingFormat = business?.date_format_billing || user?.business?.date_format_billing || 'ENGLISH';
                  const saleDate = sale.created_at
                    ? renderFormattedDate(sale.created_at, currentBillingFormat)
                    : sale.date_string;

                  return (
                    <tr key={sale.id} className="hover:bg-zinc-50/80 transition-colors">
                      {/* Invoice & Date */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-zinc-900 block">
                          {sale.invoice_number}
                        </span>
                        <span className="text-[11px] text-zinc-400">{saleDate}</span>
                      </td>

                      {/* Type & Table */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            sale.sale_type === 'DINE_IN'
                              ? 'bg-amber-100 text-amber-800'
                              : sale.sale_type === 'TAKEAWAY'
                              ? 'bg-blue-100 text-blue-800'
                              : sale.sale_type === 'ROOM_SERVICE'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {sale.sale_type === 'DINE_IN' && '🍽️ '}
                          {sale.sale_type === 'TAKEAWAY' && '🛍️ '}
                          {sale.sale_type === 'ROOM_SERVICE' && '🛎️ '}
                          {sale.sale_type.replace('_', ' ')}
                        </span>
                        {sale.table_number && (
                          <span className="block text-[11px] font-semibold text-zinc-700 mt-0.5">
                            Table {sale.table_number}
                          </span>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-4">
                        <span className="font-semibold text-zinc-800 block">
                          {sale.customer_name || 'Walk-in Guest'}
                        </span>
                        {sale.customer_phone && (
                          <span className="text-[10px] text-zinc-400">
                            {sale.customer_phone}
                          </span>
                        )}
                      </td>

                      {/* Items Summary */}
                      <td className="py-3 px-4 max-w-xs">
                        <span className="text-zinc-600 truncate block">
                          {sale.items.map((i) => `${i.name} (x${i.quantity})`).join(', ')}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {sale.items.length} item(s) • Cashier: {sale.cashier_name}
                        </span>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-800 border border-zinc-200">
                          {sale.payment_method === 'CASH' && <DollarSign className="w-3 h-3 text-emerald-600" />}
                          {sale.payment_method === 'CARD' && <CreditCard className="w-3 h-3 text-blue-600" />}
                          {sale.payment_method === 'QR_CODE' && <QrCode className="w-3 h-3 text-purple-600" />}
                           {sale.payment_method === 'CREDIT' && <BookOpen className="w-3 h-3 text-rose-600" />}
                          {sale.payment_method === 'CREDIT' && sale.credit_gl_account_name ? `Credit — ${sale.credit_gl_account_name}` : sale.payment_method}
                        </span>
                      </td>

                      {/* Subtotal */}
                      <td className="py-3 px-4 text-right font-medium text-zinc-600">
                        {sale.currency} {sale.subtotal.toFixed(2)}
                      </td>

                      {/* Taxes */}
                      <td className="py-3 px-4 text-right">
                        <span className="font-semibold text-zinc-700 block">
                          +{sale.currency} {sale.total_tax.toFixed(2)}
                        </span>
                        {sale.service_charge > 0 && (
                          <span className="text-[10px] text-zinc-400">
                            (SC: {sale.currency} {sale.service_charge.toFixed(2)})
                          </span>
                        )}
                      </td>

                      {/* Grand Total */}
                      <td className="py-3 px-4 text-right">
                        <span className="font-black text-sm text-zinc-950 block">
                          {sale.currency} {sale.total_amount.toFixed(2)}
                        </span>
                        {sale.discount_amount > 0 && (
                          <div className="flex items-center justify-end gap-1 flex-wrap mt-0.5">
                            <span className="text-[10px] text-rose-600 font-semibold">
                              Disc: -{sale.currency} {sale.discount_amount.toFixed(2)}
                            </span>
                            {sale.promo_code && (
                              <span className="inline-flex items-center gap-0.5 px-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9px] font-mono font-bold">
                                <Tag className="w-2.5 h-2.5" />
                                {sale.promo_code}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View Receipt */}
                          <button
                            id={`btn-view-sale-${sale.id}`}
                            type="button"
                            onClick={() => setSelectedSaleForView(sale)}
                            className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer"
                            title="View / Print Receipt"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete individual record */}
                          <button
                            id={`btn-delete-sale-${sale.id}`}
                            type="button"
                            onClick={() => setSaleToDelete(sale)}
                            className="p-1.5 rounded-lg bg-zinc-100 hover:bg-rose-100 text-zinc-500 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Delete this sale record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-PAGE 3: GL ACCOUNTS & ERP MAPPINGS (OWNER CONFIGURABLE)               */}
      {/* ========================================================================= */}
      {activeSubTab === 'gl_accounts' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <GLAccountsTable
            businessId={business.id}
            glAccounts={glAccounts}
            onAccountsChange={setGlAccounts}
            isOwner={isOwner}
            onOpenExcelPreview={() => handleOpenExcelPreview('all')}
            showToast={(msg, type) => showStatus(msg, type === 'error' ? 'error' : 'success')}
          />
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

      {/* ========================================================================= */}
      {/* MODAL 4: DELETE ONE DAY'S HISTORY                                         */}
      {/* ========================================================================= */}
      {showDeleteDayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-zinc-200">
            <div className="flex items-center gap-3 text-rose-600">
              <span className="p-2.5 rounded-xl bg-rose-100">
                <Trash2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-base text-zinc-900">Delete Day's Sales History</h3>
                <p className="text-xs text-zinc-500">Remove all records generated on a specific date</p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              This action will permanently delete all sales and revenue records for the selected date from the database. This cannot be undone.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 block">
                Select Date to Clear:
              </label>
              <input
                id="input-delete-day-date"
                type="date"
                value={dayToDelete}
                onChange={(e) => setDayToDelete(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs space-y-1">
              <span className="text-zinc-500 font-semibold block">Day Summary:</span>
              <p className="text-zinc-800 font-bold">
                {sales.filter((s) => (s.date_string || s.created_at?.split('T')[0]) === dayToDelete).length} records found for {dayToDelete}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowDeleteDayModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-day"
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteDayHistory}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Confirm Delete Day
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: DELETE ENTIRE SALES HISTORY                                      */}
      {/* ========================================================================= */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-rose-200">
            <div className="flex items-center gap-3 text-rose-600">
              <span className="p-2.5 rounded-xl bg-rose-100">
                <ShieldAlert className="w-6 h-6 text-rose-600" />
              </span>
              <div>
                <h3 className="font-bold text-base text-rose-900">Delete ENTIRE Sales Records</h3>
                <p className="text-xs text-rose-600">Permanent data wipe operation</p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              Are you sure you want to completely erase all <strong>{sales.length}</strong> saved sales records and reset all revenue metrics? This will clear the entire transaction audit history.
            </p>

            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1.5">
              <p className="font-bold">To confirm this action, type "DELETE ALL" below:</p>
              <input
                id="input-delete-all-confirm"
                type="text"
                placeholder="DELETE ALL"
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-rose-300 text-xs font-mono font-bold text-rose-950 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteAllModal(false);
                  setDeleteAllConfirmText('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-all"
                type="button"
                disabled={deleteAllConfirmText !== 'DELETE ALL' || isDeleting}
                onClick={handleDeleteAllHistory}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer ${
                  deleteAllConfirmText === 'DELETE ALL' && !isDeleting
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Permanently Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: SINGLE SALE RECORD DELETE CONFIRMATION                           */}
      {/* ========================================================================= */}
      {saleToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 border border-zinc-200">
            <div className="flex items-center gap-3 text-rose-600">
              <span className="p-2.5 rounded-xl bg-rose-100">
                <Trash2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-base text-zinc-900">Delete Sale Record</h3>
                <p className="text-xs text-zinc-500">{saleToDelete.invoice_number}</p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              Are you sure you want to delete invoice <strong>{saleToDelete.invoice_number}</strong> for {saleToDelete.currency} {saleToDelete.total_amount.toFixed(2)}?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setSaleToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-single-sale"
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteSingleSale}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: LIVE INTERACTIVE EXCEL SPREADSHEET PREVIEW & EDITOR              */}
      {/* ========================================================================= */}
      {excelPreviewOpen && (
        <ExcelSheetPreviewModal
          isOpen={excelPreviewOpen}
          onClose={() => setExcelPreviewOpen(false)}
          initialSheets={excelPreviewSheets}
          businessName={business.name}
          filenamePrefix={excelPreviewPrefix}
        />
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
  user?: any;
  initialOrderId?: string;
  onClose: () => void;
  onSaleCreated: (sale: SaleRecord) => void;
  onGlAccountCreated: (acc: any) => void;
}

const NewSaleModal: React.FC<NewSaleModalProps> = ({
  business,
  tables,
  pendingOrders,
  taxConfig,
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
      name: 'Signature Chef Special',
      quantity: 1,
      price: 350,
      unit_price: 350,
      subtotal: 350,
      total_price: 350,
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

  // Line item manipulation
  const handleItemChange = (index: number, field: keyof SaleItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev];
      const target = { ...copy[index], [field]: val };
      if (field === 'quantity' || field === 'unit_price' || field === 'price') {
        const qty = Number(target.quantity) || 1;
        const price = Number(target.unit_price ?? target.price) || 0;
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
        name: 'Dish Item',
        quantity: 1,
        price: 200,
        unit_price: 200,
        subtotal: 200,
        total_price: 200,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 border border-zinc-200 max-h-[90vh] overflow-y-auto">
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

        {/* Basic Info: Sale Type, Table, Customer */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-zinc-700 block mb-1">Sale Type</label>
            <select
              id="select-sale-type"
              value={saleType}
              onChange={(e) => setSaleType(e.target.value as SaleType)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
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
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
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

          <div>
            <label className="text-xs font-bold text-zinc-700 block mb-1">
              Customer Name
            </label>
            <input
              id="input-sale-customer"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Guest name"
              className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500"
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
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500"
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
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500"
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

          <div className="border border-zinc-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-100 text-zinc-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2 px-3">Item Description</th>
                  <th className="py-2 px-3 w-20 text-center">Qty</th>
                  <th className="py-2 px-3 w-28 text-right">Price ({currency})</th>
                  <th className="py-2 px-3 w-28 text-right">Total ({currency})</th>
                  <th className="py-2 px-3 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                        placeholder="Dish name"
                        className="w-full px-2 py-1 rounded border border-zinc-200 font-medium text-xs focus:ring-1 focus:ring-amber-500"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleItemChange(idx, 'quantity', parseInt(e.target.value, 10) || 1)
                        }
                        className="w-16 px-2 py-1 rounded border border-zinc-200 text-center font-bold text-xs focus:ring-1 focus:ring-amber-500"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        min="0"
                        value={item.unit_price}
                        onChange={(e) =>
                          handleItemChange(idx, 'unit_price', parseFloat(e.target.value) || 0)
                        }
                        className="w-24 px-2 py-1 rounded border border-zinc-200 text-right font-bold text-xs focus:ring-1 focus:ring-amber-500"
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
// SUB-COMPONENT: RECEIPT SLIP MODAL
// ============================================================================

const formatPanVatDisplay = (cfg?: BusinessTaxConfig | null) => {
  if (!cfg) return null;
  const pfx = cfg.pan_vat_prefix?.trim();
  const num = cfg.pan_vat_number?.trim();
  if (pfx && num) return `${pfx} ${num}`;
  if (pfx && !num) return pfx;
  if (!pfx && num) {
    if (/^[A-Za-z]/.test(num)) return num;
    return `PAN / VAT #: ${num}`;
  }
  return null;
};

const formatDocumentTitleWithPrefix = (cfg?: BusinessTaxConfig | null, defaultTitle = 'TAX INVOICE') => {
  return cfg?.invoice_document_title?.trim() || defaultTitle;
};

const getInvoicePrefix = (cfg?: BusinessTaxConfig | null) => {
  return cfg?.invoice_prefix?.trim() || '';
};

interface ReceiptSlipModalProps {
  sale: SaleRecord;
  business: Business;
  taxConfig: BusinessTaxConfig | null;
  onClose: () => void;
}

const ReceiptSlipModal: React.FC<ReceiptSlipModalProps> = ({
  sale,
  business,
  taxConfig,
  onClose,
}) => {
  const { dispatchPrint, printers } = usePrinter();

  const handlePrint = async () => {
    await dispatchPrint('BILL', sale);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-zinc-200 max-h-[90vh] overflow-y-auto">
        {/* Actions Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 print:hidden">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            Invoice Preview
          </span>
          <div className="flex items-center gap-2">
            <button
              id="btn-print-receipt"
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

        {/* Printable Thermal Receipt Container */}
        <div className="bg-zinc-50/50 p-6 rounded-xl border border-zinc-200 font-mono text-xs text-zinc-800 space-y-4 shadow-inner">
          {/* Business Header */}
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
                {business.location || 'Main Dining & Hospitality Lounge'}
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

            {/* Document Title with Prefix Header Banner */}
            <div className="text-center py-0.5 my-1">
              <span className="font-black text-xs uppercase tracking-wider text-zinc-950 border-b border-dashed border-zinc-400 pb-0.5 inline-block">
                {formatDocumentTitleWithPrefix(taxConfig, 'TAX INVOICE')}
              </span>
            </div>
          </div>

          {/* Invoice Meta */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-zinc-500">{taxConfig?.invoice_prefix ? taxConfig.invoice_prefix + ' Invoice:' : 'Invoice No.:'}</span>
              <span className="font-bold text-zinc-900">{sale.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Date:</span>
              <span>{renderFormattedDate(sale.created_at, business?.date_format_billing || 'ENGLISH')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Customer:</span>
              <span className="font-bold">{sale.customer_name}</span>
            </div>
            {sale.table_number && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Table:</span>
                <span className="font-bold">Table {sale.table_number}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-zinc-500">Cashier:</span>
              <span>{sale.cashier_name}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-zinc-300 my-2" />

          {/* Items List */}
          <div className="space-y-1.5 text-[11px]">
            {sale.items.map((item, idx) => {
              const uPrice = item.unit_price ?? item.price ?? 0;
              const tPrice = item.total_price ?? item.subtotal ?? (uPrice * item.quantity);
              return (
                <div key={idx} className="flex justify-between items-start">
                  <div className="flex-1 pr-2">
                    <span className="font-bold">{item.name}</span>
                    <span className="text-[10px] text-zinc-500 block">
                      {item.quantity} x {sale.currency} {uPrice.toFixed(2)}
                    </span>
                  </div>
                  <span className="font-bold shrink-0">
                    {sale.currency} {tPrice.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="border-b border-dashed border-zinc-300 my-2" />

          {/* Calculations Breakdown */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal:</span>
              <span>
                {sale.currency} {sale.subtotal.toFixed(2)}
              </span>
            </div>

            {sale.taxes.map((t, tIdx) => (
              <div key={t.id || `${t.name}-${tIdx}`} className="flex justify-between text-zinc-600">
                <span>
                  {t.name} ({t.rate_percent}%):
                </span>
                <span>
                  +{sale.currency} {t.amount.toFixed(2)}
                </span>
              </div>
            ))}

            {sale.promo_code && sale.promo_discount && sale.promo_discount > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Promo Code ({sale.promo_code}):</span>
                <span>
                  -{sale.currency} {sale.promo_discount.toFixed(2)}
                </span>
              </div>
            )}

            {sale.discount_amount > 0 && (!sale.promo_code || (sale.discount_amount > (sale.promo_discount || 0))) && (
              <div className="flex justify-between text-rose-600">
                <span>
                  Discount{sale.discount_percent > 0 && !sale.promo_code ? ` (${sale.discount_percent}%)` : ''}:
                </span>
                <span>
                  -{sale.currency} {(sale.promo_code ? Math.max(0, sale.discount_amount - (sale.promo_discount || 0)) : sale.discount_amount).toFixed(2)}
                </span>
              </div>
            )}

            <div className="border-b border-zinc-800 pt-1 my-1" />

            <div className="flex justify-between text-sm font-black text-zinc-950">
              <span>TOTAL PAID:</span>
              <span>
                {sale.currency} {sale.total_amount.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
              <span>Payment Mode:</span>
              <span className="font-bold text-zinc-800">{sale.payment_method === 'CREDIT' && sale.credit_gl_account_name ? `Credit — ${sale.credit_gl_account_name}` : sale.payment_method}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-zinc-300 my-2" />

          {/* Receipt Footer */}
          <div className="text-center text-[10px] text-zinc-500 space-y-1 pt-1">
            <p className="font-semibold">
              {taxConfig?.receipt_footer_note || 'Thank you for your visit! Please dine with us again.'}
            </p>
            <p className="text-[9px] text-zinc-400">Powered by NamasteQR Restaurant POS Engine</p>
          </div>
        </div>
      </div>
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
