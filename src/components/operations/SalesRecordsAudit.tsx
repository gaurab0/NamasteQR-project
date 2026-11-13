import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Trash2,
  ShieldAlert,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Percent,
  ShoppingBag,
  Search,
  Receipt,
  Eye,
  CreditCard,
  QrCode,
  BookOpen,
  Tag,
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-react';
import { SaleRecord, SalesTimeFilter, GLAccountLink, BusinessTaxConfig, CompRecord } from '../../types/rbac';
import { Business } from '../../types/auth';
import { rbacService } from '../../services/rbac.service';
import { useSyncedOperationsState } from '../../hooks/useSyncedOperationsState';
import { formatVenueDateStr, isSaleInRevenueWindow } from '../../utils/revenueWindow';
import { renderFormattedDate } from '../../utils/dateFormatter';
import { exportSalesToExcel, buildSalesWorkbookData, ExcelSheetData } from '../../utils/excelExport';
import { ExcelSheetPreviewModal } from '../billing/ExcelSheetPreviewModal';
import { ReceiptSlipModal } from '../billing/ReceiptSlipModal';

export interface SalesRecordsAuditProps {
  business: Business;
  user?: any;
  sales: SaleRecord[];
  glAccounts: GLAccountLink[];
  taxConfig: BusinessTaxConfig | null;
  loading?: boolean;
  onRefreshSales: () => Promise<void> | void;
  onSalesChange: React.Dispatch<React.SetStateAction<SaleRecord[]>>;
}

export const SalesRecordsAudit: React.FC<SalesRecordsAuditProps> = ({
  business,
  user,
  sales,
  glAccounts,
  taxConfig,
  loading = false,
  onRefreshSales,
  onSalesChange,
}) => {
  const [timeFilter, setTimeFilter] = useState<SalesTimeFilter>('ALL');
  const [customDate, setCustomDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  // Excel Preview & Export State
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [excelPreviewOpen, setExcelPreviewOpen] = useState<boolean>(false);
  const [excelPreviewSheets, setExcelPreviewSheets] = useState<ExcelSheetData[]>([]);
  const [excelPreviewPrefix, setExcelPreviewPrefix] = useState<string>('Sales_Register');

  // Deletion Modals State
  const [showDeleteDayModal, setShowDeleteDayModal] = useState<boolean>(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState<boolean>(false);
  const [saleToDelete, setSaleToDelete] = useState<SaleRecord | null>(null);
  const [selectedSaleForView, setSelectedSaleForView] = useState<SaleRecord | null>(null);
  const [dayToDelete, setDayToDelete] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4500);
  };

  const currencySymbol = taxConfig?.currency_symbol || taxConfig?.currency || 'Rs.';
  const currentBillingFormat = business?.date_format_billing || user?.business?.date_format_billing || 'ENGLISH';

  const { revenueWindow, opsConfig } = useSyncedOperationsState(
    business?.id,
    business?.operations_config,
    business?.current_operational_day
  );

  // Date ranges
  const todayStr = revenueWindow.businessDate;
  const weekRange = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.getFullYear(), now.getMonth(), diffToMonday);
    const sunday = new Date(now.getFullYear(), now.getMonth(), diffToMonday + 6);
    return {
      start: formatVenueDateStr(monday, opsConfig),
      end: formatVenueDateStr(sunday, opsConfig),
    };
  }, [todayStr, opsConfig]);

  const monthRange = useMemo(() => {
    const [y, m] = todayStr.split('-').map(Number);
    const start = formatVenueDateStr(new Date(y, m - 1, 1), opsConfig);
    const end = formatVenueDateStr(new Date(y, m, 0), opsConfig);
    return { start, end };
  }, [todayStr, opsConfig]);

  // Filtered sales
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate =
        sale.date_string ||
        (sale.created_at ? formatVenueDateStr(new Date(sale.created_at), opsConfig) : '');

      if (timeFilter === 'DAY') {
        if (!isSaleInRevenueWindow(sale, revenueWindow)) return false;
      } else if (timeFilter === 'WEEK') {
        if (saleDate < weekRange.start || saleDate > weekRange.end) return false;
      } else if (timeFilter === 'MONTH') {
        if (saleDate < monthRange.start || saleDate > monthRange.end) return false;
      } else if (timeFilter === 'CUSTOM') {
        if (saleDate !== customDate) return false;
      }

      if (paymentFilter !== 'ALL') {
        if (sale.payment_method !== paymentFilter) return false;
      }

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

  // Key metrics
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

  // Excel handlers
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
        // non-fatal
      }
      const sheets = buildSalesWorkbookData(dataToExport, glAccounts, currencySymbol, compRecords);
      setExcelPreviewSheets(sheets);
      setExcelPreviewPrefix(prefix);
      setExcelPreviewOpen(true);
    } catch (err: any) {
      console.error('Failed to open Excel preview:', err);
      showStatus(err.message || 'Failed to prepare Excel preview.', 'error');
    }
  };

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
        // non-fatal
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

  // Delete handlers
  const handleDeleteSingleSale = async () => {
    if (!saleToDelete) return;
    try {
      setIsDeleting(true);
      await rbacService.deleteSaleApi(saleToDelete.id, business.id);
      onSalesChange((prev) => prev.filter((s) => s.id !== saleToDelete.id));
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
      onSalesChange((prev) => prev.filter((s) => (s.date_string || s.created_at?.split('T')[0]) !== dayToDelete));
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
      onSalesChange([]);
      showStatus(`Cleared entire sales history (${res.deletedCount} records deleted).`);
      setShowDeleteAllModal(false);
      setDeleteAllConfirmText('');
    } catch (err: any) {
      showStatus(err.message || 'Failed to clear sales history.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Toast Feedback */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-2xs animate-in slide-in-from-top-1 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="p-1 hover:bg-black/5 rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
            id="btn-preview-excel-spreadsheet-main"
            type="button"
            onClick={() => handleOpenExcelPreview('filtered')}
            disabled={sales.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Preview and edit spreadsheet before downloading"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            <span>Preview & Edit Excel (.xlsx)</span>
          </button>

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
              onClick={onRefreshSales}
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
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
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

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
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
                : 'No sales records currently match the criteria.'}
            </p>
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
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {sale.sale_type === 'DINE_IN' && '🍽️ '}
                          {sale.sale_type === 'TAKEAWAY' && '🛍️ '}
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
                          {sale.items.map((i) => {
                            const compQty = Number(i.comp_qty) || 0;
                            if (compQty > 0) {
                              const isComp = Boolean(i.is_comp || compQty >= i.quantity);
                              return `${i.name} (${isComp ? 'COMP' : `x${i.quantity - compQty} + ${compQty} COMP`})`;
                            }
                            return `${i.name} (x${i.quantity})`;
                          }).join(', ')}
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

      {/* Delete Day Modal */}
      {showDeleteDayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 border border-zinc-200">
            <div className="flex items-center gap-3 text-rose-600">
              <span className="p-2.5 rounded-xl bg-rose-100">
                <Trash2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-base text-zinc-900">Delete Day's History</h3>
                <p className="text-xs text-zinc-500">Purge one specific date of records</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 block">
                Select Date to Wipe:
              </label>
              <input
                id="input-delete-day"
                type="date"
                value={dayToDelete}
                onChange={(e) => setDayToDelete(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
              />
            </div>

            <p className="text-[11px] text-zinc-500 leading-relaxed">
              This action cannot be undone. All sales invoices recorded on <strong>{dayToDelete}</strong> will be permanently wiped.
            </p>

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

      {/* Delete All Modal */}
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

      {/* Single Record Delete Modal */}
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

      {/* View Receipt Slip Modal */}
      {selectedSaleForView && (
        <ReceiptSlipModal
          sale={selectedSaleForView}
          business={business}
          taxConfig={taxConfig}
          onClose={() => setSelectedSaleForView(null)}
        />
      )}

      {/* Excel Sheet Preview Modal */}
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

