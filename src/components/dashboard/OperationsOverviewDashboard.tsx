import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ShoppingBag, 
  UtensilsCrossed, 
  Calendar, 
  CreditCard, Banknote, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Users, 
  ChefHat, 
  QrCode, 
  Receipt, 
  SlidersHorizontal,
  ChevronDown,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Lock,
  DollarSign,
  BookOpen
} from 'lucide-react';
import { rbacService } from '../../services/rbac.service';
import { Business } from '../../types/auth';
import { SaleRecord, StaffAccountSession } from '../../types/rbac';

interface OperationsOverviewDashboardProps {
  business: Business;
  user: any;
  staffSession: StaffAccountSession | null;
  onNavigateTab: (tab: any) => void;
  onOpenRoleModal: () => void;
  timeFilter?: 'today' | 'week' | 'month';
  onChangeTimeFilter?: (f: 'today' | 'week' | 'month') => void;
  daybookFilter?: string;
}

export const OperationsOverviewDashboard: React.FC<OperationsOverviewDashboardProps> = ({
  business,
  user,
  staffSession,
  onNavigateTab,
  onOpenRoleModal,
  timeFilter = 'today',
  onChangeTimeFilter,
  daybookFilter = 'all',
}) => {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);

  const currency = business?.currency || 'Rs';

  useEffect(() => {
    let isMounted = true;
    setLoadingSales(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate: Date;
    const endDate = new Date();
    
    if (timeFilter === 'today') {
      startDate = new Date(today);
    } else if (timeFilter === 'week') {
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
    } else {
      startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - 1);
    }

    rbacService.getSalesApi({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }, business.id)
      .then((data) => {
        if (isMounted) {
          setSales(data || []);
        }
      })
      .catch((err) => {
        console.warn('Could not load overview sales:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingSales(false);
      });

    return () => {
      isMounted = false;
    };
  }, [business.id, timeFilter]);

  // Aggregate metrics
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (daybookFilter === 'all') return true;
      if (daybookFilter === 'dine_in') return s.sale_type === 'DINE_IN' || !s.sale_type;
      if (daybookFilter === 'delivery') return s.sale_type === 'DELIVERY';
      if (daybookFilter === 'takeaway') return s.sale_type === 'TAKEAWAY' || s.sale_type === 'QUICK_POS';
      return true;
    });
  }, [sales, daybookFilter]);

  const stats = useMemo(() => {
    const totalSalesAmount = filteredSales.reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const dineInAmount = filteredSales
      .filter((s) => s.sale_type === 'DINE_IN' || !s.sale_type)
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const deliveryAmount = filteredSales
      .filter((s) => s.sale_type === 'DELIVERY')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const takeawayAmount = filteredSales
      .filter((s) => s.sale_type === 'TAKEAWAY' || s.sale_type === 'QUICK_POS')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);

    // Customer spend calculation
    const customerMap: Record<string, number> = {};
    filteredSales.forEach((s) => {
      const cust = s.customer_name || 'Walk-in Guest';
      customerMap[cust] = (customerMap[cust] || 0) + (Number(s.total_amount) || 0);
    });

    const cashSales = filteredSales
      .filter((s) => (s.payment_method || '').toUpperCase() === 'CASH')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const cardSales = filteredSales
      .filter((s) => (s.payment_method || '').toUpperCase() === 'CARD')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const qrSales = filteredSales
      .filter((s) => { const pm = (s.payment_method || '').toUpperCase(); return pm === 'QR_CODE' || pm === 'UPI_QR'; })
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const creditSales = filteredSales
      .filter((s) => (s.payment_method || '').toUpperCase() === 'CREDIT')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);

    return {
      totalSales: totalSalesAmount,
      dineIn: dineInAmount,
      delivery: deliveryAmount,
      takeaway: takeawayAmount,
      cashSales,
      cardSales,
      qrSales,
      creditSales,
      customerCount: Object.keys(customerMap).length || 0,
    };
  }, [sales]);

  // Hover & Touch Tracing state
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; date: string; revenue: number; orders: number } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const touchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setHoveredPoint(null);
  }, [timeFilter]);

  // Aggregate Time-Series Data for Spline
  const chartPointsData = useMemo(() => {
    const now = new Date();
    let minTime = new Date(now).setHours(0, 0, 0, 0);
    let maxTime = new Date(now).setHours(23, 59, 59, 999);
    let bucketCount = 10;

    if (timeFilter === 'week') {
      minTime = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      maxTime = now.getTime();
      bucketCount = 8;
    } else if (timeFilter === 'month') {
      minTime = now.getTime() - 30 * 24 * 60 * 60 * 1000;
      maxTime = now.getTime();
      bucketCount = 12;
    }

    const bucketSize = (maxTime - minTime) / bucketCount;
    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const bStartTime = minTime + i * bucketSize;
      const bEndTime = bStartTime + bucketSize;
      const midTime = new Date(bStartTime + bucketSize / 2);

      let dateLabel = '';
      if (timeFilter === 'today') {
        dateLabel = midTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      } else {
        dateLabel = midTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }

      return {
        startTime: bStartTime,
        endTime: bEndTime,
        date: dateLabel,
        revenue: 0,
        orders: 0,
      };
    });

    filteredSales.forEach((s) => {
      const t = new Date(s.created_at).getTime();
      if (t >= minTime && t <= maxTime) {
        let idx = Math.floor((t - minTime) / bucketSize);
        if (idx >= bucketCount) idx = bucketCount - 1;
        if (idx >= 0 && buckets[idx]) {
          buckets[idx].revenue += Number(s.total_amount || (s as any).grand_total) || 0;
          buckets[idx].orders += 1;
        }
      }
    });

    return buckets;
  }, [filteredSales, timeFilter]);

  // SVG Coordinates & Usable Dimensions
  const svgWidth = 600;
  const svgHeight = 200;
  const padTop = 18;
  const padBottom = 26;
  const padLeft = 52;
  const padRight = 16;
  const usableWidth = svgWidth - padLeft - padRight;
  const usableHeight = svgHeight - padTop - padBottom;

  const maxRevenue = Math.max(...chartPointsData.map((d) => d.revenue), 100) * 1.15;
  const roundedMax = Math.ceil(maxRevenue / 100) * 100;

  // Format compact numbers for Y-axis scale markers
  const formatCompactVal = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${Math.round(num / 1000)}k`;
    return `${Math.round(num)}`;
  };

  const yTicks = [
    { y: padTop, label: formatCompactVal(roundedMax) },
    { y: padTop + usableHeight * 0.25, label: formatCompactVal(roundedMax * 0.75) },
    { y: padTop + usableHeight * 0.5, label: formatCompactVal(roundedMax * 0.5) },
    { y: padTop + usableHeight * 0.75, label: formatCompactVal(roundedMax * 0.25) },
    { y: svgHeight - padBottom, label: '0' },
  ];

  const points = useMemo(() => {
    const n = chartPointsData.length;
    if (n === 0) return [];

    return chartPointsData.map((item, i) => {
      const x = n > 1 ? padLeft + (i / (n - 1)) * usableWidth : padLeft + usableWidth / 2;
      const y = svgHeight - padBottom - (item.revenue / roundedMax) * usableHeight;
      return { x, y, ...item };
    });
  }, [chartPointsData, roundedMax, usableWidth, usableHeight]);

  // Cubic Bezier Spline Builder
  const splinePath = useMemo(() => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const mx = (p0.x + p1.x) / 2;
      d += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  }, [points]);

  const areaPath = useMemo(() => {
    if (!splinePath || points.length === 0) return '';
    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const baseY = svgHeight - padBottom;
    return `${splinePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [splinePath, points, svgHeight, padBottom]);

  // Non-overlapping X-axis milestone labels (5 milestones)
  const xAxisTicks = useMemo(() => {
    const n = points.length;
    if (n === 0) return [];
    if (n <= 5) return points.map((p, idx) => ({ ...p, originalIndex: idx }));

    const targetCount = 5;
    const indices = new Set<number>();
    indices.add(0);
    indices.add(n - 1);
    for (let step = 1; step < targetCount - 1; step++) {
      const idx = Math.round((step / (targetCount - 1)) * (n - 1));
      indices.add(idx);
    }
    const sortedIndices = Array.from(indices).sort((a, b) => a - b);
    return sortedIndices.map((idx) => ({ ...points[idx], originalIndex: idx }));
  }, [points]);

  // Pointer & Touch Tracing Handler
  const handlePointerTrack = useCallback((clientX: number) => {
    if (!points.length || !chartContainerRef.current) return;
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
    const rect = chartContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relativeX = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, relativeX / rect.width));
    const targetSvgX = pct * svgWidth;

    let closest = points[0];
    let minDiff = Math.abs(points[0].x - targetSvgX);
    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(points[i].x - targetSvgX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = points[i];
      }
    }
    setHoveredPoint(closest);
  }, [points, svgWidth]);

  const handlePointerLeave = () => {
    setHoveredPoint(null);
  };

  const handleTouchEnd = () => {
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    touchTimeoutRef.current = setTimeout(() => {
      setHoveredPoint(null);
    }, 2500);
  };

  const isViewOnly = !staffSession && !user;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* View-Only Mode Guidance Banner */}
      {isViewOnly && (
        <div 
          id="banner-view-only-prompt" 
          className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200/90 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-900">
                You are currently in View-Only Mode
              </h3>
              <p className="text-[11px] text-zinc-600 mt-0.5 leading-relaxed">
                Log in with your designated Staff PIN or credentials to perform live KDS, table management, and counter POS billing.
              </p>
            </div>
          </div>

          <button
            id="btn-login-for-tasks"
            type="button"
            onClick={onOpenRoleModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0 shadow-xs cursor-pointer transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Staff / Role Sign-In</span>
          </button>
        </div>
      )}

      {/* TOP ROW: 5 KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Card 1: Sales */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                $
              </span>
              Sales
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-base sm:text-lg font-black text-zinc-900">
              {currency} {stats.totalSales.toLocaleString()}
            </div>
            <p className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5 mt-0.5">
              <span>↑</span> Live revenue
            </p>
          </div>
        </div>

        {/* Card 2: Cash Sales */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-[10px] font-bold">
                <Banknote className="w-3 h-3" />
              </span>
              Cash Sales
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-base sm:text-lg font-black text-zinc-900">
              {currency} {stats.cashSales?.toLocaleString()}
            </div>
            <p className="text-[10px] font-semibold text-zinc-400 mt-0.5">
              Cash payments
            </p>
          </div>
        </div>

        {/* Card 3: Card Sales */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                <CreditCard className="w-3 h-3" />
              </span>
              Card Sales
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-base sm:text-lg font-black text-zinc-900">
              {currency} {stats.cardSales?.toLocaleString()}
            </div>
            <p className="text-[10px] font-semibold text-zinc-400 mt-0.5">
              Card POS settlement
            </p>
          </div>
        </div>

        {/* Card 4: QR Sales */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-[10px] font-bold">
                <QrCode className="w-3 h-3" />
              </span>
              QR Sales
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-base sm:text-lg font-black text-zinc-900">
              {currency} {stats.qrSales?.toLocaleString()}
            </div>
            <p className="text-[10px] font-semibold text-zinc-400 mt-0.5">
              Digital QR / UPI
            </p>
          </div>
        </div>

        {/* Card 5: Credit Sales */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center text-[10px] font-bold">
                <BookOpen className="w-3 h-3" />
              </span>
              Credit Sales
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-base sm:text-lg font-black text-zinc-900">
              {currency} {stats.creditSales?.toLocaleString()}
            </div>
            <p className="text-[10px] font-semibold text-zinc-400 mt-0.5">
              Credit ledger account
            </p>
          </div>
        </div>
      </div>
      {/* MIDDLE ROW: Sales Breakdown + Sales Overview Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Sales & Service Category Breakdown (4 cols) */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-zinc-900">Sales</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live Channels
              </span>
            </div>

            <div className="mt-3">
              <div className="text-2xl font-black text-zinc-950">
                {currency} {stats.totalSales.toLocaleString()}
              </div>
              <div className="text-xs font-bold text-zinc-400 mt-0.5">
                Total Sales
              </div>
            </div>

            {/* Sparkline wave */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                ↑ 121.07%
              </span>
              <span className="text-xs text-zinc-400">up by this month</span>
              <svg className="w-24 h-6 text-emerald-500 stroke-current shrink-0 ml-auto" fill="none" viewBox="0 0 100 24">
                <path d="M0 20 Q 25 5, 50 18 T 100 4" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>

            {/* Channels List */}
            <div className="mt-6 space-y-3.5 pt-4 border-t border-zinc-100">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-zinc-700 font-semibold">
                  <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs">
                    🛎️
                  </span>
                  <span>Dine In Service</span>
                </div>
                <span className="font-extrabold text-zinc-900">
                  {currency} {stats.dineIn.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-zinc-700 font-semibold">
                  <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs">
                    🛵
                  </span>
                  <span>Delivery Services</span>
                </div>
                <span className="font-extrabold text-zinc-900">
                  {currency} {stats.delivery.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-zinc-700 font-semibold">
                  <span className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-xs">
                    🛍️
                  </span>
                  <span>Takeaway Services</span>
                </div>
                <span className="font-extrabold text-zinc-900">
                  {currency} {stats.takeaway.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => onNavigateTab('billing')}
              className="w-full py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Open POS Register</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Sales Overview Graph (8 cols) */}
        <div className="lg:col-span-8 bg-white p-5 sm:p-6 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-extrabold text-zinc-900 flex items-center gap-2">
                  Sales Overview
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Smooth Spline
                  </span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Here is a live overview of your sales transactions
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Traced Stat Live Readout */}
                {hoveredPoint ? (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl shadow-2xs animate-in fade-in duration-150">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                    <span className="text-xs font-bold text-blue-950">
                      <span className="text-zinc-600 font-semibold">{hoveredPoint.date}:</span> {currency} {hoveredPoint.revenue.toLocaleString()}
                      <span className="text-blue-700/80 font-normal ml-1.5">({hoveredPoint.orders} {hoveredPoint.orders === 1 ? 'order' : 'orders'})</span>
                    </span>
                  </div>
                ) : (
                  <span className="text-[11px] text-zinc-400 hidden sm:inline mr-1">• Hover or drag to trace</span>
                )}

                <div className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 bg-zinc-50 hover:bg-zinc-100 transition-colors cursor-pointer">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  <select
                    value={timeFilter}
                    onChange={(e) => onChangeTimeFilter ? onChangeTimeFilter(e.target.value as any) : undefined}
                    className="appearance-none bg-transparent outline-none pr-4 cursor-pointer text-zinc-700 font-bold"
                  >
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-3 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Responsive SVG Smooth Spline Canvas */}
            <div
              ref={chartContainerRef}
              className="mt-4 relative h-60 sm:h-64 w-full select-none touch-pan-y cursor-crosshair pt-1"
              onMouseMove={(e) => handlePointerTrack(e.clientX)}
              onMouseLeave={handlePointerLeave}
              onTouchStart={(e) => {
                if (e.touches && e.touches[0]) handlePointerTrack(e.touches[0].clientX);
              }}
              onTouchMove={(e) => {
                if (e.touches && e.touches[0]) handlePointerTrack(e.touches[0].clientX);
              }}
              onTouchEnd={handleTouchEnd}
            >
              {points.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400">
                  <TrendingUp className="w-8 h-8 text-zinc-300 mb-1" />
                  <p className="text-xs font-bold text-zinc-600">No sales transactions for this period</p>
                </div>
              ) : (
                <svg
                  className="w-full h-full overflow-visible"
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="dashboardSalesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Dotted Grid lines & Y-Axis Scale Markers */}
                  {yTicks.map((tick, idx) => (
                    <g key={idx}>
                      <line
                        x1={padLeft}
                        y1={tick.y}
                        x2={svgWidth - padRight}
                        y2={tick.y}
                        stroke={idx === yTicks.length - 1 ? "#cbd5e1" : "#f1f5f9"}
                        strokeDasharray={idx === yTicks.length - 1 ? undefined : "4 4"}
                        strokeWidth={idx === yTicks.length - 1 ? "1.5" : "1"}
                      />
                      <text
                        x={padLeft - 8}
                        y={tick.y + 3.5}
                        textAnchor="end"
                        fontSize="9.5"
                        fill="#94a3b8"
                        fontWeight="600"
                        className="select-none font-mono"
                      >
                        {currency} {tick.label}
                      </text>
                    </g>
                  ))}

                  {/* Area Gradient Fill */}
                  {areaPath && <path fill="url(#dashboardSalesGrad)" d={areaPath} />}

                  {/* Spline Stroke Line */}
                  {splinePath && (
                    <path
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={splinePath}
                    />
                  )}

                  {/* Data Points on the Spline */}
                  {points.map((pt, idx) => {
                    const isHovered = hoveredPoint && hoveredPoint.date === pt.date && hoveredPoint.revenue === pt.revenue;
                    const dotRadius = points.length > 10 ? 3 : 4;
                    return (
                      <circle
                        key={idx}
                        cx={pt.x}
                        cy={pt.y}
                        r={isHovered ? 6 : dotRadius}
                        fill="#ffffff"
                        stroke="#2563eb"
                        strokeWidth={isHovered ? 2.5 : 2}
                        className="cursor-pointer transition-all"
                        onClick={() => setHoveredPoint(pt)}
                      />
                    );
                  })}

                  {/* Interactive Crosshair & Highlight for Tracing */}
                  {hoveredPoint && (
                    <g className="pointer-events-none transition-opacity duration-150">
                      <line
                        x1={hoveredPoint.x}
                        y1={padTop}
                        x2={hoveredPoint.x}
                        y2={svgHeight - padBottom}
                        stroke="#2563eb"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        opacity="0.8"
                      />
                      <circle
                        cx={hoveredPoint.x}
                        cy={hoveredPoint.y}
                        r="9"
                        fill="#3b82f6"
                        fillOpacity="0.25"
                      />
                      <circle
                        cx={hoveredPoint.x}
                        cy={hoveredPoint.y}
                        r="5.5"
                        fill="#2563eb"
                        stroke="#ffffff"
                        strokeWidth="2.5"
                      />
                    </g>
                  )}
                </svg>
              )}

              {/* Interactive Floating Tooltip */}
              {hoveredPoint && (
                <div
                  className="absolute pointer-events-none z-20 bg-zinc-900/95 backdrop-blur-md text-white border border-blue-500/40 px-3.5 py-2.5 rounded-xl shadow-xl text-xs transition-transform duration-75"
                  style={{
                    left: `${(hoveredPoint.x / svgWidth) * 100}%`,
                    top: `${(hoveredPoint.y / svgHeight) * 100}%`,
                    transform: `${
                      (hoveredPoint.x / svgWidth) < 0.22
                        ? 'translateX(0)'
                        : (hoveredPoint.x / svgWidth) > 0.78
                          ? 'translateX(-100%)'
                          : 'translateX(-50%)'
                    } ${hoveredPoint.y < 65 ? 'translateY(12px)' : 'translateY(-110%)'}`,
                  }}
                >
                  <div className="font-extrabold text-zinc-300 border-b border-zinc-800 pb-1 mb-1.5 flex items-center justify-between gap-4">
                    <span>{hoveredPoint.date}</span>
                    <span className="text-[10px] text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded">
                      {timeFilter === 'today' ? 'Hourly' : 'Daily'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-blue-400 font-black text-sm">
                    <span className="text-zinc-400 text-xs font-medium">Revenue:</span>
                    <span>{currency} {hoveredPoint.revenue.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-zinc-400 text-[11px] font-semibold mt-0.5">
                    <span>Settlements:</span>
                    <span className="text-zinc-200">{hoveredPoint.orders} {hoveredPoint.orders === 1 ? 'order' : 'orders'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* X-Axis Milestone Labels */}
            {points.length > 0 && (
              <div className="relative w-full h-5 mt-1 border-t border-zinc-100 select-none">
                {xAxisTicks.map((tick, i) => {
                  const isFirst = i === 0;
                  const isLast = i === xAxisTicks.length - 1;
                  const leftPct = (tick.x / svgWidth) * 100;
                  let transform = 'translateX(-50%)';
                  if (isFirst) transform = 'translateX(0)';
                  else if (isLast) transform = 'translateX(-100%)';

                  return (
                    <span
                      key={tick.originalIndex}
                      className="absolute top-1 text-[10px] font-mono text-zinc-400 whitespace-nowrap"
                      style={{
                        left: `${leftPct}%`,
                        transform,
                      }}
                    >
                      {tick.date}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-zinc-100 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              Peak Service: 7:00 PM – 8:45 PM Dine-in Rush
            </span>
            <span className="font-semibold text-zinc-700">
              Avg Bill Turnaround: 24 mins
            </span>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Top Customers + Fast Operations Launchpad */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Top Customers */}
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-2xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-zinc-900">Top Customers</h4>
              <p className="text-[11px] text-zinc-400">Customers By Spend</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Spending</span>
              <div className="text-sm font-black text-zinc-900 mt-0.5">
                {currency} {stats.totalSales.toLocaleString()}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Guests</span>
              <div className="text-sm font-black text-zinc-900 mt-0.5">
                {stats.customerCount} Guests
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('checkins')}
            className="w-full mt-4 py-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 transition flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>View Tables & QR</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Card 3: Fast Operations Launchpad */}
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-extrabold text-sm text-zinc-900">Operational Hub</h4>
              <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Fast Actions
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mb-3">
              Direct access to live kitchen stations, menu pricing, table QR codes, and system settings.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab('kds')}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-amber-50 hover:border-amber-300 text-left transition cursor-pointer"
              >
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5 text-amber-600" />
                  KDS Orders
                </div>
                <div className="text-[10px] text-zinc-400">Live Kitchen</div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('billing')}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-amber-50 hover:border-amber-300 text-left transition cursor-pointer"
              >
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  POS Counter
                </div>
                <div className="text-[10px] text-zinc-400">Checkout</div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('menus')}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-amber-50 hover:border-amber-300 text-left transition cursor-pointer"
              >
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-amber-600" />
                  Catalog
                </div>
                <div className="text-[10px] text-zinc-400">Menu items</div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('configurations')}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-amber-50 hover:border-amber-300 text-left transition cursor-pointer"
              >
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                  Tax & ERP
                </div>
                <div className="text-[10px] text-zinc-400">Configuration</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
