import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  Lock,
  Search,
  UserCheck,
} from 'lucide-react';
import type { Business, BusinessOperatingHours } from '../../types/auth';
import type { CashierRegisterSession, SaleRecord } from '../../types/rbac';
import type { RevenueDayWindow } from '../../utils/revenueWindow';
import { rbacService } from '../../services/rbac.service';
import {
  buildCashierSalesSheet,
  type CashierSheetDateMode,
} from '../../utils/cashierSalesSheet';
import { exportCashierSalesSheetToPdf } from '../../utils/cashierSalesPdf';

interface CashierSalesSheetProps {
  business: Business;
  sales: SaleRecord[];
  initialSessions: CashierRegisterSession[];
  availableCashiers: Array<{ id: string; name: string }>;
  isManagerOrOwner: boolean;
  activeCashier: { id?: string; name?: string; email?: string };
  revenueWindow: RevenueDayWindow;
  opsConfig?: BusinessOperatingHours | null;
  currencySymbol: string;
}

const fmtCellAmount = (val: number): string => {
  if (!val) return '0';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const fmtTotalAmount = (val: number): string =>
  val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const CashierSalesSheet: React.FC<CashierSalesSheetProps> = ({
  business,
  sales,
  initialSessions,
  availableCashiers,
  isManagerOrOwner,
  activeCashier,
  revenueWindow,
  opsConfig,
  currencySymbol,
}) => {
  const [dateMode, setDateMode] = useState<CashierSheetDateMode>('TODAY');
  const [dateValue, setDateValue] = useState<string>(revenueWindow.businessDate);
  const [startDate, setStartDate] = useState<string>(revenueWindow.businessDate);
  const [endDate, setEndDate] = useState<string>(revenueWindow.businessDate);
  const [selectedCashierId, setSelectedCashierId] = useState<string>(
    isManagerOrOwner ? 'ALL' : activeCashier.id || 'SELF'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sessions, setSessions] = useState<CashierRegisterSession[]>(initialSessions);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(false);

  // Keep cashier scope locked when role switches to Cashier, and reset stale IDs when returning to Manager/Owner
  useEffect(() => {
    if (!isManagerOrOwner) {
      setSelectedCashierId(activeCashier.id || 'SELF');
    } else if (selectedCashierId === 'SELF') {
      setSelectedCashierId('ALL');
    }
  }, [isManagerOrOwner, activeCashier.id]);

  // Keep Today default date synced when revenueWindow rolls over
  useEffect(() => {
    setDateValue((prev) => prev || revenueWindow.businessDate);
    setStartDate((prev) => prev || revenueWindow.businessDate);
    setEndDate((prev) => prev || revenueWindow.businessDate);
  }, [revenueWindow.businessDate]);

  // Sync initialSessions for TODAY when parent reloads
  useEffect(() => {
    if (dateMode === 'TODAY' && initialSessions.length > 0) {
      setSessions(initialSessions);
    }
  }, [dateMode, initialSessions]);

  // Fetch matching CashierRegisterSession records from backend
  useEffect(() => {
    if (!business.id) return;
    let cancelled = false;
    setLoadingSessions(true);

    const apiOptions =
      dateMode === 'TODAY'
        ? {
            dateString: revenueWindow.businessDate,
            cashierId: isManagerOrOwner ? selectedCashierId : activeCashier.id,
          }
        : dateMode === 'DATE'
        ? {
            dateString: dateValue,
            cashierId: isManagerOrOwner ? selectedCashierId : activeCashier.id,
          }
        : dateMode === 'RANGE'
        ? {
            startDate,
            endDate,
            cashierId: isManagerOrOwner ? selectedCashierId : activeCashier.id,
          }
        : {
            allDates: true,
            cashierId: isManagerOrOwner ? selectedCashierId : activeCashier.id,
          };

    rbacService
      .getAllCashierSessionsApi(business.id, apiOptions)
      .then((fetched) => {
        if (!cancelled) {
          setSessions(Array.isArray(fetched) ? fetched : []);
        }
      })
      .catch(() => {
        if (!cancelled && dateMode === 'TODAY') {
          setSessions(initialSessions);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    business.id,
    dateMode,
    dateValue,
    startDate,
    endDate,
    selectedCashierId,
    isManagerOrOwner,
    activeCashier.id,
    revenueWindow.businessDate,
  ]);

  // Also enrich cashier list from fetched sessions + sales
  const cashierOptions = useMemo(() => {
    const map = new Map<string, string>();
    availableCashiers.forEach((c) => map.set(c.id, c.name));
    sessions.forEach((s) => {
      if (s.cashier_id && !map.has(s.cashier_id)) {
        map.set(s.cashier_id, s.cashier_name || 'Cashier');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [availableCashiers, sessions]);

  // Prevent <select> from falling back visually to "All Cashiers" while state holds an unlisted ID
  useEffect(() => {
    if (
      isManagerOrOwner &&
      !loadingSessions &&
      selectedCashierId !== 'ALL' &&
      !cashierOptions.some((c) => c.id === selectedCashierId)
    ) {
      setSelectedCashierId('ALL');
    }
  }, [isManagerOrOwner, loadingSessions, selectedCashierId, cashierOptions]);

  const effectiveCashierObj = useMemo(() => {
    if (!isManagerOrOwner) {
      return {
        id: activeCashier.id || 'SELF',
        name: activeCashier.name || (activeCashier.email ? activeCashier.email.split('@')[0] : 'Cashier'),
        email: activeCashier.email,
      };
    }
    if (selectedCashierId === 'ALL') {
      return { id: 'ALL', name: 'All Cashiers' };
    }
    const found = cashierOptions.find((c) => c.id === selectedCashierId);
    return {
      id: selectedCashierId,
      name: found?.name || 'Cashier',
      email: selectedCashierId === activeCashier.id ? activeCashier.email : undefined,
    };
  }, [isManagerOrOwner, selectedCashierId, cashierOptions, activeCashier]);

  const sheetData = useMemo(() => {
    return buildCashierSalesSheet(sales, sessions, {
      cashierId: effectiveCashierObj.id,
      cashierName: effectiveCashierObj.name,
      cashierEmail: effectiveCashierObj.email,
      dateMode,
      dateValue,
      startDate,
      endDate,
      revenueWindow,
      opsConfig,
      searchQuery,
    });
  }, [
    sales,
    sessions,
    effectiveCashierObj,
    dateMode,
    dateValue,
    startDate,
    endDate,
    revenueWindow,
    opsConfig,
    searchQuery,
  ]);

  const periodLabel = useMemo(() => {
    if (dateMode === 'TODAY') return `Today (${revenueWindow.businessDate})`;
    if (dateMode === 'DATE') return `Date: ${dateValue}`;
    if (dateMode === 'RANGE') return `${startDate || '...'} to ${endDate || '...'}`;
    return 'All Time';
  }, [dateMode, revenueWindow.businessDate, dateValue, startDate, endDate]);

  const fileDateTag = useMemo(() => {
    if (dateMode === 'TODAY') return revenueWindow.businessDate;
    if (dateMode === 'DATE') return dateValue;
    if (dateMode === 'RANGE') return `${startDate}_to_${endDate}`;
    return 'All_Time';
  }, [dateMode, revenueWindow.businessDate, dateValue, startDate, endDate]);

  const handleDownloadPdf = () => {
    exportCashierSalesSheetToPdf(sheetData, {
      businessName: business.name || 'Restaurant',
      cashierLabel: effectiveCashierObj.name,
      periodLabel,
      currencySymbol,
      fileDateTag,
    });
  };

  const { rows, summary } = sheetData;

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Toolbar & Controls */}
      <div className="bg-white rounded-2xl border border-zinc-200/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-zinc-900">
                Cashier Sales Sheet
              </h3>
              <p className="text-[11px] text-zinc-500">
                Excel-style per-cashier settlement ledger • {rows.length} bill{rows.length === 1 ? '' : 's'} • {periodLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Cashier Selector / Locked Badge */}
            {isManagerOrOwner ? (
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-zinc-500" />
                <select
                  id="cashier-sheet-cashier-select"
                  value={selectedCashierId}
                  onChange={(e) => setSelectedCashierId(e.target.value)}
                  className="text-xs font-semibold bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-1.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="ALL">All Cashiers</option>
                  {cashierOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.id === activeCashier.id ? '(You)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-xs font-bold text-zinc-700">
                <Lock className="w-3.5 h-3.5 text-zinc-500" />
                Your Shift Sheet: {effectiveCashierObj.name}
              </span>
            )}

            {/* One-Click PDF Download */}
            <button
              id="btn-download-cashier-sales-pdf"
              type="button"
              onClick={handleDownloadPdf}
              disabled={loadingSessions}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{loadingSessions ? 'Loading...' : 'Download PDF'}</span>
            </button>
          </div>
        </div>

        {/* Date Mode & Search Row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-zinc-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-zinc-400 mr-0.5" />
            {(
              [
                { id: 'TODAY', label: 'Today' },
                { id: 'DATE', label: 'Specific Date' },
                { id: 'RANGE', label: 'Date Range' },
                { id: 'ALL', label: 'All Time' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDateMode(opt.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  dateMode === opt.id
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}

            {dateMode === 'DATE' && (
              <input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="ml-1 text-xs font-semibold border border-zinc-300 rounded-lg px-2.5 py-1 bg-white text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            )}

            {dateMode === 'RANGE' && (
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStartDate(val);
                    if (val && endDate && val > endDate) {
                      setEndDate(val);
                    }
                  }}
                  className="text-xs font-semibold border border-zinc-300 rounded-lg px-2 py-1 bg-white text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <span className="text-xs text-zinc-400 font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEndDate(val);
                    if (val && startDate && val < startDate) {
                      setStartDate(val);
                    }
                  }}
                  className="text-xs font-semibold border border-zinc-300 rounded-lg px-2 py-1 bg-white text-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice, table, guest, item..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-300 rounded-xl bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Excel-Style Spreadsheet Grid */}
      <div className="bg-white rounded-2xl border border-zinc-300 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[68vh]">
          <table className="w-full border-collapse text-xs text-zinc-900">
            <thead className="sticky top-0 z-10 bg-zinc-900 text-white">
              <tr>
                <th className="border border-zinc-700 px-2.5 py-2 text-center font-bold w-10">#</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-left font-bold whitespace-nowrap">Invoice #</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-left font-bold whitespace-nowrap">Table #</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-left font-bold min-w-[210px]">Item</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-left font-bold whitespace-nowrap">Guest Name</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-center font-bold whitespace-nowrap">Time</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-center font-bold whitespace-nowrap">DATE</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-right font-bold whitespace-nowrap">Discount</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-right font-bold whitespace-nowrap">Cash</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-right font-bold whitespace-nowrap">QR</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-right font-bold whitespace-nowrap">Card</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-right font-bold whitespace-nowrap">Credit</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-right font-bold whitespace-nowrap">Deduct from Deposit</th>
                <th className="border border-zinc-700 px-2.5 py-2 text-right font-bold whitespace-nowrap bg-zinc-800">Day End Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={14}
                    className="border border-zinc-300 px-4 py-10 text-center text-zinc-500 text-xs"
                  >
                    No settled bills found for <strong>{effectiveCashierObj.name}</strong> ({periodLabel}).
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr
                    key={row.saleId}
                    className={`${
                      row.isComp
                        ? 'bg-amber-50/50'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-zinc-50/70'
                    } hover:bg-amber-50/40 transition-colors`}
                  >
                    <td className="border border-zinc-300 px-2 py-1.5 text-center font-mono text-zinc-500 bg-zinc-100/70">
                      {row.sn}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 font-mono font-semibold whitespace-nowrap">
                      {row.invoiceNumber}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 whitespace-nowrap">
                      {row.tableNumber}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 leading-snug">
                      <span>{row.itemsText}</span>
                      {row.isComp && (
                        <span className="ml-1.5 inline-block px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-200 text-amber-900">
                          COMP
                        </span>
                      )}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 whitespace-nowrap">
                      {row.guestName}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 text-center font-mono whitespace-nowrap">
                      {row.timeText}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 text-center font-mono whitespace-nowrap">
                      {row.dateText}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 text-right font-mono tabular-nums text-zinc-700">
                      {fmtCellAmount(row.discount)}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                      {fmtCellAmount(row.cash)}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                      {fmtCellAmount(row.qr)}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                      {fmtCellAmount(row.card)}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                      {fmtCellAmount(row.credit)}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                      {fmtCellAmount(row.deductFromDeposit)}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-1.5 text-right font-mono tabular-nums font-bold bg-zinc-50">
                      {fmtTotalAmount(row.dayEndTotal)}
                    </td>
                  </tr>
                ))
              )}

              {/* Summary Row 1: Total */}
              <tr className="bg-zinc-100 font-bold text-zinc-900">
                <td className="border border-zinc-300 px-2 py-2 bg-zinc-200/70" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2 text-left font-black uppercase tracking-wide text-[11px]">
                  Total
                </td>
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2 text-right font-mono tabular-nums">
                  {fmtTotalAmount(summary.totalDiscount)}
                </td>
                <td className="border border-zinc-300 px-2.5 py-2 text-right font-mono tabular-nums">
                  {fmtTotalAmount(summary.totalCash)}
                </td>
                <td className="border border-zinc-300 px-2.5 py-2 text-right font-mono tabular-nums">
                  {fmtTotalAmount(summary.totalQr)}
                </td>
                <td className="border border-zinc-300 px-2.5 py-2 text-right font-mono tabular-nums">
                  {fmtTotalAmount(summary.totalCard)}
                </td>
                <td className="border border-zinc-300 px-2.5 py-2 text-right font-mono tabular-nums">
                  {fmtTotalAmount(summary.totalCredit)}
                </td>
                <td className="border border-zinc-300 px-2.5 py-2 text-right font-mono tabular-nums">
                  {fmtTotalAmount(summary.totalDeductFromDeposit)}
                </td>
                <td className="border border-zinc-300 px-2.5 py-2 text-right font-mono tabular-nums font-black bg-zinc-200/80">
                  {currencySymbol} {fmtTotalAmount(summary.dayEndTotal)}
                </td>
              </tr>

              {/* Summary Row 2: Opening Cash */}
              <tr className="bg-amber-50 font-bold text-amber-950">
                <td className="border border-zinc-300 px-2 py-2 bg-zinc-200/70" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2 text-left font-black uppercase tracking-wide text-[11px]">
                  Opening Cash
                </td>
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2 text-right font-mono tabular-nums">
                  {fmtTotalAmount(summary.openingCash)}
                </td>
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
                <td className="border border-zinc-300 px-2.5 py-2" />
              </tr>

              {/* Summary Row 3: Cash Total */}
              <tr className="bg-emerald-50 font-black text-emerald-900">
                <td className="border border-zinc-300 px-2 py-2.5 bg-zinc-200/70" />
                <td className="border border-zinc-300 px-2.5 py-2.5" />
                <td className="border border-zinc-300 px-2.5 py-2.5" />
                <td className="border border-zinc-300 px-2.5 py-2.5 text-left uppercase tracking-wide text-[11px]">
                  Cash Total
                </td>
                <td className="border border-zinc-300 px-2.5 py-2.5" />
                <td className="border border-zinc-300 px-2.5 py-2.5" />
                <td className="border border-zinc-300 px-2.5 py-2.5" />
                <td className="border border-zinc-300 px-2.5 py-2.5" />
                <td className="border border-zinc-300 px-2.5 py-2.5 text-right font-mono tabular-nums text-sm">
                  {currencySymbol} {fmtTotalAmount(summary.cashTotal)}
                </td>
                <td className="border border-zinc-300 px-2.5 py-2.5" />
                <td className="border border-zinc-300 px-2.5 py-2.5" />
                <td className="border border-zinc-300 px-2.5 py-2.5" />
                <td className="border border-zinc-300 px-2.5 py-2.5" />
                <td className="border border-zinc-300 px-2.5 py-2.5" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
