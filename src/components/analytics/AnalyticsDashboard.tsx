import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  Users, 
  ShoppingBag, 
  UtensilsCrossed, 
  Clock, 
  RefreshCw, 
  Award, 
  ArrowUpRight, 
  Filter, 
  CreditCard, 
  QrCode, 
  ChevronRight,
  Layers,
  Wallet,
  Sparkles
} from 'lucide-react';
import { rbacService } from '../../services/rbac.service';
import { socketService } from '../../services/socket.service';
import { useSyncedOperationsState } from '../../hooks/useSyncedOperationsState';
import { formatVenueDateStr, isSaleInRevenueWindow } from '../../utils/revenueWindow';
import { useAuth } from '../../context/AuthContext';
import { SaleRecord, MenuItem, TableOrder } from '../../types/rbac';
import { Business } from '../../types/auth';

interface AnalyticsDashboardProps {
  business?: Business;
  user?: any;
}

type TimeRange = 'today' | '7d' | '30d' | 'all';

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ business: propBusiness, user: propUser }) => {
  const { activeBusiness, user: authUser } = useAuth();
  const effectiveBusiness = propBusiness || activeBusiness || authUser?.business;
  const businessId = (effectiveBusiness?.id && effectiveBusiness.id !== 'default-business')
    ? effectiveBusiness.id
    : (authUser?.business?.id || propUser?.business?.id || propUser?.id || authUser?.id || '');
  const currencySymbol = effectiveBusiness?.currency || propUser?.business?.currency || authUser?.business?.currency || 'Rs.';

  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'food' | 'beverage'>('all');
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    date: string;
    revenue: number;
    orders: number;
    orderList: {
      id: string;
      invoice: string;
      time: string;
      table: string;
      amount: number;
      itemsSummary: string;
    }[];
  } | null>(null);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const touchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setHoveredPoint(null);
    setIsPinned(false);
  }, [timeRange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPinned(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchAnalyticsData = useCallback(async () => {
    if (!businessId || businessId === 'default-business') return;
    setLoading(true);
    try {
      const [salesData, menuData] = await Promise.all([
        rbacService.getSalesApi({}, businessId).catch((err) => {
          console.warn('Analytics getSalesApi failed:', err);
          return [];
        }),
        rbacService.getMenusApi(businessId).catch(() => []),
      ]);
      setSales(Array.isArray(salesData) ? salesData : []);
      setMenuItems(Array.isArray(menuData) ? menuData : []);
    } catch (err) {
      console.warn('Failed to load analytics data:', err);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchAnalyticsData();

    if (businessId && businessId !== 'default-business') {
      socketService.joinBusiness(businessId);
      const unsub = socketService.subscribeToOrders((order: any) => {
        if (order?.status === 'COMPLETED' || order?.payment_status === 'PAID') {
          fetchAnalyticsData();
        }
      });
      const interval = setInterval(fetchAnalyticsData, 15000);
      return () => {
        socketService.leaveBusiness(businessId);
        unsub();
        clearInterval(interval);
      };
    }
  }, [businessId, fetchAnalyticsData]);

  // Normalize date string (YYYY-MM-DD) prioritizing client local timezone from created_at
  const getSaleDateStr = (sale: SaleRecord): string => {
    if (sale.created_at) {
      try {
        const d = new Date(sale.created_at);
        if (!isNaN(d.getTime())) {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      } catch {}
    }
    if (sale.date_string && /^\d{4}-\d{2}-\d{2}$/.test(sale.date_string)) {
      return sale.date_string;
    }
    return '';
  };

  const { revenueWindow, opsConfig } = useSyncedOperationsState(
    businessId,
    effectiveBusiness?.operations_config,
    effectiveBusiness?.current_operational_day
  );

  // Filter sales based on chosen timeRange synchronized to active revenueWindow
  const filteredSales = useMemo(() => {
    const now = new Date();
    const d7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const d7Str = formatVenueDateStr(d7, opsConfig);

    const d30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const d30Str = formatVenueDateStr(d30, opsConfig);

    return sales.filter((sale) => {
      if (timeRange === 'today') {
        return isSaleInRevenueWindow(sale, revenueWindow);
      }

      const saleDateStr = getSaleDateStr(sale);
      if (timeRange === '7d') {
        return (
          (saleDateStr && saleDateStr >= d7Str) ||
          (sale.date_string && sale.date_string >= d7Str)
        );
      }
      if (timeRange === '30d') {
        return (
          (saleDateStr && saleDateStr >= d30Str) ||
          (sale.date_string && sale.date_string >= d30Str)
        );
      }
      return true;
    });
  }, [sales, timeRange, revenueWindow, opsConfig]);

  // Aggregate Key Performance Indicators
  const kpi = useMemo(() => {
    const totalRevenue = filteredSales.reduce((sum, s) => sum + (Number(s.total_amount || (s as any).grand_total) || 0), 0);
    const totalCustomers = filteredSales.length;
    const aov = totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;

    return {
      totalRevenue,
      totalCustomers,
      aov,
    };
  }, [filteredSales]);

  // Aggregate Most Popular Dishes
  const popularDishes = useMemo(() => {
    const dishMap = new Map<string, { name: string; category: string; quantity: number; revenue: number; isDrink: boolean }>();

    filteredSales.forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const itemName = (item.name || '').trim();
        if (!itemName) return;

        const cat = (item.category || '').toLowerCase();
        const isDrink = ['drink', 'beverage', 'bar', 'cocktail', 'beer', 'wine', 'juice', 'coffee', 'tea', 'soda', 'chiya', 'lassi'].some(
          (k) => cat.includes(k) || itemName.toLowerCase().includes(k)
        );

        const existing = dishMap.get(itemName) || {
          name: itemName,
          category: item.category || (isDrink ? 'Beverages' : 'Main Menu'),
          quantity: 0,
          revenue: 0,
          isDrink,
        };

        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;

        existing.quantity += qty;
        existing.revenue += qty * price;
        dishMap.set(itemName, existing);
      });
    });

    let list = Array.from(dishMap.values());

    if (categoryFilter === 'food') {
      list = list.filter((d) => !d.isDrink);
    } else if (categoryFilter === 'beverage') {
      list = list.filter((d) => d.isDrink);
    }

    list.sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
    return list.slice(0, 7);
  }, [filteredSales, categoryFilter]);

  const topDish = popularDishes[0] || null;
  const maxDishVolume = popularDishes[0]?.quantity || 1;

  // Aggregate Peak Dining Hours
  const hourlyRush = useMemo(() => {
    const buckets = {
      breakfast: { label: '08:00 AM – 11:00 AM', tag: 'Breakfast Rush', count: 0, color: 'bg-amber-500' },
      lunch: { label: '12:00 PM – 03:00 PM', tag: 'Lunch Peak', count: 0, color: 'bg-emerald-500' },
      snacks: { label: '03:00 PM – 06:00 PM', tag: 'Snacks & Tea', count: 0, color: 'bg-blue-500' },
      dinner: { label: '07:00 PM – 10:00 PM', tag: 'Dinner Rush', count: 0, color: 'bg-purple-500' },
    };

    filteredSales.forEach((sale) => {
      const d = new Date(sale.created_at);
      if (isNaN(d.getTime())) return;
      const hour = d.getHours();

      if (hour >= 8 && hour < 12) buckets.breakfast.count += 1;
      else if (hour >= 12 && hour < 16) buckets.lunch.count += 1;
      else if (hour >= 16 && hour < 19) buckets.snacks.count += 1;
      else if (hour >= 19 && hour <= 23) buckets.dinner.count += 1;
    });

    const total = Object.values(buckets).reduce((sum, b) => sum + b.count, 0) || 1;
    return {
      buckets,
      total,
    };
  }, [filteredSales]);

  // Aggregate Payment Channels Breakdown
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number; label: string; icon: any; color: string }> = {
      CASH: { count: 0, total: 0, label: 'Cash Payments', icon: DollarSign, color: 'bg-emerald-500' },
      CARD: { count: 0, total: 0, label: 'Card POS', icon: CreditCard, color: 'bg-blue-500' },
      QR_CODE: { count: 0, total: 0, label: 'Digital QR', icon: QrCode, color: 'bg-amber-500' },
      DEDUCT_FROM_DEPOSIT: { count: 0, total: 0, label: 'Deposit Clearing', icon: Wallet, color: 'bg-teal-500' },
      CREDIT: { count: 0, total: 0, label: 'Credit Ledger', icon: Layers, color: 'bg-purple-500' },
    };

    filteredSales.forEach((s) => {
      const m = s.payment_method || 'CASH';
      const key = (m === 'UPI_QR' || (m as string) === 'ONLINE') ? 'QR_CODE' : m in map ? m : 'CASH';
      map[key].count += 1;
      map[key].total += Number(s.total_amount || (s as any).grand_total) || 0;
    });

    return Object.values(map);
  }, [filteredSales]);

  // Build Time Series Data for SVG Spline Curve
  const chartData = useMemo(() => {
    type SlotType = {
      date: string;
      revenue: number;
      orders: number;
      orderList: {
        id: string;
        invoice: string;
        time: string;
        table: string;
        amount: number;
        itemsSummary: string;
      }[];
    };
    const daysMap = new Map<string, SlotType>();

    const buildOrderSummary = (s: SaleRecord) => {
      const d = new Date(s.created_at);
      const timeStr = !isNaN(d.getTime())
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
        : 'Recently';

      const tableStr = s.table_number
        ? (s.table_number.toLowerCase().includes('table') ? s.table_number : `Table ${s.table_number}`)
        : (s.sale_type === 'TAKEAWAY' || !s.table_id ? 'Takeaway' : 'Dine In');

      const invStr = s.invoice_number || s.order_number || (s.id ? `ORD-${s.id.slice(0, 6)}` : 'Order');
      const amount = Number(s.total_amount || (s as any).grand_total) || 0;

      let itemsSummary = '';
      if (Array.isArray(s.items) && s.items.length > 0) {
        itemsSummary = s.items
          .map((item) => (item.quantity && item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name))
          .join(', ');
      } else {
        itemsSummary = `${s.items?.length || 1} items`;
      }

      return {
        id: s.id || `${invStr}-${Math.random()}`,
        invoice: invStr,
        time: timeStr,
        table: tableStr,
        amount,
        itemsSummary,
      };
    };

    if (timeRange === 'today') {
      const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      hours.forEach((h) => daysMap.set(h, { date: h, revenue: 0, orders: 0, orderList: [] }));

      filteredSales.forEach((s) => {
        const d = new Date(s.created_at);
        if (isNaN(d.getTime())) return;
        const hr = d.getHours();
        const closest = hours.reduce((prev, curr) => {
          const currHr = parseInt(curr.split(':')[0], 10);
          const prevHr = parseInt(prev.split(':')[0], 10);
          return Math.abs(currHr - hr) < Math.abs(prevHr - hr) ? curr : prev;
        });
        const slot = daysMap.get(closest)!;
        const amt = Number(s.total_amount || (s as any).grand_total) || 0;
        slot.revenue += amt;
        slot.orders += 1;
        slot.orderList.push(buildOrderSummary(s));
      });
    } else {
      let spanDays = timeRange === '7d' ? 7 : 30;
      if (timeRange === 'all') {
        const earliestTime = filteredSales.reduce((min, s) => {
          const t = new Date(s.created_at).getTime();
          return isNaN(t) ? min : Math.min(min, t);
        }, Date.now());
        const diffDays = Math.max(7, Math.min(60, Math.ceil((Date.now() - earliestTime) / (1000 * 60 * 60 * 24)) + 1));
        spanDays = diffDays;
      }
      const now = new Date();

      for (let i = spanDays - 1; i >= 0; i--) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        const label = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        daysMap.set(dayStr, { date: label, revenue: 0, orders: 0, orderList: [] });
      }

      filteredSales.forEach((s) => {
        const sDay = getSaleDateStr(s);
        let slot = daysMap.get(sDay);
        if (!slot && s.date_string) {
          slot = daysMap.get(s.date_string);
        }
        if (slot) {
          const amt = Number(s.total_amount || (s as any).grand_total) || 0;
          slot.revenue += amt;
          slot.orders += 1;
          slot.orderList.push(buildOrderSummary(s));
        }
      });
    }

    return Array.from(daysMap.values());
  }, [filteredSales, timeRange]);

  // Compute SVG Curve Coordinates & Padding
  const svgWidth = 700;
  const svgHeight = 220;
  const padTop = 20;
  const padBottom = 28;
  const padLeft = 45;
  const padRight = 18;
  const usableHeight = svgHeight - padTop - padBottom;
  const usableWidth = svgWidth - padLeft - padRight;

  const maxRevenue = Math.max(...chartData.map((d) => d.revenue), 1000) * 1.15;

  const points = useMemo(() => {
    const n = chartData.length;
    if (n === 0) return [];

    return chartData.map((item, i) => {
      const x = n > 1 ? padLeft + (i / (n - 1)) * usableWidth : padLeft + usableWidth / 2;
      const y = svgHeight - padBottom - (item.revenue / maxRevenue) * usableHeight;
      return { x, y, ...item };
    });
  }, [chartData, maxRevenue, usableWidth, usableHeight]);

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

  // Format compact numbers for Y-axis scale markers
  const formatCompactVal = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${Math.round(num / 1000)}k`;
    return `${Math.round(num)}`;
  };

  const yTicks = [
    { y: padTop, label: formatCompactVal(maxRevenue) },
    { y: padTop + usableHeight * 0.5, label: formatCompactVal(maxRevenue * 0.5) },
    { y: svgHeight - padBottom, label: '0' },
  ];

  // Pick non-overlapping milestone dates for X-axis labels
  const xAxisTicks = useMemo(() => {
    const n = points.length;
    if (n === 0) return [];
    if (n <= 6) return points.map((p, idx) => ({ ...p, originalIndex: idx }));

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

  // Pointer & Touch Tracing Handler: Snaps to nearest point along the curve
  const handlePointerTrack = useCallback((clientX: number) => {
    if (isPinned) return; // Freeze tracking when pinned
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
  }, [points, svgWidth, isPinned]);

  const handlePointerLeave = () => {
    if (isPinned) return; // Keep tooltip visible when pinned
    setHoveredPoint(null);
  };

  const handleChartClick = (e: React.MouseEvent) => {
    // If clicked inside the tooltip card itself, don't toggle pin
    if ((e.target as HTMLElement).closest('.orders-tooltip-card')) return;

    if (isPinned) {
      setIsPinned(false);
    } else if (hoveredPoint) {
      setIsPinned(true);
    }
  };

  const handleTouchEnd = () => {
    if (isPinned) return;
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    touchTimeoutRef.current = setTimeout(() => {
      setHoveredPoint(null);
    }, 2500);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Banner & Time Range Switcher */}
      <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
              <TrendingUp className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-zinc-900">Analytics & Sales Intelligence</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Sync
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl leading-relaxed">
            Visual reports of gross sales trajectories, daily diner turnaround covers, and most popular kitchen dishes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl text-xs font-bold border border-zinc-200">
            <button
              type="button"
              onClick={() => setTimeRange('today')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === 'today' ? 'bg-white text-zinc-900 shadow-2xs font-extrabold' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === '7d' ? 'bg-white text-zinc-900 shadow-2xs font-extrabold' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === '30d' ? 'bg-white text-zinc-900 shadow-2xs font-extrabold' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === 'all' ? 'bg-white text-zinc-900 shadow-2xs font-extrabold' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              All Time
            </button>
          </div>

          <button
            type="button"
            onClick={fetchAnalyticsData}
            disabled={loading}
            className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 transition shadow-2xs cursor-pointer"
            title="Refresh Analytics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Bento Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-amber-300 transition">
          <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold">
            <span>Total Revenue</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-zinc-900 tracking-tight mt-1">
            {currencySymbol} {kpi.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1 font-medium">
            <span className="text-emerald-700 font-bold">Gross revenue</span> collected in selected timeframe
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition"></div>
        </div>

        {/* Total Diners / Customers Served */}
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-blue-300 transition">
          <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold">
            <span>Customers Served</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-zinc-900 tracking-tight mt-1">
            {kpi.totalCustomers} {kpi.totalCustomers === 1 ? 'Customer' : 'Customers'}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1 font-medium">
            Distinct dine-in bills & walk-in sales settled
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition"></div>
        </div>

        {/* Average Order Value (AOV) */}
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-purple-300 transition">
          <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold">
            <span>Average Ticket Spend</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700">
              <ShoppingBag className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-zinc-900 tracking-tight mt-1">
            {currencySymbol} {kpi.aov.toLocaleString()}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1 font-medium">
            Average customer tab expenditure
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/10 transition"></div>
        </div>

        {/* Most Popular Dish Card */}
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-amber-400 transition">
          <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold">
            <span>#1 Top Seller</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold flex items-center gap-1">
              <Award className="w-3 h-3 text-amber-700" /> Best Seller
            </span>
          </div>
          <div className="text-lg font-black text-zinc-900 truncate mt-1">
            {topDish ? topDish.name : 'Awaiting Orders'}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1 font-medium">
            {topDish ? (
              <>
                <span className="font-bold text-amber-700">{topDish.quantity} portions</span> ordered ({currencySymbol} {topDish.revenue.toFixed(0)})
              </>
            ) : (
              'Popular dishes will calculate live'
            )}
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/15 transition"></div>
        </div>
      </div>

      {/* Main Curvilinear Visual Chart: Sales Trajectory */}
      <div className="bg-white border border-zinc-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
          <div>
            <h3 className="text-base font-extrabold text-zinc-900 flex items-center gap-2">
              Sales Revenue Trajectory
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                Smooth Spline Area
              </span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Live trend of sales settlements and customer turnaround over the selected timeline.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold text-zinc-600">
            {hoveredPoint ? (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-300/80 px-3 py-1.5 rounded-xl shadow-2xs animate-in fade-in duration-150">
                <span className={`w-2.5 h-2.5 rounded-full bg-amber-500 ${isPinned ? 'ring-2 ring-amber-400' : 'animate-pulse'}`}></span>
                <span className="text-xs font-bold text-amber-950">
                  <span className="text-zinc-600 font-semibold">{hoveredPoint.date}:</span> {currencySymbol} {hoveredPoint.revenue.toLocaleString()}
                  <span className="text-amber-700/80 font-normal ml-1.5">({hoveredPoint.orders} {hoveredPoint.orders === 1 ? 'order' : 'orders'})</span>
                </span>
                {isPinned && (
                  <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded ml-1">
                    Pinned 📌
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-500 shadow-2xs"></span>
                  <span>Revenue ({currencySymbol})</span>
                </div>
                <span className="text-[11px] text-zinc-400 hidden sm:inline">• Hover or click to trace & pin</span>
              </div>
            )}
          </div>
        </div>

        {/* Responsive SVG Chart Canvas */}
        <div
          ref={chartContainerRef}
          className="relative w-full h-64 sm:h-72 select-none pt-2 touch-pan-y cursor-crosshair"
          onClick={handleChartClick}
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
              <p className="text-xs font-bold text-zinc-600">No sales recorded for this period yet</p>
              <p className="text-[11px]">When orders are settled at POS, visual curves render here.</p>
            </div>
          ) : (
            <svg
              className="w-full h-full overflow-visible"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="revenueAmberGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
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
                    fontSize="10"
                    fill="#94a3b8"
                    fontWeight="600"
                    className="select-none font-mono"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              {/* Area Gradient Fill */}
              {areaPath && <path fill="url(#revenueAmberGrad)" d={areaPath} />}

              {/* Spline Stroke Line */}
              {splinePath && (
                <path
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={splinePath}
                />
              )}

              {/* Subtle 2px Micro-Dots along the Spline */}
              {points.map((pt, idx) => {
                const isHovered = hoveredPoint && hoveredPoint.date === pt.date && hoveredPoint.revenue === pt.revenue;
                if (isHovered) return null; // Focus ring highlights it on hover
                return (
                  <circle
                    key={idx}
                    cx={pt.x}
                    cy={pt.y}
                    r={2.2}
                    fill="#d97706"
                    opacity={0.8}
                    className="transition-all"
                  />
                );
              })}

              {/* Interactive Crosshair & Highlight Focus Ring for Tracing */}
              {hoveredPoint && (
                <g className="pointer-events-none transition-opacity duration-150">
                  <line
                    x1={hoveredPoint.x}
                    y1={padTop}
                    x2={hoveredPoint.x}
                    y2={svgHeight - padBottom}
                    stroke="#d97706"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity="0.85"
                  />
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y}
                    r="9"
                    fill="#f59e0b"
                    fillOpacity="0.22"
                  />
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y}
                    r="5"
                    fill="#d97706"
                    stroke="#ffffff"
                    strokeWidth="2.2"
                  />
                </g>
              )}
            </svg>
          )}

          {/* Interactive Floating Tooltip with Individual Orders Breakdown */}
          {hoveredPoint && (
            <div
              className={`absolute z-30 bg-zinc-900/95 backdrop-blur-md text-white border border-amber-500/40 p-3.5 rounded-xl shadow-2xl text-xs w-72 sm:w-80 transition-transform duration-75 orders-tooltip-card ${
                isPinned ? 'pointer-events-auto ring-2 ring-amber-500/30' : 'pointer-events-none'
              }`}
              style={{
                left: `${(hoveredPoint.x / svgWidth) * 100}%`,
                top: `${(hoveredPoint.y / svgHeight) * 100}%`,
                transform: `${
                  (hoveredPoint.x / svgWidth) < 0.28
                    ? 'translateX(10px)'
                    : (hoveredPoint.x / svgWidth) > 0.72
                      ? 'translateX(-105%)'
                      : 'translateX(-50%)'
                } ${hoveredPoint.y < 80 ? 'translateY(14px)' : 'translateY(-112%)'}`,
              }}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-white text-xs">{hoveredPoint.date}</span>
                    {isPinned ? (
                      <span className="text-[9px] bg-amber-500/20 text-amber-400 font-bold px-1.5 py-0.2 rounded border border-amber-500/30">
                        Pinned 📌
                      </span>
                    ) : (
                      <span className="text-[9px] text-zinc-400 font-semibold bg-zinc-800 px-1.5 py-0.2 rounded">
                        {timeRange === 'today' ? 'Hourly' : 'Daily'}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 block font-normal mt-0.5">
                    {hoveredPoint.orders} {hoveredPoint.orders === 1 ? 'settled order' : 'settled orders'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-amber-400 font-black text-sm block">
                    {currencySymbol} {hoveredPoint.revenue.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Individual Orders List (capped with custom scrollbar) */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 select-text">
                {(!hoveredPoint.orderList || hoveredPoint.orderList.length === 0) ? (
                  <div className="text-[11px] text-zinc-500 italic py-2 text-center">
                    No settled orders for this timeline
                  </div>
                ) : (
                  hoveredPoint.orderList.map((order) => (
                    <div
                      key={order.id}
                      className="bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 rounded-lg p-2 transition text-left"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-amber-400 font-mono tracking-tight">{order.invoice}</span>
                        <span className="text-white font-black">{currencySymbol} {order.amount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1">
                        <span className="text-zinc-300 font-medium">{order.table} • {order.time}</span>
                        <span className="truncate max-w-[130px] text-zinc-400" title={order.itemsSummary}>
                          {order.itemsSummary}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer Indicator / Hint */}
              <div className="mt-2 pt-1.5 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400">
                <span>{isPinned ? 'Click chart or ESC to unpin' : 'Click point to pin & inspect'}</span>
                {isPinned && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPinned(false);
                    }}
                    className="text-amber-400 hover:text-amber-300 font-bold hover:underline cursor-pointer"
                  >
                    Unpin
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* X-Axis Labels - Responsive & Non-overlapping */}
        {points.length > 0 && (
          <div className="relative w-full h-6 pt-1 border-t border-zinc-100 select-none">
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
                  className="absolute top-1 text-[11px] font-semibold text-zinc-500 whitespace-nowrap"
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

      {/* Bottom Grid: Peak Dining Hours + Most Popular Dishes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Daily Customers & Peak Hours (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-zinc-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
                <Clock className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-extrabold text-zinc-900">Peak Dining Hours</h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
              Rush Distribution
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Hourly distribution of customer orders to help anticipate staffing and kitchen prep.
          </p>

          <div className="space-y-3.5 pt-1">
            {Object.entries(hourlyRush.buckets).map(([key, item]) => {
              const pct = Math.round((item.count / hourlyRush.total) * 100);
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-zinc-700">{item.label} ({item.tag})</span>
                    <span className="text-zinc-900">{pct}% ({item.count} orders)</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                      style={{ width: `${Math.max(pct, item.count > 0 ? 5 : 0)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payment Method Distribution */}
          <div className="pt-4 border-t border-zinc-100 space-y-3">
            <h4 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
              Payment Channels
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {paymentBreakdown.map((pm, i) => (
                <div key={i} className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/80">
                  <span className="text-[10px] font-bold text-zinc-500 block truncate">{pm.label}</span>
                  <div className="font-black text-zinc-900 mt-0.5 text-xs">
                    {currencySymbol} {pm.total.toFixed(0)}
                  </div>
                  <span className="text-[10px] text-zinc-400">{pm.count} bills</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Most Popular Dishes Leaderboard (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-zinc-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
                <UtensilsCrossed className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-zinc-900">Most Popular Dishes (Leaderboard)</h3>
                <p className="text-[11px] text-zinc-500">Ranked by order portions and revenue contribution</p>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  categoryFilter === 'all' ? 'bg-white text-zinc-900 shadow-2xs font-extrabold' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('food')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  categoryFilter === 'food' ? 'bg-white text-zinc-900 shadow-2xs font-extrabold' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Food
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('beverage')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  categoryFilter === 'beverage' ? 'bg-white text-zinc-900 shadow-2xs font-extrabold' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Drinks
              </button>
            </div>
          </div>

          {popularDishes.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 space-y-1">
              <UtensilsCrossed className="w-8 h-8 text-zinc-300 mx-auto" />
              <p className="text-xs font-bold text-zinc-600">No dish sales recorded yet</p>
              <p className="text-[11px]">When food and beverage items are ordered, rankings will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3 pt-1 max-h-[456px] overflow-y-auto pr-2 overscroll-contain">
              {popularDishes.map((dish, idx) => {
                const fillPct = Math.round((dish.quantity / maxDishVolume) * 100);
                return (
                  <div
                    key={idx}
                    className="p-3 bg-zinc-50/80 hover:bg-zinc-100/80 rounded-xl border border-zinc-200/90 transition-all space-y-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-md text-[11px] font-black flex items-center justify-center shrink-0 ${
                            idx === 0
                              ? 'bg-amber-500 text-zinc-950 shadow-2xs'
                              : idx === 1
                              ? 'bg-zinc-700 text-white'
                              : idx === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-zinc-200 text-zinc-600'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-extrabold text-zinc-900 truncate block">
                            {dish.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-medium">
                            {dish.category}
                          </span>
                        </div>
                        {idx === 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                            #1 Top Pick
                          </span>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-extrabold text-zinc-900">
                          {currencySymbol} {dish.revenue.toLocaleString()}
                        </div>
                        <div className="text-[10px] font-bold text-amber-700">
                          {dish.quantity} {dish.quantity === 1 ? 'portion' : 'portions'}
                        </div>
                      </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          idx === 0
                            ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                            : 'bg-zinc-400 group-hover:bg-amber-500'
                        }`}
                        style={{ width: `${Math.max(fillPct, 5)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
